import logging
from dataclasses import dataclass, field
from collections.abc import Callable
from typing import TypedDict

from langgraph.graph import END, START, StateGraph

from app.models.enums import FileType
from app.worker.frame_sampler import sample_frames
from app.worker.llm_client import generate_minutes
from app.worker.stt_client import transcribe_audio
from app.worker.vlm_client import analyze_image, fallback_visual

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class AgentInputFile:
    id: int
    file_type: FileType
    path: str | None
    mime_type: str | None
    file_name: str | None

    @property
    def is_image(self) -> bool:
        return self.file_type == FileType.image or (self.mime_type or "").startswith(
            "image/",
        )


@dataclass(frozen=True)
class MeetingSnapshot:
    """Plain, session-independent view of a meeting's processing inputs.

    Built by the pipeline while a DB session is open, then handed to the agent
    so the (slow, network-bound) graph run never holds an ORM session open.
    """

    meeting_id: int
    title: str
    input_files: list[AgentInputFile]
    memo_texts: list[str]
    # Timeline memos carry their in-meeting offset for chronological alignment.
    timed_memos: list[dict]


@dataclass
class VisualAgentResult:
    payload: dict
    source_file_id: int | None
    image_path: str | None


@dataclass
class MeetingAgentState:
    meeting_id: int
    title: str
    audio_files: list[AgentInputFile] = field(default_factory=list)
    screen_files: list[AgentInputFile] = field(default_factory=list)
    image_files: list[AgentInputFile] = field(default_factory=list)
    document_files: list[AgentInputFile] = field(default_factory=list)
    memo_texts: list[str] = field(default_factory=list)
    transcript: dict = field(default_factory=dict)
    transcript_for_minutes: str = ""
    visual_results: list[VisualAgentResult] = field(default_factory=list)
    visual_summary: str = ""
    timeline_text: str = ""
    minutes: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    node_trace: list[str] = field(default_factory=list)


class AgentGraphState(TypedDict, total=False):
    meeting_id: int
    title: str
    audio_files: list[AgentInputFile]
    screen_files: list[AgentInputFile]
    image_files: list[AgentInputFile]
    document_files: list[AgentInputFile]
    memo_texts: list[str]
    transcript: dict
    transcript_for_minutes: str
    visual_results: list[VisualAgentResult]
    visual_summary: str
    timeline_text: str
    minutes: dict
    warnings: list[str]
    node_trace: list[str]


class MeetingAgent:
    """LangGraph-backed meeting processing agent.

    The RQ worker still owns DB status/result persistence, while LangGraph owns
    deterministic orchestration, branching, and validation state. The agent
    operates purely on a session-independent MeetingSnapshot.
    """

    def __init__(
        self,
        snapshot: MeetingSnapshot,
        on_node_complete: Callable[[str], None] | None = None,
    ):
        self.snapshot = snapshot
        self.on_node_complete = on_node_complete
        self.state = self.to_dataclass(self.initial_state())
        self.graph = self.build_graph()

    def run(self) -> MeetingAgentState:
        result = self.graph.invoke(self.initial_state())
        self.state = self.to_dataclass(result)
        return self.state

    def initial_state(self) -> AgentGraphState:
        return {
            "meeting_id": self.snapshot.meeting_id,
            "title": self.snapshot.title,
            "audio_files": [],
            "screen_files": [],
            "image_files": [],
            "document_files": [],
            "memo_texts": [],
            "transcript": {},
            "transcript_for_minutes": "",
            "visual_results": [],
            "visual_summary": "",
            "timeline_text": "",
            "minutes": {},
            "warnings": [],
            "node_trace": [],
        }

    def build_graph(self):
        graph = StateGraph(AgentGraphState)
        graph.add_node("load_inputs", self.load_inputs)
        graph.add_node("process_audio", self.process_audio)
        graph.add_node("process_visuals", self.process_visuals)
        graph.add_node("skip_visuals", self.skip_visuals)
        graph.add_node("align_timeline", self.align_timeline)
        graph.add_node("generate_minutes", self.generate_minutes)
        graph.add_node("validate_outputs", self.validate_outputs)

        graph.add_edge(START, "load_inputs")
        graph.add_edge("load_inputs", "process_audio")
        graph.add_conditional_edges(
            "process_audio",
            self.route_visual_processing,
            {
                "visuals": "process_visuals",
                "skip_visuals": "skip_visuals",
            },
        )
        graph.add_edge("process_visuals", "align_timeline")
        graph.add_edge("skip_visuals", "align_timeline")
        graph.add_edge("align_timeline", "generate_minutes")
        graph.add_edge("generate_minutes", "validate_outputs")
        graph.add_edge("validate_outputs", END)

        return graph.compile()

    def load_inputs(self, state: AgentGraphState) -> AgentGraphState:
        audio_files: list[AgentInputFile] = []
        screen_files: list[AgentInputFile] = []
        image_files: list[AgentInputFile] = []
        document_files: list[AgentInputFile] = []

        for input_file in self.snapshot.input_files:
            if input_file.file_type == FileType.audio:
                audio_files.append(input_file)
            elif input_file.file_type == FileType.screen_recording:
                screen_files.append(input_file)
            elif input_file.is_image:
                image_files.append(input_file)
            elif input_file.file_type in {FileType.document, FileType.attachment}:
                document_files.append(input_file)

        return {
            "audio_files": audio_files,
            "screen_files": screen_files,
            "image_files": image_files,
            "document_files": document_files,
            "memo_texts": list(self.snapshot.memo_texts),
            "node_trace": self.complete_node(state, "load_inputs"),
        }

    def process_audio(self, state: AgentGraphState) -> AgentGraphState:
        # Prefer a dedicated audio file; fall back to the screen recording's
        # audio. Tag the transcript with its source track so it is persisted
        # with the correct TranscriptType (audio vs screen_audio).
        audio_path = self.first_path(state.get("audio_files", []))
        if audio_path:
            track = "audio"
        else:
            audio_path = self.first_path(state.get("screen_files", []))
            track = "screen_audio" if audio_path else "audio"

        transcript = transcribe_audio(audio_path)
        transcript["track"] = track
        status = transcript.get("status")

        if status in {"mock", "developing", "error"}:
            warning = (
                "음성 전사 중 오류가 발생해 전사 텍스트는 회의 요약 입력에서 제외했습니다."
                if status == "error"
                else "STT는 개발 중입니다. mock 전사 문장은 회의 요약 입력에서 제외했습니다."
            )
            return {
                "transcript": transcript,
                "transcript_for_minutes": "",
                "warnings": [*state.get("warnings", []), warning],
                "node_trace": self.complete_node(state, "process_audio"),
            }

        return {
            "transcript": transcript,
            "transcript_for_minutes": str(transcript.get("content") or ""),
            "node_trace": self.complete_node(state, "process_audio"),
        }

    def route_visual_processing(self, state: AgentGraphState) -> str:
        if state.get("image_files") or state.get("screen_files"):
            return "visuals"
        return "skip_visuals"

    def skip_visuals(self, state: AgentGraphState) -> AgentGraphState:
        visual = fallback_visual(reason="image_input_missing")
        return {
            "visual_results": [
                VisualAgentResult(
                    payload=visual,
                    source_file_id=None,
                    image_path=None,
                ),
            ],
            "visual_summary": visual["summary"],
            "warnings": [
                *state.get("warnings", []),
                "이미지 입력이 없어 VLM 분석 노드는 건너뛰었습니다.",
            ],
            "node_trace": self.complete_node(state, "skip_visuals"),
        }

    def process_visuals(self, state: AgentGraphState) -> AgentGraphState:
        visual_results: list[VisualAgentResult] = []
        warnings = list(state.get("warnings", []))

        for image_file in state.get("image_files", []):
            try:
                visual = analyze_image(image_file.path)
            except Exception as error:  # noqa: BLE001 - isolate per-image failure.
                logger.warning(
                    "Visual analysis failed for file %s: %s", image_file.id, error
                )
                visual = fallback_visual(reason="vlm_error")
                warnings.append(
                    f"이미지({image_file.file_name or image_file.id}) 분석에 실패해 건너뛰었습니다."
                )
            visual_results.append(
                VisualAgentResult(
                    payload=visual,
                    source_file_id=image_file.id,
                    image_path=image_file.path,
                ),
            )

        # Screen recordings are video: sample still frames (best-effort) and
        # analyze each frame with the VLM.
        for screen_file in state.get("screen_files", []):
            with sample_frames(screen_file.path) as frames:
                if not frames:
                    continue
                for frame_path in frames:
                    try:
                        visual = analyze_image(frame_path)
                    except Exception as error:  # noqa: BLE001 - isolate per-frame failure.
                        logger.warning(
                            "Screen frame analysis failed for file %s: %s",
                            screen_file.id,
                            error,
                        )
                        continue
                    visual_results.append(
                        VisualAgentResult(
                            payload=visual,
                            source_file_id=screen_file.id,
                            image_path=screen_file.path,
                        ),
                    )

        visual_summary = "\n".join(
            result.payload.get("summary", "")
            for result in visual_results
            if result.payload.get("summary")
        )
        return {
            "visual_results": visual_results,
            "visual_summary": visual_summary,
            "warnings": warnings,
            "node_trace": self.complete_node(state, "process_visuals"),
        }

    def align_timeline(self, state: AgentGraphState) -> AgentGraphState:
        # Build a real chronological timeline by merging transcript segments
        # (only when a real transcript exists) and timestamped user memos.
        events: list[tuple[int, str, str]] = []

        transcript = state.get("transcript", {})
        if transcript.get("status") == "ready":
            for segment in transcript.get("segments") or []:
                start_ms = segment.get("start_ms")
                text = str(segment.get("text") or "").strip()
                if text and start_ms is not None:
                    events.append((int(start_ms), "발화", text))

        for memo in self.snapshot.timed_memos:
            timestamp_ms = memo.get("timestamp_ms")
            text = str(memo.get("text") or "").strip()
            if text and timestamp_ms is not None:
                events.append((int(timestamp_ms), "메모", text))

        events.sort(key=lambda event: event[0])
        timeline_text = "\n".join(
            f"[{self._format_ms(ms)}] ({kind}) {text}" for ms, kind, text in events
        )

        # Non-temporal context (visual keywords, attached documents) still feeds
        # the minutes prompt alongside the timeline.
        context_parts: list[str] = []
        visual_keywords = [
            keyword
            for result in state.get("visual_results", [])
            for keyword in result.payload.get("keywords", [])
        ]
        if visual_keywords:
            context_parts.append("시각 자료 키워드: " + ", ".join(sorted(set(visual_keywords))))

        document_files = state.get("document_files", [])
        if document_files:
            document_names = [
                file.file_name or file.path or f"file:{file.id}" for file in document_files
            ]
            context_parts.append("첨부 문서: " + ", ".join(document_names))

        visual_summary = state.get("visual_summary", "")
        if context_parts:
            aligned_context = "\n\n".join(context_parts)
            visual_summary = "\n\n".join(
                item for item in [visual_summary, aligned_context] if item
            )

        return {
            "visual_summary": visual_summary,
            "timeline_text": timeline_text,
            "node_trace": self.complete_node(state, "align_timeline"),
        }

    @staticmethod
    def _format_ms(ms: int) -> str:
        total_seconds = max(0, int(ms) // 1000)
        return f"{total_seconds // 60:02d}:{total_seconds % 60:02d}"

    def generate_minutes(self, state: AgentGraphState) -> AgentGraphState:
        transcript = state.get("transcript", {})
        minutes = generate_minutes(
            state["title"],
            state.get("transcript_for_minutes", ""),
            len(state.get("memo_texts", [])),
            memo_texts=state.get("memo_texts", []),
            visual_summary=state.get("visual_summary", ""),
            transcript_status=str(transcript.get("status") or "ready"),
            timeline_text=state.get("timeline_text", ""),
        )
        return {
            "minutes": minutes,
            "node_trace": self.complete_node(state, "generate_minutes"),
        }

    def validate_outputs(self, state: AgentGraphState) -> AgentGraphState:
        minutes = dict(state.get("minutes", {}))
        validation = dict(minutes.setdefault("validation_result", {}))
        node_trace = self.complete_node(state, "validate_outputs")
        validation["agent_engine"] = "langgraph"
        validation["agent_warnings"] = state.get("warnings", [])
        validation["stt_status"] = state.get("transcript", {}).get("status", "unknown")
        validation["node_trace"] = node_trace
        validation["input_summary"] = {
            "audio_files": len(state.get("audio_files", [])),
            "screen_files": len(state.get("screen_files", [])),
            "image_files": len(state.get("image_files", [])),
            "document_files": len(state.get("document_files", [])),
            "memo_count": len(state.get("memo_texts", [])),
        }
        minutes["validation_result"] = validation

        return {
            "minutes": minutes,
            "node_trace": node_trace,
        }

    @staticmethod
    def to_dataclass(state: AgentGraphState) -> MeetingAgentState:
        return MeetingAgentState(
            meeting_id=state["meeting_id"],
            title=state["title"],
            audio_files=state.get("audio_files", []),
            screen_files=state.get("screen_files", []),
            image_files=state.get("image_files", []),
            document_files=state.get("document_files", []),
            memo_texts=state.get("memo_texts", []),
            transcript=state.get("transcript", {}),
            transcript_for_minutes=state.get("transcript_for_minutes", ""),
            visual_results=state.get("visual_results", []),
            visual_summary=state.get("visual_summary", ""),
            timeline_text=state.get("timeline_text", ""),
            minutes=state.get("minutes", {}),
            warnings=state.get("warnings", []),
            node_trace=state.get("node_trace", []),
        )

    def complete_node(self, state: AgentGraphState, node_name: str) -> list[str]:
        if self.on_node_complete:
            self.on_node_complete(node_name)
        return [*state.get("node_trace", []), node_name]

    @staticmethod
    def first_path(files: list[AgentInputFile]) -> str | None:
        for file in files:
            if file.path:
                return file.path
        return None

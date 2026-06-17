from dataclasses import dataclass, field

from app.models.enums import FileType
from app.models.meeting import Meeting
from app.models.meeting_file import MeetingFile
from app.worker.llm_client import generate_minutes
from app.worker.stt_client import transcribe_audio
from app.worker.vlm_client import analyze_image, fallback_visual


@dataclass(frozen=True)
class AgentInputFile:
    id: int
    file_type: FileType
    path: str | None
    mime_type: str | None
    file_name: str | None


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
    minutes: dict = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)


def path_for_file(file: MeetingFile) -> str | None:
    return file.storage_path or file.local_source_path


class MeetingAgent:
    """Deterministic MVP agent graph for meeting processing.

    STT remains a mock/developing node, while memo/image/model routing runs through
    explicit agent steps so it can be replaced by LangGraph later without changing
    the RQ/DB boundary.
    """

    def __init__(self, meeting: Meeting):
        self.meeting = meeting
        self.state = MeetingAgentState(
            meeting_id=meeting.id,
            title=meeting.title,
        )

    def load_inputs(self) -> MeetingAgentState:
        for file in self.meeting.files:
            input_file = AgentInputFile(
                id=file.id,
                file_type=file.file_type,
                path=path_for_file(file),
                mime_type=file.mime_type,
                file_name=file.original_filename or file.stored_filename,
            )

            if file.file_type == FileType.audio:
                self.state.audio_files.append(input_file)
            elif file.file_type == FileType.screen_recording:
                self.state.screen_files.append(input_file)
            elif self.is_image_file(file):
                self.state.image_files.append(input_file)
            elif file.file_type in {FileType.document, FileType.attachment}:
                self.state.document_files.append(input_file)

        self.state.memo_texts = [memo.memo for memo in self.meeting.memos if memo.memo]

        if self.meeting.additional_memo:
            self.state.memo_texts.insert(0, self.meeting.additional_memo)

        return self.state

    def process_audio(self) -> MeetingAgentState:
        audio_path = self.first_path(self.state.audio_files) or self.first_path(
            self.state.screen_files,
        )
        transcript = transcribe_audio(audio_path)
        self.state.transcript = transcript

        if transcript.get("status") in {"mock", "developing"}:
            self.state.warnings.append(
                "STT는 개발 중입니다. mock 전사 문장은 회의 요약 입력에서 제외했습니다.",
            )
            self.state.transcript_for_minutes = ""
            return self.state

        self.state.transcript_for_minutes = str(transcript.get("content") or "")
        return self.state

    def process_visuals(self) -> MeetingAgentState:
        if not self.state.image_files:
            visual = fallback_visual(reason="image_input_missing")
            self.state.visual_results.append(
                VisualAgentResult(
                    payload=visual,
                    source_file_id=None,
                    image_path=None,
                ),
            )
            self.state.visual_summary = visual["summary"]
            return self.state

        for image_file in self.state.image_files:
            visual = analyze_image(image_file.path)
            self.state.visual_results.append(
                VisualAgentResult(
                    payload=visual,
                    source_file_id=image_file.id,
                    image_path=image_file.path,
                ),
            )

        self.state.visual_summary = "\n".join(
            result.payload.get("summary", "")
            for result in self.state.visual_results
            if result.payload.get("summary")
        )
        return self.state

    def align_timeline(self) -> MeetingAgentState:
        context_parts: list[str] = []

        if self.state.memo_texts:
            context_parts.append(
                "사용자 메모:\n"
                + "\n".join(f"- {memo}" for memo in self.state.memo_texts),
            )

        visual_keywords = [
            keyword
            for result in self.state.visual_results
            for keyword in result.payload.get("keywords", [])
        ]
        if visual_keywords:
            context_parts.append("시각 자료 키워드: " + ", ".join(sorted(set(visual_keywords))))

        if self.state.document_files:
            document_names = [
                file.file_name or file.path or f"file:{file.id}"
                for file in self.state.document_files
            ]
            context_parts.append("첨부 문서: " + ", ".join(document_names))

        if context_parts:
            aligned_context = "\n\n".join(context_parts)
            self.state.visual_summary = "\n\n".join(
                item for item in [self.state.visual_summary, aligned_context] if item
            )

        return self.state

    def generate_minutes(self) -> MeetingAgentState:
        self.state.minutes = generate_minutes(
            self.state.title,
            self.state.transcript_for_minutes,
            len(self.state.memo_texts),
            memo_texts=self.state.memo_texts,
            visual_summary=self.state.visual_summary,
            transcript_status=str(self.state.transcript.get("status") or "ready"),
        )
        return self.state

    def validate_outputs(self) -> MeetingAgentState:
        validation = self.state.minutes.setdefault("validation_result", {})
        validation["agent_warnings"] = self.state.warnings
        validation["stt_status"] = self.state.transcript.get("status", "unknown")
        validation["input_summary"] = {
            "audio_files": len(self.state.audio_files),
            "screen_files": len(self.state.screen_files),
            "image_files": len(self.state.image_files),
            "document_files": len(self.state.document_files),
            "memo_count": len(self.state.memo_texts),
        }
        return self.state

    @staticmethod
    def first_path(files: list[AgentInputFile]) -> str | None:
        for file in files:
            if file.path:
                return file.path
        return None

    @staticmethod
    def is_image_file(file: MeetingFile) -> bool:
        return file.file_type == FileType.image or (file.mime_type or "").startswith(
            "image/",
        )

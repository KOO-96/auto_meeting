import logging
from typing import Any

from app.models.enums import MeetingType
from app.worker.openai_compatible import (
    ModelClientError,
    json_chat_completion,
    model_enabled,
)

logger = logging.getLogger(__name__)

MEETING_TYPES = {meeting_type.value for meeting_type in MeetingType}


def fallback_minutes(
    title: str,
    transcript: str,
    memo_count: int,
    transcript_status: str = "ready",
) -> dict:
    stt_note = (
        " 음성 전사를 사용할 수 없어(개발 중/오류) 메모와 시각 자료 중심으로 정리했습니다."
        if transcript_status in {"mock", "developing", "error"}
        else ""
    )

    return {
        "meeting_type": "general_meeting",
        "one_line_summary": f"{title} 회의록이 생성되었습니다.",
        "detailed_summary": (
            "현재 사용 가능한 회의 입력을 기반으로 회의록 초안을 생성했습니다. "
            f"전사 길이 {len(transcript)}자, 메모 {memo_count}건을 반영했습니다.{stt_note}"
        ),
        "keywords": ["Company Brain Lite"],
        "decisions": [],
        "action_items": [
            {
                "assignee": None,
                "task": "STT 모델이 확정되면 실제 음성 전사 노드를 연결합니다.",
                "due_date": None,
                "priority": "medium",
                "status": "todo",
            }
        ],
        "open_questions": [
            {
                "question": "운영 환경에서 사용할 STT 모델과 배포 방식을 확정해야 합니다.",
                "owner": None,
            }
        ],
        "risks": [
            {
                "risk": "원본 파일 크기가 커질 수 있습니다.",
                "impact": "storage",
                "mitigation": "업로드 크기 제한과 보관 정책을 운영에서 적용합니다.",
            }
        ],
        "next_agenda": ["실제 AI pipeline 연결", "프론트엔드 API 연동 검증"],
        "next_decision_items": ["모델 서버 배포 위치 결정"],
        "validation_result": {
            "matched_points": [],
            "text_only_points": [],
            "audio_only_points": [],
            "screen_only_points": [],
            "conflicts": [],
            "stt_status": transcript_status,
        },
    }


def generate_minutes(
    title: str,
    transcript: str,
    memo_count: int,
    memo_texts: list[str] | None = None,
    visual_summary: str | None = None,
    transcript_status: str = "ready",
    timeline_text: str | None = None,
) -> dict:
    if not model_enabled():
        return fallback_minutes(title, transcript, memo_count, transcript_status)

    try:
        payload = json_chat_completion(
            [
                {
                    "role": "system",
                    "content": (
                        "You are Company Brain Lite's meeting-minutes JSON generator. "
                        "Output valid JSON only. No markdown. Do not explain."
                    ),
                },
                {
                    "role": "user",
                    "content": build_prompt(
                        title,
                        transcript,
                        memo_texts or [],
                        visual_summary,
                        transcript_status,
                        timeline_text,
                    ),
                },
            ],
        )
    except ModelClientError as error:
        # Degrade gracefully: a model/parse failure yields a usable draft
        # instead of failing the whole meeting.
        logger.warning("Minutes generation failed, using fallback: %s", error)
        minutes = fallback_minutes(title, transcript, memo_count, transcript_status)
        minutes["validation_result"]["model_error"] = str(error)
        return minutes

    return normalize_minutes(payload, title, transcript, memo_count, transcript_status)


def build_prompt(
    title: str,
    transcript: str,
    memo_texts: list[str],
    visual_summary: str | None,
    transcript_status: str,
    timeline_text: str | None = None,
) -> str:
    joined_memos = "\n".join(f"- {memo}" for memo in memo_texts) or "(none)"
    transcript_instruction = (
        "음성 전사를 사용할 수 없습니다(개발 중/mock 또는 오류). 아래 전사 텍스트가 비어 있거나 "
        "안내문이면 회의 내용으로 간주하지 말고 사용자 메모와 화면/이미지 분석만 근거로 작성하세요."
        if transcript_status in {"mock", "developing", "error"}
        else "전사 텍스트를 주요 근거로 사용하세요."
    )
    return f"""다음 회의 입력을 기반으로 구조화 회의록 JSON을 생성하세요.

필수 조건:
- 반드시 JSON object만 출력합니다.
- 모든 key를 반드시 포함합니다.
- 한국어로 작성합니다.
- 모르는 내용은 빈 배열 또는 null로 둡니다.

JSON schema:
{{
  "meeting_type": "general_meeting|task_assignment|project_planning|wbs_planning|decision_meeting|retrospective|hr_sensitive|architecture_review|incident_review|unknown",
  "one_line_summary": "string",
  "detailed_summary": "string",
  "keywords": ["string"],
  "decisions": [
    {{"content": "string", "reason": "string|null", "related_participants": ["string"]}}
  ],
  "action_items": [
    {{"task": "string", "assignee": "string|null", "due_date": "string|null", "priority": "low|medium|high|null", "status": "todo|doing|done|null"}}
  ],
  "open_questions": [
    {{"question": "string", "owner": "string|null"}}
  ],
  "risks": [
    {{"risk": "string", "impact": "string|null", "mitigation": "string|null"}}
  ],
  "next_agenda": ["string"],
  "next_decision_items": ["string"],
  "validation_result": {{
    "matched_points": ["string"],
    "text_only_points": ["string"],
    "audio_only_points": ["string"],
    "screen_only_points": ["string"],
    "conflicts": [{{"text": "string", "audio": "string", "severity": "low|medium|high"}}]
  }}
}}

회의 제목:
{title}

음성 전사 상태:
{transcript_status}

전사 사용 지침:
{transcript_instruction}

전사 텍스트:
{transcript[:12000]}

사용자 메모:
{joined_memos[:6000]}

시간순 타임라인(발화/메모):
{(timeline_text or "(none)")[:8000]}

화면/이미지 분석:
{visual_summary or "(none)"}
"""


def normalize_minutes(
    payload: dict[str, Any],
    title: str,
    transcript: str,
    memo_count: int,
    transcript_status: str = "ready",
) -> dict:
    fallback = fallback_minutes(title, transcript, memo_count, transcript_status)
    normalized = {
        "meeting_type": enum_or_none(payload.get("meeting_type"), MEETING_TYPES)
        or "general_meeting",
        "one_line_summary": string_value(
            payload.get("one_line_summary"),
            fallback["one_line_summary"],
        ),
        "detailed_summary": string_value(
            payload.get("detailed_summary"),
            fallback["detailed_summary"],
        ),
        "keywords": string_list(payload.get("keywords")) or fallback["keywords"],
        "decisions": normalize_decisions(payload.get("decisions")),
        "action_items": normalize_action_items(payload.get("action_items")),
        "open_questions": normalize_open_questions(payload.get("open_questions")),
        "risks": normalize_risks(payload.get("risks")),
        "next_agenda": string_list(payload.get("next_agenda")),
        "next_decision_items": string_list(payload.get("next_decision_items")),
        "validation_result": normalize_validation(payload.get("validation_result")),
    }

    if not normalized["decisions"]:
        normalized["decisions"] = fallback["decisions"]
    if not normalized["action_items"]:
        normalized["action_items"] = fallback["action_items"]
    return normalized


def string_value(value: Any, fallback: str = "") -> str:
    if isinstance(value, str):
        return value.strip() or fallback
    return fallback


def string_list(value: Any) -> list[str]:
    if isinstance(value, str):
        return [value] if value.strip() else []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    return []


def normalize_decisions(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    results: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, str):
            content = item
            reason = None
            participants: list[str] = []
        elif isinstance(item, dict):
            content = string_value(item.get("content") or item.get("decision"))
            reason = item.get("reason") if isinstance(item.get("reason"), str) else None
            participants = string_list(item.get("related_participants"))
        else:
            continue
        if content:
            results.append(
                {
                    "content": content,
                    "reason": reason,
                    "related_participants": participants,
                }
            )
    return results


def normalize_action_items(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    results: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, str):
            task = item
            source: dict[str, Any] = {}
        elif isinstance(item, dict):
            task = string_value(item.get("task") or item.get("content"))
            source = item
        else:
            continue
        if task:
            results.append(
                {
                    "task": task,
                    "assignee": nullable_string(source.get("assignee")),
                    "due_date": nullable_string(
                        source.get("due_date") or source.get("deadline")
                    ),
                    "priority": enum_or_none(source.get("priority"), {"low", "medium", "high"}),
                    "status": enum_or_none(source.get("status"), {"todo", "doing", "done"}),
                }
            )
    return results


def normalize_open_questions(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    results: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, str):
            question = item
            owner = None
        elif isinstance(item, dict):
            question = string_value(item.get("question") or item.get("content"))
            owner = nullable_string(item.get("owner"))
        else:
            continue
        if question:
            results.append({"question": question, "owner": owner})
    return results


def normalize_risks(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    results: list[dict[str, Any]] = []
    for item in value:
        if isinstance(item, str):
            risk = item
            impact = None
            mitigation = None
        elif isinstance(item, dict):
            risk = string_value(item.get("risk") or item.get("content"))
            impact = nullable_string(item.get("impact"))
            mitigation = nullable_string(item.get("mitigation"))
        else:
            continue
        if risk:
            results.append({"risk": risk, "impact": impact, "mitigation": mitigation})
    return results


def normalize_validation(value: Any) -> dict[str, Any]:
    if not isinstance(value, dict):
        return {
            "matched_points": [],
            "text_only_points": [],
            "audio_only_points": [],
            "screen_only_points": [],
            "conflicts": [],
        }

    conflicts = value.get("conflicts")
    return {
        "matched_points": string_list(value.get("matched_points")),
        "text_only_points": string_list(value.get("text_only_points")),
        "audio_only_points": string_list(value.get("audio_only_points")),
        "screen_only_points": string_list(value.get("screen_only_points")),
        "conflicts": conflicts if isinstance(conflicts, list) else [],
    }


def nullable_string(value: Any) -> str | None:
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def enum_or_none(value: Any, allowed: set[str]) -> str | None:
    if isinstance(value, str) and value in allowed:
        return value
    return None

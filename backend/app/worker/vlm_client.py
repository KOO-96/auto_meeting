from pathlib import Path
from typing import Any

from app.worker.openai_compatible import (
    image_content,
    json_chat_completion,
    model_enabled,
)


VALID_IMAGE_TYPES = {
    "ppt_slide",
    "architecture_diagram",
    "whiteboard",
    "document_capture",
    "unknown",
}


def fallback_visual(reason: str = "vlm_unavailable") -> dict:
    summary = {
        "image_input_missing": "이미지 입력이 없어 화면/이미지 분석은 건너뛰었습니다.",
        "vlm_unavailable": "VLM 모델을 사용할 수 없어 이미지 분석은 개발 중 상태로 처리했습니다.",
    }.get(reason, "이미지 분석은 개발 중 상태로 처리했습니다.")

    return {
        "image_type": "unknown",
        "summary": summary,
        "detected_text": [],
        "keywords": [],
        "status": reason,
    }


def analyze_image(path: str | None) -> dict:
    if not path or not Path(path).exists():
        return fallback_visual(reason="image_input_missing")

    if not model_enabled():
        return fallback_visual(reason="vlm_unavailable")

    prompt = """이미지를 분석해 다음 JSON object만 출력하세요.

필수 key:
- image_type: ppt_slide | architecture_diagram | whiteboard | document_capture | unknown
- summary: 이미지에서 회의 맥락에 중요한 내용 요약
- detected_text: 이미지에서 읽힌 주요 텍스트 배열
- keywords: 검색/회의록에 유용한 키워드 배열

JSON 외의 설명, markdown, code fence는 출력하지 마세요.
"""
    payload = json_chat_completion(
        [
            {
                "role": "system",
                "content": (
                    "You are Company Brain Lite's visual analysis model. "
                    "Output valid JSON only. No markdown. Do not explain."
                ),
            },
            {"role": "user", "content": image_content(path, prompt)},
        ],
        max_tokens=1024,
    )
    return normalize_visual(payload)


def normalize_visual(payload: dict[str, Any]) -> dict:
    image_type = payload.get("image_type")
    if not isinstance(image_type, str) or image_type not in VALID_IMAGE_TYPES:
        image_type = "unknown"

    return {
        "image_type": image_type,
        "summary": string_value(payload.get("summary"), "이미지 분석 결과가 없습니다."),
        "detected_text": string_list(payload.get("detected_text")),
        "keywords": string_list(payload.get("keywords")),
    }


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

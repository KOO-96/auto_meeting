import base64
import json
import logging
import mimetypes
import time
from pathlib import Path
from typing import Any
from urllib import error, request

from app.core.config import get_settings

logger = logging.getLogger(__name__)

# Upstream statuses worth retrying (transient / overloaded), vs 4xx which are
# permanent client errors and should fail fast.
RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}


class ModelClientError(RuntimeError):
    pass


def model_enabled() -> bool:
    return bool(get_settings().ai_model_base_url)


def chat_completion(messages: list[dict[str, Any]], max_tokens: int | None = None) -> str:
    settings = get_settings()
    if not settings.ai_model_base_url:
        raise ModelClientError("AI_MODEL_BASE_URL is not configured.")

    payload = {
        "model": settings.ai_model_name,
        "messages": messages,
        "temperature": settings.ai_model_temperature,
        "max_tokens": max_tokens or settings.ai_model_max_tokens,
        "chat_template_kwargs": {"enable_thinking": False},
    }
    endpoint = f"{settings.ai_model_base_url.rstrip('/')}/chat/completions"
    req = request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    body = _request_with_retry(req, settings)

    try:
        return str(body["choices"][0]["message"]["content"])
    except (KeyError, IndexError, TypeError) as exc:
        raise ModelClientError("vLLM response did not include assistant content.") from exc


def _request_with_retry(req: request.Request, settings) -> dict[str, Any]:
    attempts = max(1, settings.ai_model_max_retries + 1)
    last_error: Exception | None = None

    for attempt in range(attempts):
        try:
            with request.urlopen(req, timeout=settings.ai_model_timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            last_error = ModelClientError(f"vLLM request failed: {exc.code} {detail}")
            if exc.code not in RETRYABLE_STATUS:
                raise last_error from exc
        except (OSError, json.JSONDecodeError) as exc:
            last_error = ModelClientError(f"vLLM request failed: {exc}")

        if attempt < attempts - 1:
            backoff = settings.ai_model_retry_backoff_seconds * (2**attempt)
            logger.warning(
                "Model request failed (attempt %s/%s), retrying in %.1fs: %s",
                attempt + 1,
                attempts,
                backoff,
                last_error,
            )
            time.sleep(backoff)

    raise last_error or ModelClientError("vLLM request failed after retries.")


def json_chat_completion(
    messages: list[dict[str, Any]],
    max_tokens: int | None = None,
) -> dict[str, Any]:
    content = chat_completion(messages, max_tokens=max_tokens)
    return extract_json_object(content)


def image_content(path: str, prompt: str) -> list[dict[str, Any]]:
    file_path = Path(path)
    data = base64.b64encode(file_path.read_bytes()).decode("ascii")
    mime_type = mimetypes.guess_type(file_path.name)[0] or "image/png"

    return [
        {"type": "text", "text": prompt},
        {
            "type": "image_url",
            "image_url": {"url": f"data:{mime_type};base64,{data}"},
        },
    ]


def extract_json_object(content: str) -> dict[str, Any]:
    trimmed = content.strip()
    if trimmed.startswith("```"):
        trimmed = trimmed.removeprefix("```json").removeprefix("```").strip()
        trimmed = trimmed.removesuffix("```").strip()

    try:
        parsed = json.loads(trimmed)
        if isinstance(parsed, dict):
            return parsed
    except json.JSONDecodeError:
        pass

    start = trimmed.find("{")
    if start < 0:
        raise ModelClientError("Model response did not contain a JSON object.")

    depth = 0
    in_string = False
    escape = False
    for index, char in enumerate(trimmed[start:], start=start):
        if escape:
            escape = False
            continue
        if char == "\\":
            escape = True
            continue
        if char == '"':
            in_string = not in_string
            continue
        if in_string:
            continue
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                parsed = json.loads(trimmed[start : index + 1])
                if isinstance(parsed, dict):
                    return parsed
                break

    raise ModelClientError("Model response did not contain valid JSON.")

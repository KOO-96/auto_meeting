import json
import logging
import mimetypes
import shutil
import subprocess
import tempfile
import time
import uuid
from pathlib import Path
from typing import Any
from urllib import error, request

from app.core.config import get_settings
from app.worker.frame_sampler import ffmpeg_available

logger = logging.getLogger(__name__)

RETRYABLE_STATUS = {408, 429, 500, 502, 503, 504}

MOCK_MESSAGE = "STT는 개발 중입니다. 실제 음성 전사는 mock 처리되었습니다."


class SttClientError(RuntimeError):
    pass


def stt_enabled() -> bool:
    return bool(get_settings().stt_base_url)


def transcribe_audio(audio_path: str | None) -> dict:
    """Transcribe audio, returning a stable contract regardless of backend.

    Contract keys: status, is_mock, source_path, content, segments.
    status is one of: "ready" (real transcript), "developing"/"mock"
    (no STT configured), or "error" (transcription attempted but failed).
    """
    if not stt_enabled():
        return _mock_transcript(audio_path)

    if not audio_path or not Path(audio_path).exists():
        logger.warning("STT: audio path missing or unreadable: %s", audio_path)
        return _error_transcript(audio_path, "audio_unavailable")

    try:
        return _transcribe_remote(audio_path)
    except SttClientError as error_:
        logger.warning("STT transcription failed: %s", error_)
        return _error_transcript(audio_path, str(error_))


def _mock_transcript(audio_path: str | None) -> dict:
    return {
        "status": "developing",
        "is_mock": True,
        "source_path": audio_path,
        "content": MOCK_MESSAGE,
        "segments": [
            {"start_ms": 0, "end_ms": 3000, "speaker": "speaker_1", "text": MOCK_MESSAGE}
        ],
    }


def _error_transcript(audio_path: str | None, reason: str) -> dict:
    return {
        "status": "error",
        "is_mock": False,
        "source_path": audio_path,
        "content": "",
        "segments": [],
        "error": reason,
    }


def _transcribe_remote(audio_path: str) -> dict:
    settings = get_settings()
    if settings.stt_chunk_seconds > 0 and ffmpeg_available():
        return _transcribe_chunked(audio_path, settings)

    endpoint = f"{settings.stt_base_url.rstrip('/')}/audio/transcriptions"
    body = _transcribe_with_retry(endpoint, audio_path, _stt_fields(settings), settings)
    return _normalize_transcription(body, audio_path)


def _stt_fields(settings) -> dict[str, str]:
    fields = {"model": settings.stt_model, "response_format": "verbose_json"}
    if settings.stt_language:
        fields["language"] = settings.stt_language
    return fields


def _transcribe_chunked(audio_path: str, settings) -> dict:
    """Split a long recording into fixed-length chunks and transcribe each.

    Segment timestamps are offset back to absolute time. A failed chunk is
    skipped (partial results) rather than failing the whole transcription.
    """
    endpoint = f"{settings.stt_base_url.rstrip('/')}/audio/transcriptions"
    chunk_seconds = settings.stt_chunk_seconds
    out_dir = tempfile.mkdtemp(prefix="cb_stt_")
    suffix = Path(audio_path).suffix or ".webm"
    pattern = str(Path(out_dir) / f"chunk_%03d{suffix}")

    try:
        subprocess.run(
            [
                "ffmpeg", "-nostdin", "-loglevel", "error", "-i", audio_path,
                "-f", "segment", "-segment_time", str(chunk_seconds), "-c", "copy",
                pattern,
            ],
            capture_output=True,
            timeout=settings.stt_timeout_seconds,
            check=True,
        )
        chunks = sorted(Path(out_dir).glob(f"chunk_*{suffix}"))
        if not chunks:
            raise SttClientError("ffmpeg produced no audio chunks.")

        merged_content: list[str] = []
        merged_segments: list[dict] = []
        succeeded = 0
        for index, chunk in enumerate(chunks):
            offset_ms = index * chunk_seconds * 1000
            try:
                body = _transcribe_with_retry(endpoint, str(chunk), _stt_fields(settings), settings)
                normalized = _normalize_transcription(body, str(chunk))
            except SttClientError as error_:
                logger.warning("STT chunk %s failed (skipped): %s", index, error_)
                continue
            succeeded += 1
            merged_content.append(normalized["content"])
            merged_segments.extend(_offset_segments(normalized["segments"], offset_ms))

        if succeeded == 0:
            raise SttClientError("All STT chunks failed.")

        return {
            "status": "ready",
            "is_mock": False,
            "source_path": audio_path,
            "content": " ".join(part for part in merged_content if part).strip(),
            "segments": merged_segments,
        }
    finally:
        shutil.rmtree(out_dir, ignore_errors=True)


def _offset_segments(segments: list[dict], offset_ms: int) -> list[dict]:
    offset: list[dict] = []
    for segment in segments:
        shifted = dict(segment)
        if shifted.get("start_ms") is not None:
            shifted["start_ms"] += offset_ms
        if shifted.get("end_ms") is not None:
            shifted["end_ms"] += offset_ms
        offset.append(shifted)
    return offset


def _transcribe_with_retry(
    endpoint: str, audio_path: str, fields: dict[str, str], settings
) -> dict[str, Any]:
    attempts = max(1, settings.stt_max_retries + 1)
    last_error: Exception | None = None

    for attempt in range(attempts):
        content_type, payload = _encode_multipart(audio_path, fields)
        req = request.Request(
            endpoint,
            data=payload,
            headers={"Content-Type": content_type},
            method="POST",
        )
        try:
            with request.urlopen(req, timeout=settings.stt_timeout_seconds) as response:
                return json.loads(response.read().decode("utf-8"))
        except error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            last_error = SttClientError(f"STT request failed: {exc.code} {detail}")
            if exc.code not in RETRYABLE_STATUS:
                raise last_error from exc
        except (OSError, json.JSONDecodeError) as exc:
            last_error = SttClientError(f"STT request failed: {exc}")

        if attempt < attempts - 1:
            time.sleep(1.0 * (2**attempt))

    raise last_error or SttClientError("STT request failed after retries.")


def _encode_multipart(audio_path: str, fields: dict[str, str]) -> tuple[str, bytes]:
    boundary = f"----companybrain{uuid.uuid4().hex}"
    path = Path(audio_path)
    mime_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    line_break = b"\r\n"
    buffer = bytearray()

    for name, value in fields.items():
        buffer += f"--{boundary}".encode() + line_break
        buffer += f'Content-Disposition: form-data; name="{name}"'.encode() + line_break
        buffer += line_break + value.encode("utf-8") + line_break

    buffer += f"--{boundary}".encode() + line_break
    buffer += (
        f'Content-Disposition: form-data; name="file"; filename="{path.name}"'.encode()
        + line_break
    )
    buffer += f"Content-Type: {mime_type}".encode() + line_break + line_break
    buffer += path.read_bytes() + line_break
    buffer += f"--{boundary}--".encode() + line_break

    return f"multipart/form-data; boundary={boundary}", bytes(buffer)


def _normalize_transcription(body: dict[str, Any], audio_path: str) -> dict:
    content = str(body.get("text") or "").strip()
    segments: list[dict] = []

    for segment in body.get("segments") or []:
        if not isinstance(segment, dict):
            continue
        start = segment.get("start")
        end = segment.get("end")
        text = str(segment.get("text") or "").strip()
        if not text:
            continue
        segments.append(
            {
                "start_ms": int(float(start) * 1000) if start is not None else None,
                "end_ms": int(float(end) * 1000) if end is not None else None,
                "speaker": segment.get("speaker"),
                "text": text,
            }
        )

    if not content and segments:
        content = " ".join(segment["text"] for segment in segments)

    if not content:
        raise SttClientError("STT response contained no transcript text.")

    return {
        "status": "ready",
        "is_mock": False,
        "source_path": audio_path,
        "content": content,
        "segments": segments,
    }

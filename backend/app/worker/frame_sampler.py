import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from app.core.config import get_settings

logger = logging.getLogger(__name__)


def ffmpeg_available() -> bool:
    return shutil.which("ffmpeg") is not None


class SampledFrames:
    """Context manager holding extracted frame paths; cleans up temp files."""

    def __init__(self, directory: str | None, paths: list[str]):
        self._directory = directory
        self.paths = paths

    def __enter__(self) -> list[str]:
        return self.paths

    def __exit__(self, *exc) -> None:
        if self._directory:
            shutil.rmtree(self._directory, ignore_errors=True)


def sample_frames(video_path: str | None) -> SampledFrames:
    """Extract a bounded set of still frames from a screen recording.

    Returns an empty result (never raises) when ffmpeg is unavailable, the file
    is missing, or extraction fails — screen analysis is best-effort.
    """
    settings = get_settings()
    if not settings.screen_frame_sampling_enabled:
        return SampledFrames(None, [])
    if not video_path or not Path(video_path).exists():
        return SampledFrames(None, [])
    if not ffmpeg_available():
        logger.warning("ffmpeg not found on PATH; skipping screen frame sampling.")
        return SampledFrames(None, [])

    out_dir = tempfile.mkdtemp(prefix="cb_frames_")
    pattern = str(Path(out_dir) / "frame_%03d.jpg")
    interval = max(1, settings.screen_frame_interval_seconds)
    cmd = [
        "ffmpeg",
        "-nostdin",
        "-loglevel",
        "error",
        "-i",
        video_path,
        "-vf",
        f"fps=1/{interval},scale=1280:-1",
        "-frames:v",
        str(settings.screen_frame_max),
        pattern,
    ]
    try:
        subprocess.run(cmd, capture_output=True, timeout=settings.stt_timeout_seconds, check=True)
    except (subprocess.SubprocessError, OSError) as error:
        logger.warning("Screen frame extraction failed for %s: %s", video_path, error)
        shutil.rmtree(out_dir, ignore_errors=True)
        return SampledFrames(None, [])

    frames = sorted(str(p) for p in Path(out_dir).glob("frame_*.jpg"))
    if not frames:
        shutil.rmtree(out_dir, ignore_errors=True)
        return SampledFrames(None, [])

    return SampledFrames(out_dir, frames)

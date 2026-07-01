import os
from pathlib import Path

os.environ.setdefault("DATABASE_URL", "sqlite:///./test_company_brain.db")
os.environ.setdefault("JWT_SECRET_KEY", "test-secret-key-for-pytest-0123456789")
os.environ.setdefault("AI_WORKER_ENABLED", "false")
os.environ.setdefault("UPLOAD_DIR", "storage/test_uploads")
os.environ.setdefault("EXPORT_DIR", "storage/test_exports")

from datetime import datetime, timedelta, timezone  # noqa: E402

from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import func, select  # noqa: E402

from app.db.base import Base  # noqa: E402
from app.db.init_db import init_db  # noqa: E402
from app.db.session import SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import *  # noqa: F403,E402
from app.models.meeting_analysis import MeetingAnalysis  # noqa: E402
from app.models.meeting_transcript import MeetingTranscript  # noqa: E402
from app.models.processing_job import ProcessingJob  # noqa: E402
from app.worker.pipeline import run_meeting_pipeline  # noqa: E402


def setup_module() -> None:
    db_path = Path("test_company_brain.db")
    if db_path.exists():
        db_path.unlink()
    Base.metadata.create_all(bind=engine)
    init_db(create_schema=False)


def teardown_module() -> None:
    Base.metadata.drop_all(bind=engine)
    db_path = Path("test_company_brain.db")
    if db_path.exists():
        db_path.unlink()


def auth_headers(client: TestClient) -> dict[str, str]:
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@company.local", "password": "password"},
    )
    assert response.status_code == 200, response.text
    token = response.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


def _create_processable_meeting(client: TestClient, headers: dict[str, str], title: str) -> int:
    meeting = client.post(
        "/api/meetings",
        json={
            "title": title,
            "meeting_date": "2026-06-16",
            "participant_ids": [],
            "participants_only": True,
        },
        headers=headers,
    )
    assert meeting.status_code == 200, meeting.text
    meeting_id = meeting.json()["meeting_id"]

    client.post(f"/api/meetings/{meeting_id}/start", headers=headers)
    finished = client.post(
        f"/api/meetings/{meeting_id}/finish",
        json={
            "local_base_path": f"/tmp/cb/{meeting_id}",
            "audio_file_path": f"/tmp/cb/{meeting_id}/audio/audio.webm",
        },
        headers=headers,
    )
    assert finished.status_code == 200, finished.text
    return meeting_id


def test_health() -> None:
    client = TestClient(app)

    live = client.get("/health/live")
    assert live.status_code == 200
    assert live.json() == {"status": "ok"}

    # Deep check: DB reachable; Redis is optional when the worker is disabled.
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["checks"]["database"] == "ok"


def test_login_refresh_logout() -> None:
    client = TestClient(app)
    response = client.post(
        "/api/auth/login",
        json={"email": "admin@company.local", "password": "password"},
    )
    assert response.status_code == 200
    refresh_token = response.json()["refresh_token"]

    refreshed = client.post("/api/auth/refresh", json={"refresh_token": refresh_token})
    assert refreshed.status_code == 200

    logout = client.post(
        "/api/auth/logout",
        json={"refresh_token": refreshed.json()["refresh_token"]},
    )
    assert logout.status_code == 200


def test_meeting_metadata_and_processing_conflict() -> None:
    client = TestClient(app)
    headers = auth_headers(client)

    meeting = client.post(
        "/api/meetings",
        json={
            "title": "Backend MVP 회의",
            "meeting_date": "2026-06-16",
            "participant_ids": [],
            "participants_only": True,
            "additional_memo": "테스트",
        },
        headers=headers,
    )
    assert meeting.status_code == 200, meeting.text
    meeting_id = meeting.json()["meeting_id"]

    started = client.post(f"/api/meetings/{meeting_id}/start", headers=headers)
    assert started.status_code == 200
    assert started.json()["status"] == "recording"

    finished = client.post(
        f"/api/meetings/{meeting_id}/finish",
        json={
            "local_base_path": "/Users/company/CompanyBrain/meetings/1",
            "screen_file_path": "/Users/company/CompanyBrain/meetings/1/screen/screen.webm",
            "audio_file_path": "/Users/company/CompanyBrain/meetings/1/audio/audio.webm",
            "memo_file_path": "/Users/company/CompanyBrain/meetings/1/memos/timeline_memos.json",
            "metadata_file_path": "/Users/company/CompanyBrain/meetings/1/metadata/meeting_session.json",
        },
        headers=headers,
    )
    assert finished.status_code == 200, finished.text
    assert finished.json()["status"] == "metadata_saved"

    files = client.get(f"/api/meetings/{meeting_id}/files", headers=headers)
    assert files.status_code == 200
    assert {item["file_type"] for item in files.json()} >= {
        "screen_recording",
        "audio",
        "memo_json",
        "metadata_json",
    }

    process = client.post(f"/api/meetings/{meeting_id}/process", headers=headers)
    assert process.status_code == 200, process.text
    assert process.json()["status"] == "queued"

    duplicate = client.post(f"/api/meetings/{meeting_id}/process", headers=headers)
    assert duplicate.status_code == 409

    run_meeting_pipeline(meeting_id)

    status = client.get(f"/api/meetings/{meeting_id}/status", headers=headers)
    assert status.status_code == 200
    assert status.json()["status"] == "completed"
    assert status.json()["current_step"] == 5

    result = client.get(f"/api/meetings/{meeting_id}/result", headers=headers)
    assert result.status_code == 200, result.text
    result_payload = result.json()
    assert result_payload["meeting_id"] == meeting_id
    assert result_payload["one_line_summary"]
    assert "worker stub" not in result_payload["detailed_summary"].lower()
    assert result_payload["validation_result"]["agent_engine"] == "langgraph"
    assert result_payload["validation_result"]["stt_status"] == "developing"
    assert result_payload["validation_result"]["node_trace"] == [
        "load_inputs",
        "process_audio",
        "skip_visuals",
        "align_timeline",
        "generate_minutes",
        "validate_outputs",
    ]
    assert result_payload["validation_result"]["input_summary"]["audio_files"] == 1
    assert result_payload["validation_result"]["input_summary"]["screen_files"] == 1

    export = client.post(
        f"/api/meetings/{meeting_id}/exports",
        json={"export_type": "markdown"},
        headers=headers,
    )
    assert export.status_code == 200, export.text
    export_id = export.json()["export_id"]

    download = client.get(
        f"/api/meetings/{meeting_id}/exports/{export_id}/download",
        headers=headers,
    )
    assert download.status_code == 200, download.text
    assert b"Backend MVP" in download.content


def test_pipeline_is_idempotent_on_rerun() -> None:
    client = TestClient(app)
    headers = auth_headers(client)
    meeting_id = _create_processable_meeting(client, headers, "멱등성 회의")

    client.post(f"/api/meetings/{meeting_id}/process", headers=headers)
    run_meeting_pipeline(meeting_id)
    # Re-run the whole pipeline against the same meeting.
    run_meeting_pipeline(meeting_id)

    with SessionLocal() as db:
        transcripts = db.scalar(
            select(func.count()).select_from(MeetingTranscript).where(
                MeetingTranscript.meeting_id == meeting_id
            )
        )
        analyses = db.scalar(
            select(func.count()).select_from(MeetingAnalysis).where(
                MeetingAnalysis.meeting_id == meeting_id
            )
        )
    assert transcripts == 1, f"expected 1 transcript, got {transcripts}"
    assert analyses == 1, f"expected 1 analysis, got {analyses}"


def test_stuck_job_is_reaped_on_status_read() -> None:
    client = TestClient(app)
    headers = auth_headers(client)
    meeting_id = _create_processable_meeting(client, headers, "스턱 잡 회의")

    process = client.post(f"/api/meetings/{meeting_id}/process", headers=headers)
    assert process.status_code == 200
    assert process.json()["status"] == "queued"

    # Simulate a worker that died: backdate the job well past the timeout.
    with SessionLocal() as db:
        job = db.scalar(
            select(ProcessingJob).where(ProcessingJob.meeting_id == meeting_id)
        )
        old = datetime.now(timezone.utc) - timedelta(hours=1)
        job.created_at = old
        job.started_at = old
        db.commit()

    status = client.get(f"/api/meetings/{meeting_id}/status", headers=headers)
    assert status.status_code == 200
    assert status.json()["status"] == "failed"

    # A reaped meeting must be reprocessable (no permanent 409 lock).
    reprocess = client.post(f"/api/meetings/{meeting_id}/process", headers=headers)
    assert reprocess.status_code == 200


def test_login_rate_limiter_unit() -> None:
    from app.core.rate_limit import FixedWindowRateLimiter

    limiter = FixedWindowRateLimiter()
    # Redis is unavailable in tests, so this exercises the in-memory fallback.
    allowed = [limiter.allow("unit-test-key", max_attempts=3, window_seconds=60) for _ in range(4)]
    assert allowed == [True, True, True, False]

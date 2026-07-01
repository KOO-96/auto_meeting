import logging

from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.enums import ProcessingJobStatus
from app.models.meeting import Meeting
from app.models.processing_job import ProcessingJob
from app.worker.agent import AgentInputFile, MeetingAgent, MeetingSnapshot
from app.worker.result_writer import ResultWriter

logger = logging.getLogger(__name__)

STEP_BY_NODE = {
    "load_inputs": 1,
    "process_audio": 2,
    "process_visuals": 3,
    "skip_visuals": 3,
    "align_timeline": 3,
    "generate_minutes": 4,
    "validate_outputs": 5,
}

ACTIVE_JOB_STATUSES = [
    ProcessingJobStatus.queued,
    ProcessingJobStatus.processing,
    ProcessingJobStatus.validating,
]


def _active_job(db, meeting_id: int) -> ProcessingJob | None:
    job = db.scalar(
        select(ProcessingJob)
        .where(
            ProcessingJob.meeting_id == meeting_id,
            ProcessingJob.status.in_(ACTIVE_JOB_STATUSES),
        )
        .order_by(ProcessingJob.created_at.desc())
    )
    if job:
        return job
    # Fall back to the newest job (e.g. a re-run that reused a terminal row).
    return db.scalar(
        select(ProcessingJob)
        .where(ProcessingJob.meeting_id == meeting_id)
        .order_by(ProcessingJob.created_at.desc())
    )


def _build_snapshot(meeting: Meeting) -> MeetingSnapshot:
    input_files = [
        AgentInputFile(
            id=file.id,
            file_type=file.file_type,
            path=file.storage_path or file.local_source_path,
            mime_type=file.mime_type,
            file_name=file.original_filename or file.stored_filename,
        )
        for file in meeting.files
    ]
    memo_texts = [memo.memo for memo in meeting.memos if memo.memo]
    if meeting.additional_memo:
        memo_texts.insert(0, meeting.additional_memo)

    timed_memos = [
        {"timestamp_ms": memo.timestamp_ms, "text": memo.memo}
        for memo in meeting.memos
        if memo.memo and memo.timestamp_ms is not None
    ]

    return MeetingSnapshot(
        meeting_id=meeting.id,
        title=meeting.title,
        input_files=input_files,
        memo_texts=memo_texts,
        timed_memos=timed_memos,
    )


def _persist_progress(
    meeting_id: int, job_pk: int, status: ProcessingJobStatus, step: int
) -> None:
    """Write a progress checkpoint in its own short-lived session."""
    with SessionLocal() as db:
        meeting = db.get(Meeting, meeting_id)
        job = db.get(ProcessingJob, job_pk)
        if not meeting or not job:
            return
        ResultWriter(db).update_progress(meeting, job, status, step)


def run_meeting_pipeline(meeting_id: int) -> None:
    # --- Phase 1: load inputs and mark the run started (short session) ------
    with SessionLocal() as db:
        meeting = db.get(Meeting, meeting_id)
        job = _active_job(db, meeting_id) if meeting else None
        if not meeting or not job:
            logger.warning(
                "run_meeting_pipeline: meeting=%s job=%s missing; nothing to do",
                meeting_id,
                job.id if job else None,
            )
            return
        job_pk = job.id
        snapshot = _build_snapshot(meeting)
        ResultWriter(db).update_progress(meeting, job, ProcessingJobStatus.processing, 0)

    # --- Phase 2: run the agent WITHOUT holding a DB session ----------------
    # The graph performs slow STT/VLM/LLM network calls; pinning a pooled
    # connection across them would exhaust the pool under concurrency.
    def on_node(node_name: str) -> None:
        step = STEP_BY_NODE.get(node_name, 0)
        status = (
            ProcessingJobStatus.validating
            if node_name == "validate_outputs"
            else ProcessingJobStatus.processing
        )
        _persist_progress(meeting_id, job_pk, status, step)

    try:
        agent = MeetingAgent(snapshot, on_node_complete=on_node)
        agent.run()
    except Exception as error:  # noqa: BLE001 - persist arbitrary agent failure.
        logger.exception("Agent run failed for meeting %s", meeting_id)
        _persist_failure(meeting_id, job_pk, str(error))
        return

    # --- Phase 3: persist results (short session) ---------------------------
    with SessionLocal() as db:
        meeting = db.get(Meeting, meeting_id)
        job = db.get(ProcessingJob, job_pk)
        if not meeting or not job:
            logger.warning(
                "run_meeting_pipeline: meeting=%s vanished before result write",
                meeting_id,
            )
            return

        writer = ResultWriter(db)
        try:
            writer.reset_derived_results(meeting.id)
            transcript = agent.state.transcript or {}
            writer.save_transcript(
                meeting.id,
                str(transcript.get("content") or ""),
                transcript.get("segments") or [],
            )
            for visual in agent.state.visual_results:
                writer.save_visual_analysis(
                    meeting.id,
                    visual.payload,
                    source_file_id=visual.source_file_id,
                    image_path=visual.image_path,
                )
            writer.save_analysis(meeting.id, agent.state.minutes)
            writer.complete(meeting, job)
        except Exception as error:  # noqa: BLE001 - persist arbitrary write failure.
            logger.exception("Result persistence failed for meeting %s", meeting_id)
            writer.fail(meeting, job, str(error))


def _persist_failure(meeting_id: int, job_pk: int, message: str) -> None:
    with SessionLocal() as db:
        meeting = db.get(Meeting, meeting_id)
        job = db.get(ProcessingJob, job_pk)
        if not meeting or not job:
            return
        ResultWriter(db).fail(meeting, job, message)

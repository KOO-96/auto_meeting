def process_meeting_job(meeting_id: int) -> None:
    from app.worker.pipeline import run_meeting_pipeline

    run_meeting_pipeline(meeting_id)


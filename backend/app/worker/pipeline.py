from sqlalchemy import select

from app.db.session import SessionLocal
from app.models.enums import ProcessingJobStatus
from app.models.meeting import Meeting
from app.models.processing_job import ProcessingJob
from app.worker.agent import MeetingAgent
from app.worker.result_writer import ResultWriter


def run_meeting_pipeline(meeting_id: int) -> None:
    with SessionLocal() as db:
        meeting = db.get(Meeting, meeting_id)
        job = db.scalar(
            select(ProcessingJob)
            .where(ProcessingJob.meeting_id == meeting_id)
            .order_by(ProcessingJob.created_at.desc())
        )

        if not meeting or not job:
            return

        writer = ResultWriter(db)

        try:
            def update_node_progress(node_name: str) -> None:
                step_by_node = {
                    "load_inputs": 1,
                    "process_audio": 2,
                    "process_visuals": 3,
                    "skip_visuals": 3,
                    "align_timeline": 3,
                    "generate_minutes": 4,
                    "validate_outputs": 5,
                }
                step = step_by_node[node_name]
                status = (
                    ProcessingJobStatus.validating
                    if node_name == "validate_outputs"
                    else ProcessingJobStatus.processing
                )
                writer.update_progress(meeting, job, status, step)

            agent = MeetingAgent(meeting, on_node_complete=update_node_progress)
            agent.run()
            writer.save_transcript(
                meeting.id,
                agent.state.transcript["content"],
                agent.state.transcript["segments"],
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
        except Exception as error:  # noqa: BLE001 - worker must persist arbitrary failure.
            writer.fail(meeting, job, str(error))

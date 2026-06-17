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
            writer.update_progress(meeting, job, ProcessingJobStatus.processing, 1)
            agent = MeetingAgent(meeting)
            agent.load_inputs()
            writer.update_progress(meeting, job, ProcessingJobStatus.processing, 2)
            agent.process_audio()
            writer.update_progress(meeting, job, ProcessingJobStatus.processing, 3)
            agent.process_visuals()
            writer.update_progress(meeting, job, ProcessingJobStatus.processing, 4)
            agent.align_timeline()
            agent.generate_minutes()
            writer.update_progress(meeting, job, ProcessingJobStatus.validating, 5)
            agent.validate_outputs()
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

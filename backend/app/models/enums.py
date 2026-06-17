from enum import StrEnum


class UserRole(StrEnum):
    admin = "admin"
    member = "member"


class MeetingStatus(StrEnum):
    draft = "draft"
    recording = "recording"
    metadata_saved = "metadata_saved"
    queued = "queued"
    processing = "processing"
    validating = "validating"
    completed = "completed"
    failed = "failed"


class RoleInMeeting(StrEnum):
    host = "host"
    participant = "participant"
    observer = "observer"


class FileType(StrEnum):
    audio = "audio"
    screen_recording = "screen_recording"
    memo_json = "memo_json"
    metadata_json = "metadata_json"
    image = "image"
    document = "document"
    attachment = "attachment"


class ProcessingJobStatus(StrEnum):
    queued = "queued"
    processing = "processing"
    validating = "validating"
    completed = "completed"
    failed = "failed"


class TranscriptType(StrEnum):
    audio = "audio"
    screen_audio = "screen_audio"
    merged = "merged"


class ImageType(StrEnum):
    ppt_slide = "ppt_slide"
    architecture_diagram = "architecture_diagram"
    whiteboard = "whiteboard"
    document_capture = "document_capture"
    unknown = "unknown"


class MeetingType(StrEnum):
    general_meeting = "general_meeting"
    task_assignment = "task_assignment"
    project_planning = "project_planning"
    wbs_planning = "wbs_planning"
    decision_meeting = "decision_meeting"
    retrospective = "retrospective"
    hr_sensitive = "hr_sensitive"
    architecture_review = "architecture_review"
    incident_review = "incident_review"
    unknown = "unknown"


class ExportType(StrEnum):
    markdown = "markdown"
    pdf = "pdf"


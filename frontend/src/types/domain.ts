import type { LocalAttachment } from './electron'

export type UserRole = 'admin' | 'member'

export type User = {
  id: number
  name: string
  email: string
  department?: string | null
  position?: string | null
  role: UserRole
}

export type Participant = User

export type MeetingFileMetadata = {
  id: number
  meeting_id: number
  file_type: string
  original_filename?: string | null
  stored_filename?: string | null
  storage_path?: string | null
  local_source_path?: string | null
  mime_type?: string | null
  size_bytes?: number | null
  duration_ms?: number | null
  uploaded_by?: number | null
  created_at: string
}

export type ScreenRecordingStatus =
  | 'idle'
  | 'permission_checking'
  | 'recording'
  | 'stopping'
  | 'saved'
  | 'failed'

export type AudioRecordingStatus =
  | 'idle'
  | 'permission_checking'
  | 'recording'
  | 'paused'
  | 'stopping'
  | 'saved'
  | 'failed'

export type TimelineMemo = {
  id: string
  meeting_id: number
  timestamp_ms: number
  memo: string
  created_at: string
  audio_elapsed_ms?: number | null
  screen_elapsed_ms?: number | null
  created_by: number
}

export type Meeting = {
  id: number
  title: string
  meeting_date: string
  project_name?: string | null
  meeting_series?: string | null
  participant_ids: number[]
  participant_only: boolean
  creator_id: number
  extra_memo?: string | null
  local_base_path?: string | null
  screen_file_path?: string | null
  audio_file_path?: string | null
  memo_file_path?: string | null
  metadata_file_path?: string | null
  files: MeetingFileMetadata[]
  attachments: LocalAttachment[]
  status: string
  current_step?: number | null
  total_steps?: number | null
  processing_started_at?: number | null
  keywords: string[]
  created_at: string
  updated_at: string
  finished_at?: string | null
}

export type MeetingProcessingStatusResponse = {
  meeting_id: number
  status: string
  current_step?: number
  total_steps?: number
  message?: string
  error_message?: string | null
}

export type Decision = {
  content: string
  decided_at?: string | null
  related_participants?: string[]
}

export type ActionItem = {
  content: string
  assignee?: string | null
  due_date?: string | null
  priority?: 'low' | 'medium' | 'high' | null
  status?: 'todo' | 'doing' | 'done' | null
}

export type FrameTimelineItem = {
  timestamp_ms: number
  frame_image_url?: string | null
  description: string
}

export type MeetingResult = {
  one_line_summary: string
  detailed_summary: string
  keywords: string[]
  decisions: Decision[]
  action_items: ActionItem[]
  open_issues: string[]
  risks: string[]
  next_agenda: string[]
  next_decision_items: string[]
  frame_timeline: FrameTimelineItem[]
}

export type MeetingSessionMetadata = {
  meeting_id: number
  title: string
  meeting_date: string
  project_name?: string | null
  meeting_series?: string | null
  participant_ids: number[]
  participant_only: boolean
  local_base_path: string
  screen_recording?: {
    enabled: boolean
    file_path?: string | null
    format: string
    includes_microphone: boolean
    includes_system_audio: boolean
    duration_ms?: number | null
  }
  audio_recording?: {
    enabled: boolean
    file_path?: string | null
    format: string
    duration_ms?: number | null
  }
  memos: {
    file_path: string
    count: number
  }
  attachments: {
    file_name: string
    file_path: string
    mime_type?: string | null
    size_bytes?: number | null
  }[]
  created_at: string
  finished_at?: string | null
}

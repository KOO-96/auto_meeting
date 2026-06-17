import { getElectronAPI } from './electron'
import { useAuthStore } from '@/stores/auth-store'
import type {
  ActionItem,
  Meeting,
  MeetingFileMetadata,
  MeetingProcessingStatusResponse,
  MeetingResult,
  Participant,
  TimelineMemo,
  User,
} from '@/types/domain'
import type { LocalAttachment, SavedFile } from '@/types/electron'

type BackendUser = {
  id: number
  name: string
  email: string
  department?: string | null
  position?: string | null
  role: 'admin' | 'member'
  is_active?: boolean
}

type BackendMeetingFile = {
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

type BackendMeetingParticipant = {
  id: number
  meeting_id: number
  user_id: number
  role_in_meeting: string
  created_at: string
}

type BackendMeeting = {
  id: number
  title: string
  meeting_date: string
  project_id?: number | null
  series_id?: number | null
  project_name?: string | null
  meeting_series?: string | null
  owner_id: number
  participants_only: boolean
  status: string
  progress_current: number
  progress_total: number
  error_message?: string | null
  additional_memo?: string | null
  local_base_path?: string | null
  created_at: string
  updated_at: string
  started_at?: string | null
  finished_at?: string | null
  participants: BackendMeetingParticipant[]
  files: BackendMeetingFile[]
}

type BackendMeetingResult = {
  meeting_id: number
  one_line_summary: string
  detailed_summary: string
  keywords: string[]
  decisions: Array<Record<string, unknown>>
  action_items: Array<Record<string, unknown>>
  open_questions: Array<Record<string, unknown>>
  risks: Array<Record<string, unknown>>
  next_agenda: string[]
  next_decision_items: string[]
}

type Project = {
  id: number
  name: string
  description?: string | null
}

type MeetingSeries = {
  id: number
  project_id?: number | null
  title: string
  description?: string | null
}

const syncedMemoClientIds = new Set<string>()

async function apiBaseUrl(): Promise<string> {
  const electron = getElectronAPI()

  if (!electron) {
    return 'http://localhost:8000'
  }

  try {
    const settings = await electron.getAppSettings()
    return settings.backendApiUrl.replace(/\/$/, '')
  } catch {
    return 'http://localhost:8000'
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const baseUrl = await apiBaseUrl()
  const token = useAuthStore.getState().accessToken
  const headers = new Headers(options.headers)

  if (!(options.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json')
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  })

  if (response.status === 401) {
    useAuthStore.getState().logout()
  }

  if (!response.ok) {
    let detail: string
    try {
      const body = (await response.json()) as { detail?: unknown }
      detail =
        typeof body.detail === 'string'
          ? body.detail
          : JSON.stringify(body.detail ?? body)
    } catch {
      detail = await response.text()
    }
    throw new Error(
      detail || `${response.status} ${response.statusText}` || 'Backend API 요청에 실패했습니다.',
    )
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function mapUser(user: BackendUser): User {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    department: user.department ?? null,
    position: user.position ?? null,
    role: user.role,
  }
}

function filePath(file?: BackendMeetingFile): string | null {
  return file?.local_source_path ?? file?.storage_path ?? null
}

function mapAttachment(file: BackendMeetingFile): LocalAttachment {
  return {
    id: String(file.id),
    fileName:
      file.original_filename ??
      file.stored_filename ??
      file.local_source_path?.split('/').at(-1) ??
      'attachment',
    path: filePath(file) ?? '',
    sizeBytes: file.size_bytes ?? null,
    mimeType: file.mime_type ?? null,
    copiedAt: file.created_at,
  }
}

function mapMeetingFile(file: BackendMeetingFile): MeetingFileMetadata {
  return {
    id: file.id,
    meeting_id: file.meeting_id,
    file_type: file.file_type,
    original_filename: file.original_filename ?? null,
    stored_filename: file.stored_filename ?? null,
    storage_path: file.storage_path ?? null,
    local_source_path: file.local_source_path ?? null,
    mime_type: file.mime_type ?? null,
    size_bytes: file.size_bytes ?? null,
    duration_ms: file.duration_ms ?? null,
    uploaded_by: file.uploaded_by ?? null,
    created_at: file.created_at,
  }
}

function mapMeeting(meeting: BackendMeeting): Meeting {
  const screenFile = meeting.files.find(
    (file) => file.file_type === 'screen_recording',
  )
  const audioFile = meeting.files.find((file) => file.file_type === 'audio')
  const memoFile = meeting.files.find((file) => file.file_type === 'memo_json')
  const metadataFile = meeting.files.find(
    (file) => file.file_type === 'metadata_json',
  )
  const attachments = meeting.files
    .filter((file) =>
      ['attachment', 'image', 'document'].includes(file.file_type),
    )
    .map(mapAttachment)

  return {
    id: meeting.id,
    title: meeting.title,
    meeting_date: meeting.meeting_date,
    project_name: meeting.project_name ?? null,
    meeting_series: meeting.meeting_series ?? null,
    participant_ids: meeting.participants.map((participant) => participant.user_id),
    participant_only: meeting.participants_only,
    creator_id: meeting.owner_id,
    extra_memo: meeting.additional_memo ?? null,
    local_base_path: meeting.local_base_path ?? null,
    screen_file_path: filePath(screenFile),
    audio_file_path: filePath(audioFile),
    memo_file_path: filePath(memoFile),
    metadata_file_path: filePath(metadataFile),
    files: meeting.files.map(mapMeetingFile),
    attachments,
    status: meeting.status,
    current_step: meeting.progress_current,
    total_steps: meeting.progress_total,
    processing_started_at: null,
    keywords: [],
    created_at: meeting.created_at,
    updated_at: meeting.updated_at,
    finished_at: meeting.finished_at ?? null,
  }
}

function filenameFromDisposition(disposition: string | null): string | null {
  if (!disposition) {
    return null
  }

  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i)
  if (utf8Match?.[1]) {
    return decodeURIComponent(utf8Match[1])
  }

  const match = disposition.match(/filename="?([^";]+)"?/i)
  return match?.[1] ?? null
}

async function downloadAuthenticated(path: string): Promise<{
  fileName: string
  mimeType: string | null
  data: ArrayBuffer
}> {
  const baseUrl = await apiBaseUrl()
  const token = useAuthStore.getState().accessToken
  const headers = new Headers()

  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  const response = await fetch(`${baseUrl}${path}`, { headers })

  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`)
  }

  return {
    fileName:
      filenameFromDisposition(response.headers.get('content-disposition')) ??
      path.split('/').at(-1) ??
      'download.bin',
    mimeType: response.headers.get('content-type'),
    data: await response.arrayBuffer(),
  }
}

function textFromUnknown(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value
  }

  if (value && typeof value === 'object') {
    const object = value as Record<string, unknown>
    return String(
      object.content ??
        object.task ??
        object.question ??
        object.risk ??
        fallback,
    )
  }

  return fallback
}

function mapResult(result: BackendMeetingResult): MeetingResult {
  const actionItems: ActionItem[] = result.action_items.map((item) => ({
    content: textFromUnknown(item, '액션아이템'),
    assignee:
      typeof item.assignee === 'string'
        ? item.assignee
        : typeof item.owner === 'string'
          ? item.owner
          : null,
    due_date: typeof item.due_date === 'string' ? item.due_date : null,
    priority:
      item.priority === 'low' ||
      item.priority === 'medium' ||
      item.priority === 'high'
        ? item.priority
        : null,
    status:
      item.status === 'todo' || item.status === 'doing' || item.status === 'done'
        ? item.status
        : null,
  }))

  return {
    one_line_summary: result.one_line_summary,
    detailed_summary: result.detailed_summary,
    keywords: result.keywords,
    decisions: result.decisions.map((item) => ({
      content: textFromUnknown(item, '결정사항'),
      related_participants: Array.isArray(item.related_participants)
        ? item.related_participants.map(String)
        : [],
    })),
    action_items: actionItems,
    open_issues: result.open_questions.map((item) =>
      textFromUnknown(item, '미결정 안건'),
    ),
    risks: result.risks.map((item) => textFromUnknown(item, '리스크')),
    next_agenda: result.next_agenda,
    next_decision_items: result.next_decision_items,
    frame_timeline: [],
  }
}

async function createProjectIfNeeded(name?: string | null): Promise<Project | null> {
  const trimmed = name?.trim()
  if (!trimmed) {
    return null
  }

  return request<Project>('/api/projects', {
    method: 'POST',
    body: JSON.stringify({ name: trimmed }),
  })
}

async function createSeriesIfNeeded(
  title?: string | null,
  projectId?: number | null,
): Promise<MeetingSeries | null> {
  const trimmed = title?.trim()
  if (!trimmed) {
    return null
  }

  return request<MeetingSeries>('/api/meeting-series', {
    method: 'POST',
    body: JSON.stringify({
      title: trimmed,
      project_id: projectId ?? null,
    }),
  })
}

export const authApi = {
  async login(payload: { email: string; password: string }): Promise<{
    user: User
    accessToken: string
    refreshToken: string
  }> {
    const response = await request<{
      access_token: string
      refresh_token: string
      user: BackendUser
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    return {
      user: mapUser(response.user),
      accessToken: response.access_token,
      refreshToken: response.refresh_token,
    }
  },

  async logout(refreshToken?: string | null): Promise<void> {
    await request('/api/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: refreshToken ?? null }),
    })
  },
}

export const participantsApi = {
  async list(): Promise<Participant[]> {
    const users = await request<BackendUser[]>('/api/participants')
    return users.map(mapUser)
  },

  async search(query: string): Promise<Participant[]> {
    const params = new URLSearchParams()
    if (query.trim()) {
      params.set('q', query.trim())
    }
    const users = await request<BackendUser[]>(
      `/api/participants/search${params.toString() ? `?${params}` : ''}`,
    )
    return users.map(mapUser)
  },

  async create(
    payload: Omit<Participant, 'id'> & { password?: string },
  ): Promise<Participant> {
    const user = await request<BackendUser>('/api/participants', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        password: payload.password || 'password',
      }),
    })
    return mapUser(user)
  },
}

export const meetingsApi = {
  async list(): Promise<Meeting[]> {
    const meetings = await request<BackendMeeting[]>('/api/meetings')
    return meetings.map(mapMeeting)
  },

  async get(id: number): Promise<Meeting> {
    return mapMeeting(await request<BackendMeeting>(`/api/meetings/${id}`))
  },

  async delete(id: number): Promise<void> {
    await request(`/api/meetings/${id}`, { method: 'DELETE' })
  },

  async create(
    payload: {
      title: string
      meeting_date: string
      project_name?: string | null
      meeting_series?: string | null
      participant_ids: number[]
      participant_only: boolean
      extra_memo?: string | null
    },
    currentUser: User,
  ): Promise<Meeting> {
    void currentUser
    const project = await createProjectIfNeeded(payload.project_name)
    const series = await createSeriesIfNeeded(payload.meeting_series, project?.id)
    const created = await request<{ meeting_id: number; status: string }>(
      '/api/meetings',
      {
        method: 'POST',
        body: JSON.stringify({
          title: payload.title,
          meeting_date: payload.meeting_date,
          project_id: project?.id ?? null,
          series_id: series?.id ?? null,
          participant_ids: payload.participant_ids,
          participants_only: payload.participant_only,
          additional_memo: payload.extra_memo ?? null,
        }),
      },
    )

    return this.get(created.meeting_id)
  },

  async update(id: number, patch: Partial<Meeting>): Promise<Meeting> {
    const body: Record<string, unknown> = {}

    if (patch.title !== undefined) body.title = patch.title
    if (patch.meeting_date !== undefined) body.meeting_date = patch.meeting_date
    if (patch.participant_only !== undefined) {
      body.participants_only = patch.participant_only
    }
    if (patch.extra_memo !== undefined) {
      body.additional_memo = patch.extra_memo
    }
    if (patch.participant_ids !== undefined) {
      body.participant_ids = patch.participant_ids
    }

    if (Object.keys(body).length === 0) {
      return this.get(id)
    }

    return mapMeeting(
      await request<BackendMeeting>(`/api/meetings/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      }),
    )
  },

  async start(id: number): Promise<Meeting> {
    await request(`/api/meetings/${id}/start`, { method: 'POST' })
    return this.get(id)
  },

  async appendAttachments(
    id: number,
    attachments: LocalAttachment[],
  ): Promise<Meeting> {
    void attachments
    return this.get(id)
  },

  async uploadFile(
    id: number,
    fileType: string,
    file: File,
  ): Promise<MeetingFileMetadata> {
    const formData = new FormData()
    formData.append('file', file)

    return mapMeetingFile(
      await request<BackendMeetingFile>(
        `/api/meetings/${id}/files?file_type=${encodeURIComponent(fileType)}`,
        {
          method: 'POST',
          body: formData,
        },
      ),
    )
  },

  async downloadFileToLocal(
    id: number,
    fileId: number,
  ): Promise<SavedFile> {
    const electron = getElectronAPI()
    if (!electron) {
      throw new Error('Electron preload API를 사용할 수 없습니다.')
    }

    const download = await downloadAuthenticated(
      `/api/meetings/${id}/files/${fileId}/download`,
    )
    return electron.saveBinaryExport({
      meetingId: id,
      fileName: download.fileName,
      data: download.data,
      mimeType: download.mimeType,
    })
  },

  async finish(
    id: number,
    payload: {
      local_base_path?: string | null
      screen_file_path?: string | null
      audio_file_path?: string | null
      memo_file_path?: string | null
      metadata_file_path?: string | null
      attachments?: LocalAttachment[]
    },
  ): Promise<Meeting> {
    await request(`/api/meetings/${id}/finish`, {
      method: 'POST',
      body: JSON.stringify({
        local_base_path: payload.local_base_path,
        screen_file_path: payload.screen_file_path,
        audio_file_path: payload.audio_file_path,
        memo_file_path: payload.memo_file_path,
        metadata_file_path: payload.metadata_file_path,
        attachment_paths:
          payload.attachments?.map((attachment) => attachment.path) ?? [],
        finished_at: new Date().toISOString(),
      }),
    })
    return this.get(id)
  },

  async process(id: number): Promise<Meeting> {
    await request(`/api/meetings/${id}/process`, { method: 'POST' })
    return this.get(id)
  },

  async retry(id: number): Promise<Meeting> {
    await request(`/api/meetings/${id}/retry`, { method: 'POST' })
    return this.get(id)
  },

  async getStatus(id: number): Promise<MeetingProcessingStatusResponse> {
    return request<MeetingProcessingStatusResponse>(`/api/meetings/${id}/status`)
  },

  async getResult(id: number): Promise<MeetingResult> {
    return mapResult(
      await request<BackendMeetingResult>(`/api/meetings/${id}/result`),
    )
  },

  async saveMemos(id: number, memos: TimelineMemo[]): Promise<TimelineMemo[]> {
    const unsynced = memos.filter((memo) => !syncedMemoClientIds.has(memo.id))

    await Promise.all(
      unsynced.map((memo) =>
        request(`/api/meetings/${id}/memos`, {
          method: 'POST',
          body: JSON.stringify({
            timestamp_ms: memo.timestamp_ms,
            audio_elapsed_ms: memo.audio_elapsed_ms,
            screen_elapsed_ms: memo.screen_elapsed_ms,
            memo: memo.memo,
            created_by: memo.created_by,
            created_at: memo.created_at,
          }),
        }),
      ),
    )
    unsynced.forEach((memo) => syncedMemoClientIds.add(memo.id))
    return this.getMemos(id)
  },

  async getMemos(id: number): Promise<TimelineMemo[]> {
    const memos = await request<
      Array<{
        id: number
        meeting_id: number
        author_id: number
        timestamp_ms: number
        audio_elapsed_ms?: number | null
        screen_elapsed_ms?: number | null
        memo: string
        created_at: string
      }>
    >(`/api/meetings/${id}/memos`)

    return memos.map((memo) => {
      syncedMemoClientIds.add(String(memo.id))
      return {
        id: String(memo.id),
        meeting_id: memo.meeting_id,
        timestamp_ms: memo.timestamp_ms,
        audio_elapsed_ms: memo.audio_elapsed_ms ?? null,
        screen_elapsed_ms: memo.screen_elapsed_ms ?? null,
        memo: memo.memo,
        created_at: memo.created_at,
        created_by: memo.author_id,
      }
    })
  },

  async createBackendExport(
    id: number,
    exportType: 'markdown' | 'pdf',
  ): Promise<{ download_url: string }> {
    return request<{ export_id: number; export_type: string; download_url: string }>(
      `/api/meetings/${id}/exports`,
      {
        method: 'POST',
        body: JSON.stringify({ export_type: exportType }),
      },
    )
  },

  async createAndDownloadBackendExport(
    id: number,
    exportType: 'markdown' | 'pdf',
  ): Promise<SavedFile> {
    const electron = getElectronAPI()
    if (!electron) {
      throw new Error('Electron preload API를 사용할 수 없습니다.')
    }

    const exportFile = await this.createBackendExport(id, exportType)
    const download = await downloadAuthenticated(exportFile.download_url)
    return electron.saveBinaryExport({
      meetingId: id,
      fileName: download.fileName,
      data: download.data,
      mimeType: download.mimeType,
    })
  },
}

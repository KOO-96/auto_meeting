export type PermissionStatus =
  | 'granted'
  | 'denied'
  | 'restricted'
  | 'not-determined'
  | 'unknown'

export type RecordingFileFormat = 'webm'

export type AppSettings = {
  defaultSaveDirectory: string
  downloadDirectory: string
  backendApiUrl: string
  screenRecordingFormat: RecordingFileFormat
  audioRecordingFormat: RecordingFileFormat
  autoSave: boolean
  notifyOnProcessingComplete: boolean
}

export type ScreenSource = {
  id: string
  name: string
  displayId?: string
  thumbnailDataUrl?: string
}

export type MeetingDirectory = {
  meetingId: number
  path: string
  screenPath: string
  audioPath: string
  attachmentsPath: string
  memosPath: string
  metadataPath: string
  logsPath: string
  exportsPath: string
}

export type LocalFile = {
  fileName: string
  path: string
  sizeBytes?: number | null
  mimeType?: string | null
}

export type LocalAttachment = LocalFile & {
  id: string
  copiedAt: string
}

export type PendingLocalFile = LocalFile

export type SavedFile = LocalFile & {
  savedAt: string
}

export type CreateMeetingDirectoryPayload = {
  meetingId: number
  title?: string
}

export type SaveRecordingFilePayload = {
  meetingId: number
  folder: 'screen' | 'audio'
  fileName: string
  data: ArrayBuffer | Uint8Array | number[]
}

export type SaveJsonFilePayload = {
  meetingId: number
  folder: 'memos' | 'metadata'
  fileName: string
  data: unknown
}

export type CopyAttachmentPayload = {
  meetingId: number
  sourcePath: string
}

export type SaveExportFilePayload = {
  meetingId: number
  fileName: string
  content: string
}

export type SavePdfExportPayload = {
  meetingId: number
  fileName: string
  html: string
}

export type SaveBinaryExportPayload = {
  meetingId: number
  fileName: string
  data: ArrayBuffer | Uint8Array | number[]
  mimeType?: string | null
}

export type AppLogPayload = {
  level: 'debug' | 'info' | 'warn' | 'error'
  scope: string
  meeting_id?: number | null
  message: string
  metadata?: Record<string, unknown>
}

export type ActiveMeetingSessionPayload = {
  active: boolean
  meetingId?: number | null
  title?: string | null
}

export type ElectronAPI = {
  getPrimaryScreenSource: () => Promise<ScreenSource>
  createMeetingDirectory: (
    payload: CreateMeetingDirectoryPayload,
  ) => Promise<MeetingDirectory>
  saveRecordingFile: (
    payload: SaveRecordingFilePayload,
  ) => Promise<SavedFile>
  saveJsonFile: (payload: SaveJsonFilePayload) => Promise<SavedFile>
  copyAttachmentToMeetingDirectory: (
    payload: CopyAttachmentPayload,
  ) => Promise<LocalAttachment>
  selectLocalFiles: () => Promise<PendingLocalFile[]>
  openMeetingDirectory: (meetingId: number) => Promise<void>
  selectDefaultSaveDirectory: () => Promise<string | null>
  getDefaultSaveDirectory: () => Promise<string>
  getAppSettings: () => Promise<AppSettings>
  updateAppSettings: (payload: Partial<AppSettings>) => Promise<AppSettings>
  openFile: (path: string) => Promise<void>
  openDirectory: (path: string) => Promise<void>
  checkMicrophonePermission: () => Promise<PermissionStatus>
  checkScreenRecordingPermission: () => Promise<PermissionStatus>
  openSystemPermissionSetting: (
    permissionType: 'microphone' | 'screen',
  ) => Promise<void>
  showRuntimePermissionTarget: () => Promise<string>
  writeAppLog: (payload: AppLogPayload) => Promise<void>
  openLogDirectory: () => Promise<void>
  saveExportFile: (payload: SaveExportFilePayload) => Promise<SavedFile>
  savePdfExport: (payload: SavePdfExportPayload) => Promise<SavedFile>
  saveBinaryExport: (payload: SaveBinaryExportPayload) => Promise<SavedFile>
  setActiveMeetingSession: (
    payload: ActiveMeetingSessionPayload,
  ) => Promise<void>
  getSecureItem: (key: string) => Promise<string | null>
  setSecureItem: (key: string, value: string) => Promise<void>
  removeSecureItem: (key: string) => Promise<void>
}

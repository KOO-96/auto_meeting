import { contextBridge, ipcRenderer } from 'electron'
import type {
  ActiveMeetingSessionPayload,
  AppLogPayload,
  AppSettings,
  CopyAttachmentPayload,
  CreateMeetingDirectoryPayload,
  ElectronAPI,
  SaveExportFilePayload,
  SaveJsonFilePayload,
  SaveBinaryExportPayload,
  SavePdfExportPayload,
  SaveRecordingFilePayload,
} from '../../src/types/electron'

const api: ElectronAPI = {
  getPrimaryScreenSource: () => ipcRenderer.invoke('screen:get-primary-source'),
  createMeetingDirectory: (payload: CreateMeetingDirectoryPayload) =>
    ipcRenderer.invoke('meeting:create-directory', payload),
  saveRecordingFile: (payload: SaveRecordingFilePayload) =>
    ipcRenderer.invoke('file:save-recording', payload),
  saveJsonFile: (payload: SaveJsonFilePayload) =>
    ipcRenderer.invoke('file:save-json', payload),
  copyAttachmentToMeetingDirectory: (payload: CopyAttachmentPayload) =>
    ipcRenderer.invoke('file:copy-attachment', payload),
  selectLocalFiles: () => ipcRenderer.invoke('dialog:select-local-files'),
  openMeetingDirectory: (meetingId: number) =>
    ipcRenderer.invoke('shell:open-meeting-directory', meetingId),
  selectDefaultSaveDirectory: () =>
    ipcRenderer.invoke('dialog:select-default-save-directory'),
  getDefaultSaveDirectory: () => ipcRenderer.invoke('settings:get-default-path'),
  getAppSettings: () => ipcRenderer.invoke('settings:get'),
  updateAppSettings: (payload: Partial<AppSettings>) =>
    ipcRenderer.invoke('settings:update', payload),
  openFile: (path: string) => ipcRenderer.invoke('shell:open-file', path),
  openDirectory: (path: string) =>
    ipcRenderer.invoke('shell:open-directory', path),
  checkMicrophonePermission: () =>
    ipcRenderer.invoke('permission:check-microphone'),
  checkScreenRecordingPermission: () =>
    ipcRenderer.invoke('permission:check-screen'),
  openSystemPermissionSetting: (permissionType: 'microphone' | 'screen') =>
    ipcRenderer.invoke('permission:open-setting', permissionType),
  showRuntimePermissionTarget: () =>
    ipcRenderer.invoke('permission:show-runtime-target'),
  writeAppLog: (payload: AppLogPayload) =>
    ipcRenderer.invoke('log:write', payload),
  openLogDirectory: () => ipcRenderer.invoke('log:open-directory'),
  saveExportFile: (payload: SaveExportFilePayload) =>
    ipcRenderer.invoke('export:save-file', payload),
  savePdfExport: (payload: SavePdfExportPayload) =>
    ipcRenderer.invoke('export:save-pdf', payload),
  saveBinaryExport: (payload: SaveBinaryExportPayload) =>
    ipcRenderer.invoke('export:save-binary', payload),
  setActiveMeetingSession: (payload: ActiveMeetingSessionPayload) =>
    ipcRenderer.invoke('app:set-active-meeting-session', payload),
  getSecureItem: (key: string) => ipcRenderer.invoke('secure-store:get', key),
  setSecureItem: (key: string, value: string) =>
    ipcRenderer.invoke('secure-store:set', key, value),
  removeSecureItem: (key: string) =>
    ipcRenderer.invoke('secure-store:remove', key),
}

contextBridge.exposeInMainWorld('electronAPI', api)

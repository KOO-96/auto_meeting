import {
  app,
  BrowserWindow,
  desktopCapturer,
  dialog,
  ipcMain,
  screen,
  shell,
  systemPreferences,
} from 'electron'
import type { OpenDialogOptions } from 'electron'
import { mkdir, readFile, stat, writeFile, copyFile, appendFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import type {
  ActiveMeetingSessionPayload,
  AppLogPayload,
  AppSettings,
  CopyAttachmentPayload,
  CreateMeetingDirectoryPayload,
  LocalAttachment,
  PendingLocalFile,
  PermissionStatus,
  SaveExportFilePayload,
  SaveBinaryExportPayload,
  SaveJsonFilePayload,
  SavePdfExportPayload,
  SaveRecordingFilePayload,
  SavedFile,
} from '../../src/types/electron'

let mainWindow: BrowserWindow | null = null
let activeMeetingSession: ActiveMeetingSessionPayload = { active: false }
let allowCloseAfterConfirm = false

function companyBrainRoot(): string {
  return join(app.getPath('home'), 'CompanyBrain')
}

function defaultSettings(): AppSettings {
  const root = companyBrainRoot()

  return {
    defaultSaveDirectory: root,
    downloadDirectory: join(root, 'downloads'),
    backendApiUrl: 'http://localhost:8000',
    screenRecordingFormat: 'webm',
    audioRecordingFormat: 'webm',
    autoSave: true,
    notifyOnProcessingComplete: true,
  }
}

async function ensureDirectory(path: string): Promise<void> {
  await mkdir(path, { recursive: true })
}

async function readSettings(): Promise<AppSettings> {
  const defaults = defaultSettings()
  const configDir = join(companyBrainRoot(), 'config')
  const configPath = join(configDir, 'settings.json')

  await ensureDirectory(configDir)

  if (!existsSync(configPath)) {
    await writeFile(configPath, JSON.stringify(defaults, null, 2))
    return defaults
  }

  try {
    const raw = await readFile(configPath, 'utf8')
    return { ...defaults, ...JSON.parse(raw) }
  } catch {
    await writeFile(configPath, JSON.stringify(defaults, null, 2))
    return defaults
  }
}

async function writeSettings(payload: Partial<AppSettings>): Promise<AppSettings> {
  const next = { ...(await readSettings()), ...payload }
  const configDir = join(companyBrainRoot(), 'config')

  await ensureDirectory(configDir)
  await writeFile(join(configDir, 'settings.json'), JSON.stringify(next, null, 2))

  return next
}

async function meetingDirectory(meetingId: number): Promise<string> {
  const settings = await readSettings()
  return join(settings.defaultSaveDirectory, 'meetings', String(meetingId))
}

async function createMeetingDirectories(
  payload: CreateMeetingDirectoryPayload,
): Promise<{
  meetingId: number
  path: string
  screenPath: string
  audioPath: string
  attachmentsPath: string
  memosPath: string
  metadataPath: string
  logsPath: string
  exportsPath: string
}> {
  const basePath = await meetingDirectory(payload.meetingId)
  const paths = {
    meetingId: payload.meetingId,
    path: basePath,
    screenPath: join(basePath, 'screen'),
    audioPath: join(basePath, 'audio'),
    attachmentsPath: join(basePath, 'attachments'),
    memosPath: join(basePath, 'memos'),
    metadataPath: join(basePath, 'metadata'),
    logsPath: join(basePath, 'logs'),
    exportsPath: join(basePath, 'exports'),
  }

  await Promise.all([
    ensureDirectory(paths.screenPath),
    ensureDirectory(paths.audioPath),
    ensureDirectory(paths.attachmentsPath),
    ensureDirectory(paths.memosPath),
    ensureDirectory(paths.metadataPath),
    ensureDirectory(paths.logsPath),
    ensureDirectory(paths.exportsPath),
  ])

  await writeLog({
    level: 'info',
    scope: 'meeting.directory',
    meeting_id: payload.meetingId,
    message: 'meeting directory created',
    metadata: { path: basePath, title: payload.title ?? null },
  })

  return paths
}

function localTimestamp(date = new Date()): string {
  const offsetMinutes = -date.getTimezoneOffset()
  const sign = offsetMinutes >= 0 ? '+' : '-'
  const abs = Math.abs(offsetMinutes)
  const hours = String(Math.floor(abs / 60)).padStart(2, '0')
  const minutes = String(abs % 60).padStart(2, '0')
  const local = new Date(date.getTime() + offsetMinutes * 60_000)
    .toISOString()
    .replace('Z', '')

  return `${local}${sign}${hours}:${minutes}`
}

async function writeLog(payload: AppLogPayload): Promise<void> {
  const settings = await readSettings()
  const logEntry = {
    timestamp: localTimestamp(),
    level: payload.level,
    scope: payload.scope,
    meeting_id: payload.meeting_id ?? null,
    message: payload.message,
    metadata: payload.metadata ?? {},
  }
  const line = `${JSON.stringify(logEntry)}\n`
  const appLogDirectory = join(settings.defaultSaveDirectory, 'logs')
  const today = new Date().toISOString().slice(0, 10)

  await ensureDirectory(appLogDirectory)
  await appendFile(join(appLogDirectory, `app-${today}.log`), line)

  if (payload.meeting_id) {
    const meetingLogDirectory = join(
      settings.defaultSaveDirectory,
      'meetings',
      String(payload.meeting_id),
      'logs',
    )

    await ensureDirectory(meetingLogDirectory)
    await appendFile(join(meetingLogDirectory, 'meeting.log'), line)
  }
}

function normalizeBinary(data: SaveRecordingFilePayload['data']): Buffer {
  if (data instanceof ArrayBuffer) {
    return Buffer.from(data)
  }

  if (ArrayBuffer.isView(data)) {
    return Buffer.from(data.buffer, data.byteOffset, data.byteLength)
  }

  if (Array.isArray(data)) {
    return Buffer.from(data)
  }

  throw new Error('Unsupported recording payload')
}

function inferMimeType(path: string): string | null {
  const ext = extname(path).toLowerCase()
  const map: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.pdf': 'application/pdf',
    '.doc': 'application/msword',
    '.docx':
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    '.xls': 'application/vnd.ms-excel',
    '.xlsx':
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx':
      'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.txt': 'text/plain',
    '.md': 'text/markdown',
    '.webm': 'video/webm',
  }

  return map[ext] ?? null
}

async function fileInfo(path: string): Promise<PendingLocalFile> {
  const result = await stat(path)

  return {
    fileName: basename(path),
    path,
    sizeBytes: result.size,
    mimeType: inferMimeType(path),
  }
}

function uniqueName(originalName: string): string {
  const ext = extname(originalName)
  const stem = originalName.slice(0, originalName.length - ext.length)
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')

  return `${stem}-${stamp}${ext}`
}

async function saveRecordingFile(
  payload: SaveRecordingFilePayload,
): Promise<SavedFile> {
  const directories = await createMeetingDirectories({
    meetingId: payload.meetingId,
  })
  const targetDirectory =
    payload.folder === 'screen' ? directories.screenPath : directories.audioPath
  const targetPath = join(targetDirectory, payload.fileName)
  const buffer = normalizeBinary(payload.data)

  await writeFile(targetPath, buffer)

  const saved: SavedFile = {
    fileName: payload.fileName,
    path: targetPath,
    sizeBytes: buffer.byteLength,
    mimeType: inferMimeType(targetPath),
    savedAt: new Date().toISOString(),
  }

  await writeLog({
    level: 'info',
    scope:
      payload.folder === 'screen'
        ? 'recording.screen'
        : 'recording.audio',
    meeting_id: payload.meetingId,
    message: `${payload.folder} recording saved`,
    metadata: {
      path: targetPath,
      size_bytes: saved.sizeBytes,
    },
  })

  return saved
}

async function saveJsonFile(payload: SaveJsonFilePayload): Promise<SavedFile> {
  const directories = await createMeetingDirectories({
    meetingId: payload.meetingId,
  })
  const targetDirectory =
    payload.folder === 'memos' ? directories.memosPath : directories.metadataPath
  const targetPath = join(targetDirectory, payload.fileName)
  const content = JSON.stringify(payload.data, null, 2)

  await writeFile(targetPath, content)

  await writeLog({
    level: 'info',
    scope: payload.folder === 'memos' ? 'meeting.memos' : 'meeting.metadata',
    meeting_id: payload.meetingId,
    message: `${payload.folder} json saved`,
    metadata: { path: targetPath },
  })

  return {
    fileName: payload.fileName,
    path: targetPath,
    sizeBytes: Buffer.byteLength(content),
    mimeType: 'application/json',
    savedAt: new Date().toISOString(),
  }
}

async function copyAttachment(
  payload: CopyAttachmentPayload,
): Promise<LocalAttachment> {
  const directories = await createMeetingDirectories({
    meetingId: payload.meetingId,
  })
  const source = await fileInfo(payload.sourcePath)
  const targetName = uniqueName(source.fileName)
  const targetPath = join(directories.attachmentsPath, targetName)

  await copyFile(payload.sourcePath, targetPath)

  const copied: LocalAttachment = {
    id: crypto.randomUUID(),
    fileName: targetName,
    path: targetPath,
    sizeBytes: source.sizeBytes ?? null,
    mimeType: source.mimeType ?? null,
    copiedAt: new Date().toISOString(),
  }

  await writeLog({
    level: 'info',
    scope: 'meeting.attachment',
    meeting_id: payload.meetingId,
    message: 'attachment copied',
    metadata: { source_path: payload.sourcePath, target_path: targetPath },
  })

  return copied
}

async function openPath(path: string): Promise<void> {
  const error = await shell.openPath(path)

  if (error) {
    throw new Error(error)
  }
}

function mediaPermission(permissionType: 'microphone' | 'screen'): PermissionStatus {
  if (process.platform !== 'darwin') {
    return 'granted'
  }

  try {
    const mediaType = permissionType === 'screen' ? 'screen' : 'microphone'
    return systemPreferences.getMediaAccessStatus(
      mediaType as Parameters<typeof systemPreferences.getMediaAccessStatus>[0],
    ) as PermissionStatus
  } catch {
    return 'unknown'
  }
}

async function microphonePermission(): Promise<PermissionStatus> {
  const status = mediaPermission('microphone')

  if (process.platform !== 'darwin' || status !== 'not-determined') {
    return status
  }

  try {
    const granted = await systemPreferences.askForMediaAccess('microphone')
    return granted ? 'granted' : 'denied'
  } catch {
    return 'unknown'
  }
}

function runtimePermissionTargetPath(): string {
  const executablePath = app.getPath('exe')

  if (process.platform !== 'darwin') {
    return executablePath
  }

  const appSuffix = '.app'
  const appIndex = executablePath.indexOf(appSuffix)

  if (appIndex < 0) {
    return executablePath
  }

  return executablePath.slice(0, appIndex + appSuffix.length)
}

async function saveExportFile(payload: SaveExportFilePayload): Promise<SavedFile> {
  const directories = await createMeetingDirectories({
    meetingId: payload.meetingId,
  })
  const targetPath = join(directories.exportsPath, payload.fileName)

  await writeFile(targetPath, payload.content)

  await writeLog({
    level: 'info',
    scope: 'meeting.export',
    meeting_id: payload.meetingId,
    message: 'export file saved',
    metadata: { path: targetPath },
  })

  return {
    fileName: payload.fileName,
    path: targetPath,
    sizeBytes: Buffer.byteLength(payload.content),
    mimeType: inferMimeType(targetPath),
    savedAt: new Date().toISOString(),
  }
}

async function saveBinaryExport(
  payload: SaveBinaryExportPayload,
): Promise<SavedFile> {
  const directories = await createMeetingDirectories({
    meetingId: payload.meetingId,
  })
  const targetPath = join(directories.exportsPath, payload.fileName)
  const buffer = normalizeBinary(payload.data)

  await writeFile(targetPath, buffer)
  await writeLog({
    level: 'info',
    scope: 'meeting.export',
    meeting_id: payload.meetingId,
    message: 'backend export downloaded',
    metadata: { path: targetPath, mime_type: payload.mimeType ?? null },
  })

  return {
    fileName: payload.fileName,
    path: targetPath,
    sizeBytes: buffer.byteLength,
    mimeType: payload.mimeType ?? inferMimeType(targetPath),
    savedAt: new Date().toISOString(),
  }
}

async function savePdfExport(payload: SavePdfExportPayload): Promise<SavedFile> {
  const directories = await createMeetingDirectories({
    meetingId: payload.meetingId,
  })
  const targetPath = join(directories.exportsPath, payload.fileName)
  const pdfWindow = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  try {
    const encoded = Buffer.from(payload.html, 'utf8').toString('base64')
    await pdfWindow.loadURL(`data:text/html;base64,${encoded}`)
    const pdf = await pdfWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      margins: {
        marginType: 'default',
      },
    })

    await writeFile(targetPath, pdf)
    await writeLog({
      level: 'info',
      scope: 'meeting.export',
      meeting_id: payload.meetingId,
      message: 'pdf export saved',
      metadata: { path: targetPath },
    })

    return {
      fileName: payload.fileName,
      path: targetPath,
      sizeBytes: pdf.byteLength,
      mimeType: 'application/pdf',
      savedAt: new Date().toISOString(),
    }
  } finally {
    pdfWindow.destroy()
  }
}

function createWindow(): void {
  const preloadPath = existsSync(join(__dirname, '../preload/index.mjs'))
    ? join(__dirname, '../preload/index.mjs')
    : join(__dirname, '../preload/index.js')

  mainWindow = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 1024,
    minHeight: 720,
    title: 'Company Brain Lite',
    webPreferences: {
      preload: preloadPath,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.on('close', (event) => {
    if (!activeMeetingSession.active || allowCloseAfterConfirm) {
      return
    }

    event.preventDefault()

    const choice = dialog.showMessageBoxSync(mainWindow!, {
      type: 'warning',
      buttons: ['종료', '취소'],
      defaultId: 1,
      cancelId: 1,
      title: '회의 진행 중',
      message: '회의가 진행 중입니다.',
      detail:
        '앱을 종료하면 현재 진행 중인 회의 세션은 초기화됩니다.\n저장되지 않은 녹음, 녹화, 메모가 유실될 수 있습니다.\n정말 종료하시겠습니까?',
    })

    if (choice === 0) {
      allowCloseAfterConfirm = true
      void writeLog({
        level: 'warn',
        scope: 'app.close',
        meeting_id: activeMeetingSession.meetingId ?? null,
        message: 'application closed during active meeting session',
        metadata: { title: activeMeetingSession.title ?? null },
      }).finally(() => {
        mainWindow?.close()
      })
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function registerIpc(): void {
  ipcMain.handle('screen:get-primary-source', async () => {
    const primaryDisplay = screen.getPrimaryDisplay()
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 },
    })
    const source =
      sources.find((item) => item.display_id === String(primaryDisplay.id)) ??
      sources[0]

    if (!source) {
      throw new Error('No screen source is available')
    }

    return {
      id: source.id,
      name: source.name,
      displayId: source.display_id,
      thumbnailDataUrl: source.thumbnail.toDataURL(),
    }
  })

  ipcMain.handle('meeting:create-directory', (_, payload) =>
    createMeetingDirectories(payload),
  )
  ipcMain.handle('file:save-recording', (_, payload) => saveRecordingFile(payload))
  ipcMain.handle('file:save-json', (_, payload) => saveJsonFile(payload))
  ipcMain.handle('file:copy-attachment', (_, payload) => copyAttachment(payload))
  ipcMain.handle('dialog:select-local-files', async () => {
    const options: OpenDialogOptions = {
      title: '첨부 파일 선택',
      properties: ['openFile', 'multiSelections'],
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled) {
      return []
    }

    return Promise.all(result.filePaths.map((path) => fileInfo(path)))
  })
  ipcMain.handle('shell:open-meeting-directory', async (_, meetingId: number) => {
    await openPath(await meetingDirectory(meetingId))
  })
  ipcMain.handle('dialog:select-default-save-directory', async () => {
    const settings = await readSettings()
    const options: OpenDialogOptions = {
      title: '기본 저장 경로 선택',
      defaultPath: settings.defaultSaveDirectory,
      properties: ['openDirectory', 'createDirectory'],
    }
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options)

    if (result.canceled || !result.filePaths[0]) {
      return null
    }

    await writeSettings({ defaultSaveDirectory: result.filePaths[0] })
    return result.filePaths[0]
  })
  ipcMain.handle('settings:get-default-path', async () => {
    return (await readSettings()).defaultSaveDirectory
  })
  ipcMain.handle('settings:get', () => readSettings())
  ipcMain.handle('settings:update', (_, payload) => writeSettings(payload))
  ipcMain.handle('shell:open-file', async (_, path: string) => openPath(path))
  ipcMain.handle('shell:open-directory', async (_, path: string) => openPath(path))
  ipcMain.handle('permission:check-microphone', () => microphonePermission())
  ipcMain.handle('permission:check-screen', () => mediaPermission('screen'))
  ipcMain.handle(
    'permission:open-setting',
    async (_, permissionType: 'microphone' | 'screen') => {
      const target =
        permissionType === 'microphone'
          ? 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
          : 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture'

      await shell.openExternal(target)
    },
  )
  ipcMain.handle('permission:show-runtime-target', () => {
    const targetPath = runtimePermissionTargetPath()
    shell.showItemInFolder(targetPath)
    return targetPath
  })
  ipcMain.handle('log:write', (_, payload) => writeLog(payload))
  ipcMain.handle('log:open-directory', async () => {
    const settings = await readSettings()
    const logDirectory = join(settings.defaultSaveDirectory, 'logs')

    await ensureDirectory(logDirectory)
    await openPath(logDirectory)
  })
  ipcMain.handle('export:save-file', (_, payload) => saveExportFile(payload))
  ipcMain.handle('export:save-pdf', (_, payload) => savePdfExport(payload))
  ipcMain.handle('export:save-binary', (_, payload) => saveBinaryExport(payload))
  ipcMain.handle(
    'app:set-active-meeting-session',
    (_, payload: ActiveMeetingSessionPayload) => {
      activeMeetingSession = payload
    },
  )
}

app.whenReady().then(async () => {
  await ensureDirectory(companyBrainRoot())
  registerIpc()
  createWindow()

  await writeLog({
    level: 'info',
    scope: 'app.lifecycle',
    message: 'application started',
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('before-quit', () => {
  void writeLog({
    level: 'info',
    scope: 'app.lifecycle',
    message: 'application quitting',
  })
})

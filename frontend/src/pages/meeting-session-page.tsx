import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  FilePlus2,
  FolderOpen,
  Mic,
  MonitorUp,
  Pause,
  Play,
  Save,
  Square,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { meetingsApi } from '@/lib/api'
import { getElectronAPI, requireElectronAPI } from '@/lib/electron'
import { formatBytes, formatDuration } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'
import { useSessionStore } from '@/stores/session-store'
import type { MeetingSessionMetadata, TimelineMemo } from '@/types/domain'
import type { PermissionStatus, SavedFile } from '@/types/electron'

type PermissionKind = 'microphone' | 'screen'

function supportedMimeType(candidates: string[]): string | undefined {
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate))
}

function stopStream(stream: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop())
}

function isPermissionBlocked(status: PermissionStatus): boolean {
  return status === 'denied' || status === 'restricted'
}

function permissionMessage(kind: PermissionKind): string {
  if (kind === 'microphone') {
    return '마이크 권한이 필요합니다. 시스템 설정 > 개인정보 보호 및 보안 > 마이크에서 Company Brain Lite, Electron, Visual Studio Code, Terminal 또는 iTerm 중 표시되는 실행 항목을 허용해주세요.'
  }

  return '화면 녹화 권한이 필요합니다. 시스템 설정 > 개인정보 보호 및 보안 > 화면 기록에서 Company Brain Lite, Electron, Visual Studio Code, Terminal 또는 iTerm 중 표시되는 실행 항목을 허용해주세요.'
}

export function MeetingSessionPage(): React.JSX.Element {
  const params = useParams()
  const meetingId = Number(params.meetingId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const session = useSessionStore()
  const startSession = useSessionStore((state) => state.startSession)
  const setSessionMemos = useSessionStore((state) => state.setMemos)
  const [memoText, setMemoText] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [permissionTargetPath, setPermissionTargetPath] = useState<string | null>(
    null,
  )
  const [permissionKind, setPermissionKind] = useState<PermissionKind | null>(
    null,
  )
  const [finishOpen, setFinishOpen] = useState(false)
  const [isFinishing, setIsFinishing] = useState(false)

  const screenRecorderRef = useRef<MediaRecorder | null>(null)
  const screenStreamRef = useRef<MediaStream | null>(null)
  const screenChunksRef = useRef<Blob[]>([])
  const screenStopResolverRef = useRef<((file: SavedFile | null) => void) | null>(
    null,
  )

  const audioRecorderRef = useRef<MediaRecorder | null>(null)
  const audioStreamRef = useRef<MediaStream | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const audioStopResolverRef = useRef<((file: SavedFile | null) => void) | null>(
    null,
  )
  const audioElapsedBaseRef = useRef(0)
  const audioSegmentStartedAtRef = useRef<number | null>(null)

  // Guards so session setup runs once per meeting and post-unmount work is skipped.
  const setupRanRef = useRef(false)
  const mountedRef = useRef(true)

  const meetingQuery = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => meetingsApi.get(meetingId),
    enabled: Number.isFinite(meetingId),
  })

  // Release media devices and clear the active-session flag on unmount. This
  // is the single owner of teardown, so navigating away mid-recording never
  // leaves the camera/mic/screen-capture running.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      void getElectronAPI()?.setActiveMeetingSession({ active: false })
      try {
        screenRecorderRef.current?.stop()
        audioRecorderRef.current?.stop()
      } catch {
        // ignore — we only care about releasing the underlying streams below
      }
      stopStream(screenStreamRef.current)
      stopStream(audioStreamRef.current)
      screenStreamRef.current = null
      audioStreamRef.current = null
    }
  }, [])

  // Initialize the session exactly once per meeting. Depending on the query
  // data alone would re-run (and reset the store, wiping memos/timers) on every
  // refetch/invalidation while a recording is in progress.
  useEffect(() => {
    if (setupRanRef.current) {
      return
    }
    const meeting = meetingQuery.data
    if (!meeting) {
      return
    }
    setupRanRef.current = true

    void (async () => {
      try {
        const electron = requireElectronAPI()
        const activeMeeting =
          meeting.status === 'draft' ? await meetingsApi.start(meeting.id) : meeting
        const directory = meeting.local_base_path
          ? null
          : await electron.createMeetingDirectory({
              meetingId: activeMeeting.id,
              title: activeMeeting.title,
            })
        const localBasePath = directory?.path ?? activeMeeting.local_base_path ?? null
        const memos = await meetingsApi.getMemos(activeMeeting.id)

        if (!mountedRef.current) {
          return
        }

        if (directory) {
          await meetingsApi.update(activeMeeting.id, {
            local_base_path: directory.path,
          })
          await queryClient.invalidateQueries({ queryKey: ['meetings'] })
        }

        startSession({
          meetingId: activeMeeting.id,
          title: activeMeeting.title,
          participantOnly: activeMeeting.participant_only,
          participantIds: activeMeeting.participant_ids,
          localBasePath,
          attachments: activeMeeting.attachments,
        })
        setSessionMemos(memos)
        await electron.setActiveMeetingSession({
          active: true,
          meetingId: activeMeeting.id,
          title: activeMeeting.title,
        })
      } catch (error) {
        if (mountedRef.current) {
          setErrorMessage(
            error instanceof Error ? error.message : '회의 세션 초기화에 실패했습니다.',
          )
        }
      }
    })()
  }, [meetingQuery.data, queryClient, setSessionMemos, startSession])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const state = useSessionStore.getState()
      const now = Date.now()

      if (state.meetingStartedAt) {
        state.setMeetingElapsed(now - state.meetingStartedAt)
      }

      if (state.screenRecordingStatus === 'recording' && state.screenStartedAt) {
        state.setScreenElapsed(now - state.screenStartedAt)
      }

      if (
        state.audioRecordingStatus === 'recording' ||
        state.audioRecordingStatus === 'paused'
      ) {
        const segmentElapsed =
          state.audioRecordingStatus === 'recording' &&
          audioSegmentStartedAtRef.current
            ? now - audioSegmentStartedAtRef.current
            : 0
        state.setAudioElapsed(audioElapsedBaseRef.current + segmentElapsed)
      }
    }, 500)

    return () => window.clearInterval(timer)
  }, [])

  const persistMemos = async (memos: TimelineMemo[]): Promise<SavedFile> => {
    const electron = requireElectronAPI()
    const saved = await electron.saveJsonFile({
      meetingId,
      folder: 'memos',
      fileName: 'timeline_memos.json',
      data: memos,
    })

    await meetingsApi.saveMemos(meetingId, memos)
    await meetingsApi.update(meetingId, { memo_file_path: saved.path })

    return saved
  }

  const startScreenRecording = async (): Promise<void> => {
    const electron = requireElectronAPI()
    let screenStream: MediaStream | null = null
    let microphoneStream: MediaStream | null = null
    let started = false

    try {
      setErrorMessage(null)
      setPermissionTargetPath(null)
      setPermissionKind(null)
      session.setScreenRecordingStatus('permission_checking')

      const microphoneStatus = await electron.checkMicrophonePermission()
      if (isPermissionBlocked(microphoneStatus)) {
        setPermissionKind('microphone')
        throw new Error(permissionMessage('microphone'))
      }

      const screenStatus = await electron.checkScreenRecordingPermission()
      if (isPermissionBlocked(screenStatus)) {
        setPermissionKind('screen')
        throw new Error(permissionMessage('screen'))
      }

      // Screen video via the modern getDisplayMedia API (the Electron main
      // process auto-selects the primary display). Microphone audio is
      // captured separately and mixed in below.
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      })
      microphoneStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      })
      const combinedStream = new MediaStream([
        ...screenStream.getVideoTracks(),
        ...microphoneStream.getAudioTracks(),
      ])
      const recorder = new MediaRecorder(combinedStream, {
        mimeType: supportedMimeType([
          'video/webm;codecs=vp9,opus',
          'video/webm;codecs=vp8,opus',
          'video/webm',
        ]),
      })

      screenChunksRef.current = []
      screenStreamRef.current = combinedStream
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          screenChunksRef.current.push(event.data)
        }
      }
      recorder.onerror = () => {
        session.setScreenRecordingStatus('failed')
        setErrorMessage('화면 녹화 중 오류가 발생했습니다.')
      }
      recorder.onstop = async () => {
        try {
          const blob = new Blob(screenChunksRef.current, {
            type: recorder.mimeType || 'video/webm',
          })
          const saved = await electron.saveRecordingFile({
            meetingId,
            folder: 'screen',
            fileName: 'screen.webm',
            data: await blob.arrayBuffer(),
          })

          session.setScreenFilePath(saved.path)
          session.setScreenRecordingStatus('saved')
          await meetingsApi.update(meetingId, { screen_file_path: saved.path })
          screenStopResolverRef.current?.(saved)
        } catch (error) {
          session.setScreenRecordingStatus('failed')
          setErrorMessage(
            error instanceof Error
              ? error.message
              : '화면 녹화 저장에 실패했습니다.',
          )
          screenStopResolverRef.current?.(null)
        } finally {
          stopStream(screenStream)
          stopStream(microphoneStream)
          stopStream(combinedStream)
          screenRecorderRef.current = null
          screenStreamRef.current = null
          screenStopResolverRef.current = null
        }
      }

      screenRecorderRef.current = recorder
      recorder.start(1000)
      started = true
      session.setScreenStartedAt(Date.now())
      session.setScreenElapsed(0)
      session.setScreenRecordingStatus('recording')
      await electron.writeAppLog({
        level: 'info',
        scope: 'recording.screen',
        meeting_id: meetingId,
        message: 'screen recording started',
        metadata: {
          includes_microphone: true,
          includes_system_audio: false,
        },
      })
    } catch (error) {
      // Release any streams acquired before the failure so a partial start
      // (e.g. mic denied after screen granted) never leaks a live capture.
      if (!started) {
        stopStream(screenStream)
        stopStream(microphoneStream)
        screenStreamRef.current = null
      }
      session.setScreenRecordingStatus('failed')
      const message =
        error instanceof Error ? error.message : '화면 녹화를 시작할 수 없습니다.'
      setErrorMessage(message)
      await electron.writeAppLog({
        level: 'error',
        scope: 'recording.screen',
        meeting_id: meetingId,
        message: 'screen recording failed',
        metadata: { error: message },
      })
    }
  }

  const stopScreenRecording = async (): Promise<SavedFile | null> => {
    const recorder = screenRecorderRef.current

    if (!recorder || recorder.state === 'inactive') {
      return null
    }

    session.setScreenRecordingStatus('stopping')

    return new Promise((resolve) => {
      screenStopResolverRef.current = resolve
      recorder.stop()
    })
  }

  const startAudioRecording = async (): Promise<void> => {
    const electron = requireElectronAPI()
    let stream: MediaStream | null = null
    let started = false

    try {
      setErrorMessage(null)
      setPermissionTargetPath(null)
      setPermissionKind(null)
      session.setAudioRecordingStatus('permission_checking')

      const microphoneStatus = await electron.checkMicrophonePermission()
      if (isPermissionBlocked(microphoneStatus)) {
        setPermissionKind('microphone')
        throw new Error(permissionMessage('microphone'))
      }

      stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: false,
      })
      const recorder = new MediaRecorder(stream, {
        mimeType: supportedMimeType([
          'audio/webm;codecs=opus',
          'audio/webm',
        ]),
      })

      audioChunksRef.current = []
      audioElapsedBaseRef.current = 0
      audioSegmentStartedAtRef.current = Date.now()
      audioStreamRef.current = stream
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data)
        }
      }
      recorder.onerror = () => {
        session.setAudioRecordingStatus('failed')
        setErrorMessage('음성 녹음 중 오류가 발생했습니다.')
      }
      recorder.onstop = async () => {
        try {
          const blob = new Blob(audioChunksRef.current, {
            type: recorder.mimeType || 'audio/webm',
          })
          const saved = await electron.saveRecordingFile({
            meetingId,
            folder: 'audio',
            fileName: 'audio.webm',
            data: await blob.arrayBuffer(),
          })

          session.setAudioFilePath(saved.path)
          session.setAudioRecordingStatus('saved')
          await meetingsApi.update(meetingId, { audio_file_path: saved.path })
          audioStopResolverRef.current?.(saved)
        } catch (error) {
          session.setAudioRecordingStatus('failed')
          setErrorMessage(
            error instanceof Error
              ? error.message
              : '음성 녹음 저장에 실패했습니다.',
          )
          audioStopResolverRef.current?.(null)
        } finally {
          stopStream(stream)
          audioRecorderRef.current = null
          audioStreamRef.current = null
          audioStopResolverRef.current = null
          audioSegmentStartedAtRef.current = null
        }
      }

      audioRecorderRef.current = recorder
      recorder.start(1000)
      started = true
      session.setAudioStartedAt(Date.now())
      session.setAudioElapsed(0)
      session.setAudioRecordingStatus('recording')
      await electron.writeAppLog({
        level: 'info',
        scope: 'recording.audio',
        meeting_id: meetingId,
        message: 'audio recording started',
      })
    } catch (error) {
      if (!started) {
        stopStream(stream)
        audioStreamRef.current = null
      }
      session.setAudioRecordingStatus('failed')
      const message =
        error instanceof Error ? error.message : '음성 녹음을 시작할 수 없습니다.'
      setErrorMessage(message)
      await electron.writeAppLog({
        level: 'error',
        scope: 'recording.audio',
        meeting_id: meetingId,
        message: 'audio recording failed',
        metadata: { error: message },
      })
    }
  }

  const pauseAudioRecording = async (): Promise<void> => {
    const recorder = audioRecorderRef.current

    if (!recorder || recorder.state !== 'recording') {
      return
    }

    if (audioSegmentStartedAtRef.current) {
      audioElapsedBaseRef.current += Date.now() - audioSegmentStartedAtRef.current
      audioSegmentStartedAtRef.current = null
    }

    recorder.pause()
    session.setAudioRecordingStatus('paused')
    await requireElectronAPI().writeAppLog({
      level: 'info',
      scope: 'recording.audio',
      meeting_id: meetingId,
      message: 'audio recording paused',
    })
  }

  const resumeAudioRecording = async (): Promise<void> => {
    const recorder = audioRecorderRef.current

    if (!recorder || recorder.state !== 'paused') {
      return
    }

    audioSegmentStartedAtRef.current = Date.now()
    recorder.resume()
    session.setAudioRecordingStatus('recording')
    await requireElectronAPI().writeAppLog({
      level: 'info',
      scope: 'recording.audio',
      meeting_id: meetingId,
      message: 'audio recording resumed',
    })
  }

  const stopAudioRecording = async (): Promise<SavedFile | null> => {
    const recorder = audioRecorderRef.current

    if (!recorder || recorder.state === 'inactive') {
      return null
    }

    if (recorder.state === 'recording' && audioSegmentStartedAtRef.current) {
      audioElapsedBaseRef.current += Date.now() - audioSegmentStartedAtRef.current
      audioSegmentStartedAtRef.current = null
    }

    session.setAudioElapsed(audioElapsedBaseRef.current)
    session.setAudioRecordingStatus('stopping')

    return new Promise((resolve) => {
      audioStopResolverRef.current = resolve
      recorder.stop()
    })
  }

  const saveMemo = async (): Promise<void> => {
    const trimmed = memoText.trim()

    if (!trimmed || !user) {
      return
    }

    const memo: TimelineMemo = {
      id: crypto.randomUUID(),
      meeting_id: meetingId,
      timestamp_ms: session.elapsedMs,
      audio_elapsed_ms: session.isRecordingAudio ? session.audioElapsedMs : null,
      screen_elapsed_ms: session.isRecordingScreen ? session.screenElapsedMs : null,
      memo: trimmed,
      created_at: new Date().toISOString(),
      created_by: user.id,
    }
    const nextMemos = [...session.memos, memo]

    session.setMemos(nextMemos)
    setMemoText('')

    try {
      await persistMemos(nextMemos)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '메모 저장에 실패했습니다.',
      )
    }
  }

  const addAttachments = async (): Promise<void> => {
    const electron = requireElectronAPI()
    const files = await electron.selectLocalFiles()
    const copied = await Promise.all(
      files.map((file) =>
        electron.copyAttachmentToMeetingDirectory({
          meetingId,
          sourcePath: file.path,
        }),
      ),
    )

    if (copied.length === 0) {
      return
    }

    session.addAttachments(copied)
    await meetingsApi.appendAttachments(meetingId, copied)
    await queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
    await queryClient.invalidateQueries({ queryKey: ['meetings'] })
  }

  const finishMeeting = async (): Promise<void> => {
    const meeting = meetingQuery.data

    if (!meeting) {
      return
    }

    setIsFinishing(true)
    setErrorMessage(null)

    try {
      const electron = requireElectronAPI()
      let localBasePath = session.localBasePath

      if (!localBasePath) {
        const directory = await electron.createMeetingDirectory({
          meetingId,
          title: meeting.title,
        })
        localBasePath = directory.path
        session.setLocalBasePath(directory.path)
      }

      const [screenFile, audioFile] = await Promise.all([
        stopScreenRecording(),
        stopAudioRecording(),
      ])
      const memoFile = await persistMemos(session.memos)
      const finishedAt = new Date().toISOString()
      const screenPath =
        screenFile?.path ?? session.screenFilePath ?? meeting.screen_file_path ?? null
      const audioPath =
        audioFile?.path ?? session.audioFilePath ?? meeting.audio_file_path ?? null
      const metadata: MeetingSessionMetadata = {
        meeting_id: meeting.id,
        title: meeting.title,
        meeting_date: meeting.meeting_date,
        project_name: meeting.project_name ?? null,
        meeting_series: meeting.meeting_series ?? null,
        participant_ids: meeting.participant_ids,
        participant_only: meeting.participant_only,
        local_base_path: localBasePath,
        screen_recording: {
          enabled: Boolean(screenPath),
          file_path: screenPath,
          format: 'webm',
          includes_microphone: true,
          includes_system_audio: false,
          duration_ms: session.screenElapsedMs || null,
        },
        audio_recording: {
          enabled: Boolean(audioPath),
          file_path: audioPath,
          format: 'webm',
          duration_ms: session.audioElapsedMs || null,
        },
        memos: {
          file_path: memoFile.path,
          count: session.memos.length,
        },
        attachments: session.attachments.map((attachment) => ({
          file_name: attachment.fileName,
          file_path: attachment.path,
          mime_type: attachment.mimeType ?? null,
          size_bytes: attachment.sizeBytes ?? null,
        })),
        created_at: meeting.created_at,
        finished_at: finishedAt,
      }
      const metadataFile = await electron.saveJsonFile({
        meetingId,
        folder: 'metadata',
        fileName: 'meeting_session.json',
        data: metadata,
      })

      await meetingsApi.finish(meetingId, {
        local_base_path: localBasePath,
        screen_file_path: screenPath,
        audio_file_path: audioPath,
        memo_file_path: memoFile.path,
        metadata_file_path: metadataFile.path,
        attachments: session.attachments,
      })
      await electron.writeAppLog({
        level: 'info',
        scope: 'meeting.finish',
        meeting_id: meetingId,
        message: 'meeting finished',
        metadata: {
          screen_file_path: screenPath,
          audio_file_path: audioPath,
          memo_count: session.memos.length,
        },
      })
      await electron.setActiveMeetingSession({ active: false })
      await queryClient.invalidateQueries({ queryKey: ['meetings'] })
      await queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      session.resetSession()
      navigate(`/meetings/${meetingId}/status`)
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : '회의 종료 저장에 실패했습니다.',
      )
    } finally {
      setIsFinishing(false)
      setFinishOpen(false)
    }
  }

  if (meetingQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">회의를 불러오는 중입니다.</p>
  }

  if (!meetingQuery.data) {
    return <p className="text-sm text-destructive">회의를 찾을 수 없습니다.</p>
  }

  const meeting = meetingQuery.data

  return (
    <div>
      <PageHeader
        title={meeting.title}
        description="전체 화면 녹화, 음성 녹음, 메모, 첨부 파일을 회의별 로컬 폴더에 저장합니다."
        actions={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => requireElectronAPI().openMeetingDirectory(meetingId)}
            >
              <FolderOpen className="h-4 w-4" />
              원본 폴더
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => setFinishOpen(true)}
            >
              <Save className="h-4 w-4" />
              회의 종료
            </Button>
          </>
        }
      />

      {errorMessage ? (
        <div className="mb-4 flex items-start justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <div className="space-y-1">
            <p>{errorMessage}</p>
            {permissionTargetPath ? (
              <p className="text-xs leading-5 text-destructive/80">
                Finder에서 열린 앱을 시스템 설정의 화면 기록 목록에 추가하세요:{' '}
                {permissionTargetPath}
              </p>
            ) : null}
          </div>
          {permissionKind ? (
            <div className="flex shrink-0 gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() =>
                  requireElectronAPI().openSystemPermissionSetting(permissionKind)
                }
              >
                시스템 설정 열기
              </Button>
              {permissionKind === 'screen' ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    const path =
                      await requireElectronAPI().showRuntimePermissionTarget()
                    setPermissionTargetPath(path)
                  }}
                >
                  앱 위치 열기
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-[1fr_380px] gap-6">
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">회의 경과</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="font-mono text-3xl font-semibold">
                  {formatDuration(session.elapsedMs)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">화면 녹화</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2 flex items-center gap-2">
                  <Badge
                    variant={
                      session.screenRecordingStatus === 'recording'
                        ? 'destructive'
                        : session.screenRecordingStatus === 'saved'
                          ? 'success'
                          : 'secondary'
                    }
                  >
                    {session.screenRecordingStatus}
                  </Badge>
                </div>
                <p className="font-mono text-2xl font-semibold">
                  {formatDuration(session.screenElapsedMs)}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">음성 녹음</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="mb-2 flex items-center gap-2">
                  <Badge
                    variant={
                      session.audioRecordingStatus === 'recording'
                        ? 'destructive'
                        : session.audioRecordingStatus === 'paused'
                          ? 'warning'
                          : session.audioRecordingStatus === 'saved'
                            ? 'success'
                            : 'secondary'
                    }
                  >
                    {session.audioRecordingStatus}
                  </Badge>
                </div>
                <p className="font-mono text-2xl font-semibold">
                  {formatDuration(session.audioElapsedMs)}
                </p>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>녹화/녹음 제어</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4">
              <div className="rounded-lg border border-border p-4">
                <p className="mb-3 text-sm font-medium">전체 화면 녹화</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  전체 화면과 마이크 음성을 함께 저장합니다. 시스템 사운드는
                  포함하지 않습니다.
                </p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    disabled={session.screenRecordingStatus === 'recording'}
                    onClick={startScreenRecording}
                  >
                    <MonitorUp className="h-4 w-4" />
                    시작
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={session.screenRecordingStatus !== 'recording'}
                    onClick={stopScreenRecording}
                  >
                    <Square className="h-4 w-4" />
                    중지
                  </Button>
                </div>
              </div>

              <div className="rounded-lg border border-border p-4">
                <p className="mb-3 text-sm font-medium">음성 녹음 단독</p>
                <p className="mb-4 text-sm text-muted-foreground">
                  마이크 음성만 별도 파일로 저장하며 일시정지와 재개를
                  지원합니다.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    disabled={
                      session.audioRecordingStatus === 'recording' ||
                      session.audioRecordingStatus === 'paused'
                    }
                    onClick={startAudioRecording}
                  >
                    <Mic className="h-4 w-4" />
                    시작
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={session.audioRecordingStatus !== 'recording'}
                    onClick={pauseAudioRecording}
                  >
                    <Pause className="h-4 w-4" />
                    일시정지
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={session.audioRecordingStatus !== 'paused'}
                    onClick={resumeAudioRecording}
                  >
                    <Play className="h-4 w-4" />
                    재개
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    disabled={
                      session.audioRecordingStatus !== 'recording' &&
                      session.audioRecordingStatus !== 'paused'
                    }
                    onClick={stopAudioRecording}
                  >
                    <Square className="h-4 w-4" />
                    중지
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>텍스트 메모</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={memoText}
                onChange={(event) => setMemoText(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && !event.shiftKey) {
                    event.preventDefault()
                    void saveMemo()
                  }
                }}
                placeholder="Enter 저장, Shift+Enter 줄바꿈"
              />
              <p className="mt-2 text-xs text-muted-foreground">
                메모는 회의 시작 기준 timestamp와 함께 즉시 로컬 JSON에
                저장됩니다.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>메모 타임라인</CardTitle>
            </CardHeader>
            <CardContent>
              {session.memos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  아직 작성된 메모가 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {session.memos.map((memo) => (
                    <div
                      key={memo.id}
                      className="rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <p className="font-mono text-xs text-primary">
                        {formatDuration(memo.timestamp_ms)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap leading-6">
                        {memo.memo}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>첨부 파일</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={addAttachments}
              >
                <FilePlus2 className="h-4 w-4" />
                파일 첨부
              </Button>
              <div className="space-y-2">
                {session.attachments.map((attachment) => (
                  <div
                    key={attachment.id}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <p className="truncate font-medium">{attachment.fileName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatBytes(attachment.sizeBytes)}
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>저장 상태</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <span className="text-muted-foreground">원본 저장 경로: </span>
                {session.localBasePath ?? meeting.local_base_path ?? '-'}
              </p>
              <p>
                <span className="text-muted-foreground">화면 파일: </span>
                {session.screenFilePath ?? meeting.screen_file_path ?? '-'}
              </p>
              <p>
                <span className="text-muted-foreground">음성 파일: </span>
                {session.audioFilePath ?? meeting.audio_file_path ?? '-'}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={finishOpen} onOpenChange={setFinishOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>회의를 종료하시겠습니까?</DialogTitle>
            <DialogDescription>
              진행 중인 화면 녹화와 음성 녹음이 자동으로 종료되고 로컬에
              저장됩니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={isFinishing}
              onClick={() => setFinishOpen(false)}
            >
              계속 진행
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={isFinishing}
              onClick={finishMeeting}
            >
              종료하고 저장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

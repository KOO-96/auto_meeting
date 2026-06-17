import { create } from 'zustand'
import type {
  AudioRecordingStatus,
  ScreenRecordingStatus,
  TimelineMemo,
} from '@/types/domain'
import type { LocalAttachment } from '@/types/electron'

type MeetingSessionState = {
  meetingId: number | null
  title: string | null
  participantOnly: boolean
  participantIds: number[]
  screenRecordingStatus: ScreenRecordingStatus
  audioRecordingStatus: AudioRecordingStatus
  isRecordingScreen: boolean
  isRecordingAudio: boolean
  meetingStartedAt: number | null
  screenStartedAt: number | null
  audioStartedAt: number | null
  elapsedMs: number
  screenElapsedMs: number
  audioElapsedMs: number
  memos: TimelineMemo[]
  screenFilePath: string | null
  audioFilePath: string | null
  attachments: LocalAttachment[]
  localBasePath: string | null
  startSession: (payload: {
    meetingId: number
    title: string
    participantOnly: boolean
    participantIds: number[]
    localBasePath: string | null
    attachments: LocalAttachment[]
  }) => void
  setScreenRecordingStatus: (status: ScreenRecordingStatus) => void
  setAudioRecordingStatus: (status: AudioRecordingStatus) => void
  setMeetingElapsed: (elapsedMs: number) => void
  setScreenElapsed: (elapsedMs: number) => void
  setAudioElapsed: (elapsedMs: number) => void
  setScreenStartedAt: (startedAt: number | null) => void
  setAudioStartedAt: (startedAt: number | null) => void
  setMemos: (memos: TimelineMemo[]) => void
  addMemo: (memo: TimelineMemo) => void
  setScreenFilePath: (path: string | null) => void
  setAudioFilePath: (path: string | null) => void
  addAttachments: (attachments: LocalAttachment[]) => void
  setLocalBasePath: (path: string | null) => void
  resetSession: () => void
}

const initialState = {
  meetingId: null,
  title: null,
  participantOnly: false,
  participantIds: [],
  screenRecordingStatus: 'idle' as ScreenRecordingStatus,
  audioRecordingStatus: 'idle' as AudioRecordingStatus,
  isRecordingScreen: false,
  isRecordingAudio: false,
  meetingStartedAt: null,
  screenStartedAt: null,
  audioStartedAt: null,
  elapsedMs: 0,
  screenElapsedMs: 0,
  audioElapsedMs: 0,
  memos: [],
  screenFilePath: null,
  audioFilePath: null,
  attachments: [],
  localBasePath: null,
}

export const useSessionStore = create<MeetingSessionState>((set) => ({
  ...initialState,
  startSession: (payload) => {
    set({
      ...initialState,
      meetingId: payload.meetingId,
      title: payload.title,
      participantOnly: payload.participantOnly,
      participantIds: payload.participantIds,
      meetingStartedAt: Date.now(),
      localBasePath: payload.localBasePath,
      attachments: payload.attachments,
    })
  },
  setScreenRecordingStatus: (status) => {
    set({
      screenRecordingStatus: status,
      isRecordingScreen: status === 'recording',
    })
  },
  setAudioRecordingStatus: (status) => {
    set({
      audioRecordingStatus: status,
      isRecordingAudio: status === 'recording' || status === 'paused',
    })
  },
  setMeetingElapsed: (elapsedMs) => set({ elapsedMs }),
  setScreenElapsed: (screenElapsedMs) => set({ screenElapsedMs }),
  setAudioElapsed: (audioElapsedMs) => set({ audioElapsedMs }),
  setScreenStartedAt: (screenStartedAt) => set({ screenStartedAt }),
  setAudioStartedAt: (audioStartedAt) => set({ audioStartedAt }),
  setMemos: (memos) => set({ memos }),
  addMemo: (memo) => set((state) => ({ memos: [...state.memos, memo] })),
  setScreenFilePath: (screenFilePath) => set({ screenFilePath }),
  setAudioFilePath: (audioFilePath) => set({ audioFilePath }),
  addAttachments: (attachments) =>
    set((state) => ({ attachments: [...state.attachments, ...attachments] })),
  setLocalBasePath: (localBasePath) => set({ localBasePath }),
  resetSession: () => set(initialState),
}))


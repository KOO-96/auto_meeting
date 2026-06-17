import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FolderOpen, Play, Plus, RotateCcw, Upload } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Select } from '@/components/ui/select'
import { canAccessMeeting } from '@/lib/access'
import { meetingsApi, participantsApi } from '@/lib/api'
import { requireElectronAPI } from '@/lib/electron'
import { formatBytes, formatDate, formatDuration } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'
import type { MeetingFileMetadata, Participant } from '@/types/domain'

type BackendUploadFileType =
  | 'audio'
  | 'screen_recording'
  | 'memo_json'
  | 'metadata_json'
  | 'image'
  | 'document'
  | 'attachment'

const backendFileTypeOptions: Array<{
  value: BackendUploadFileType
  label: string
}> = [
  { value: 'audio', label: '음성 파일' },
  { value: 'screen_recording', label: '화면 녹화 파일' },
  { value: 'memo_json', label: '메모 JSON' },
  { value: 'metadata_json', label: 'Metadata JSON' },
  { value: 'image', label: '이미지 첨부' },
  { value: 'document', label: '문서 첨부' },
  { value: 'attachment', label: '기타 첨부' },
]

function participantNames(participants: Participant[], ids: number[]): string {
  const names = ids
    .map((id) => participants.find((participant) => participant.id === id)?.name)
    .filter(Boolean)

  return names.length > 0 ? names.join(', ') : '-'
}

function fileTypeLabel(fileType: string): string {
  return (
    backendFileTypeOptions.find((option) => option.value === fileType)?.label ??
    fileType
  )
}

function fileDisplayName(file: MeetingFileMetadata): string {
  return (
    file.original_filename ??
    file.stored_filename ??
    file.local_source_path?.split('/').at(-1) ??
    `${file.file_type}-${file.id}`
  )
}

export function MeetingDetailPage(): React.JSX.Element {
  const params = useParams()
  const meetingId = Number(params.meetingId)
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [uploadFileType, setUploadFileType] =
    useState<BackendUploadFileType>('audio')
  const meetingQuery = useQuery({
    queryKey: ['meeting', meetingId],
    queryFn: () => meetingsApi.get(meetingId),
    enabled: Number.isFinite(meetingId),
  })
  const participantsQuery = useQuery({
    queryKey: ['participants'],
    queryFn: participantsApi.list,
  })
  const resultQuery = useQuery({
    queryKey: ['meeting-result', meetingId],
    queryFn: () => meetingsApi.getResult(meetingId),
    enabled: Boolean(meetingQuery.data),
  })
  const memosQuery = useQuery({
    queryKey: ['meeting-memos', meetingId],
    queryFn: () => meetingsApi.getMemos(meetingId),
    enabled: Boolean(meetingQuery.data),
  })
  const retryMutation = useMutation({
    mutationFn: () => meetingsApi.retry(meetingId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meetings'] })
      await queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
    },
  })
  const processMutation = useMutation({
    mutationFn: () => meetingsApi.process(meetingId),
    onSuccess: async () => {
      setMessage('AI 처리 요청이 등록되었습니다.')
      await queryClient.invalidateQueries({ queryKey: ['meetings'] })
      await queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
    },
    onError: (error) => {
      setMessage(
        error instanceof Error
          ? error.message
          : 'AI 처리 요청에 실패했습니다.',
      )
    },
  })
  const addParticipantMutation = useMutation({
    mutationFn: async (participantId: number) => {
      const meeting = await meetingsApi.get(meetingId)
      const ids = Array.from(new Set([...meeting.participant_ids, participantId]))
      return meetingsApi.update(meetingId, { participant_ids: ids })
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      await queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
  const uploadFileMutation = useMutation({
    mutationFn: (file: File) =>
      meetingsApi.uploadFile(meetingId, uploadFileType, file),
    onSuccess: async (file) => {
      setMessage(`${fileTypeLabel(file.file_type)} 업로드 완료`)
      await queryClient.invalidateQueries({ queryKey: ['meeting', meetingId] })
      await queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
    onError: (error) => {
      setMessage(
        error instanceof Error ? error.message : '파일 업로드에 실패했습니다.',
      )
    },
  })
  const downloadFileMutation = useMutation({
    mutationFn: (fileId: number) =>
      meetingsApi.downloadFileToLocal(meetingId, fileId),
    onSuccess: (saved) => {
      setMessage(`파일 다운로드 저장 완료: ${saved.path}`)
    },
    onError: (error) => {
      setMessage(
        error instanceof Error ? error.message : '파일 다운로드에 실패했습니다.',
      )
    },
  })
  const exportMutation = useMutation({
    mutationFn: (exportType: 'markdown' | 'pdf') =>
      meetingsApi.createAndDownloadBackendExport(meetingId, exportType),
    onSuccess: (saved) => {
      setMessage(`Export 저장 완료: ${saved.path}`)
    },
    onError: (error) => {
      setMessage(
        error instanceof Error ? error.message : 'Export 생성에 실패했습니다.',
      )
    },
  })

  if (meetingQuery.isLoading) {
    return <p className="text-sm text-muted-foreground">회의를 불러오는 중입니다.</p>
  }

  if (!meetingQuery.data) {
    return <p className="text-sm text-destructive">회의를 찾을 수 없습니다.</p>
  }

  const meeting = meetingQuery.data
  const participants = participantsQuery.data ?? []
  const result = resultQuery.data
  const memos = memosQuery.data ?? []
  const accessible = canAccessMeeting(meeting, user)
  const candidateParticipants = participants.filter(
    (participant) => !meeting.participant_ids.includes(participant.id),
  )

  if (!accessible) {
    return (
      <Card>
        <CardContent className="p-8">
          <p className="text-lg font-semibold">
            이 회의록은 참여자만 열람할 수 있습니다.
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            접근 권한이 필요한 경우 회의 생성자 또는 관리자에게 문의해주세요.
          </p>
        </CardContent>
      </Card>
    )
  }

  const handleUploadFileChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ): void => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''

    if (file) {
      uploadFileMutation.mutate(file)
    }
  }

  return (
    <div>
      <PageHeader
        title={meeting.title}
        description="회의 원본 자료와 AI 처리 결과를 확인합니다."
        actions={
          <>
            {meeting.status === 'draft' ? (
              <Button asChild variant="outline">
                <Link to={`/meetings/${meetingId}/session`}>진행 화면</Link>
              </Button>
            ) : null}
            <Button asChild variant="outline">
              <Link to={`/meetings/${meetingId}/status`}>처리 상태</Link>
            </Button>
            {meeting.status === 'metadata_saved' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => processMutation.mutate()}
                disabled={processMutation.isPending}
              >
                <Play className="h-4 w-4" />
                AI 처리 요청
              </Button>
            ) : null}
            {meeting.local_base_path ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => requireElectronAPI().openMeetingDirectory(meetingId)}
              >
                <FolderOpen className="h-4 w-4" />
                원본 폴더
              </Button>
            ) : null}
          </>
        }
      />

      {message ? (
        <p className="mb-4 rounded-md bg-success/10 px-3 py-2 text-sm text-success">
          {message}
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>회의 정보</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 gap-4 text-sm">
              <p>
                <span className="text-muted-foreground">회의 일자: </span>
                {formatDate(meeting.meeting_date)}
              </p>
              <p>
                <span className="text-muted-foreground">처리 상태: </span>
                <StatusBadge status={meeting.status} />
              </p>
              <p>
                <span className="text-muted-foreground">프로젝트: </span>
                {meeting.project_name ?? '-'}
              </p>
              <p>
                <span className="text-muted-foreground">회의 시리즈: </span>
                {meeting.meeting_series ?? '-'}
              </p>
              <p className="col-span-2">
                <span className="text-muted-foreground">참석자: </span>
                {participantNames(participants, meeting.participant_ids)}
              </p>
              <p className="col-span-2">
                <span className="text-muted-foreground">원본 저장 경로: </span>
                {meeting.local_base_path ?? '-'}
              </p>
              <p>
                <span className="text-muted-foreground">참여자만 열람: </span>
                {meeting.participant_only ? '예' : '아니오'}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>원본 자료</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-[140px_1fr] gap-3 rounded-md border border-border px-3 py-2">
                <span className="text-muted-foreground">화면 녹화 파일</span>
                <span className="truncate">{meeting.screen_file_path ?? '-'}</span>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-3 rounded-md border border-border px-3 py-2">
                <span className="text-muted-foreground">음성 녹음 파일</span>
                <span className="truncate">{meeting.audio_file_path ?? '-'}</span>
              </div>
              <div className="grid grid-cols-[140px_1fr] gap-3 rounded-md border border-border px-3 py-2">
                <span className="text-muted-foreground">메모 JSON</span>
                <span className="truncate">{meeting.memo_file_path ?? '-'}</span>
              </div>
              {meeting.attachments.map((attachment) => (
                <div
                  key={attachment.id}
                  className="grid grid-cols-[1fr_90px] gap-3 rounded-md border border-border px-3 py-2"
                >
                  <span className="truncate">{attachment.fileName}</span>
                  <span className="text-right text-muted-foreground">
                    {formatBytes(attachment.sizeBytes)}
                  </span>
                </div>
              ))}
              {meeting.files.length > 0 ? (
                <div className="pt-2">
                  <p className="mb-2 text-sm font-semibold">
                    Backend 파일 metadata
                  </p>
                  <div className="space-y-2">
                    {meeting.files.map((file) => (
                      <div
                        key={file.id}
                        className="grid grid-cols-[1fr_auto] gap-3 rounded-md border border-border px-3 py-2"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">
                              {fileTypeLabel(file.file_type)}
                            </span>
                            <span className="text-xs text-muted-foreground">
                              {fileDisplayName(file)}
                            </span>
                            <Badge variant={file.storage_path ? 'success' : 'outline'}>
                              {file.storage_path ? '업로드됨' : '로컬 경로'}
                            </Badge>
                          </div>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {file.storage_path ?? file.local_source_path ?? '-'}
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            {formatBytes(file.size_bytes)}
                          </p>
                        </div>
                        {file.storage_path ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => downloadFileMutation.mutate(file.id)}
                            disabled={downloadFileMutation.isPending}
                          >
                            <Download className="h-4 w-4" />
                            저장
                          </Button>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI 처리 결과</CardTitle>
            </CardHeader>
            <CardContent>
              {!result ? (
                <p className="text-sm text-muted-foreground">
                  {resultQuery.isError
                    ? '아직 AI 처리 결과가 없습니다. 원본 metadata 저장 후 AI 처리를 요청하세요.'
                    : '결과를 불러오는 중입니다.'}
                </p>
              ) : (
                <div className="space-y-5">
                  <section>
                    <p className="text-sm text-muted-foreground">한 줄 요약</p>
                    <p className="mt-1 text-lg font-semibold">
                      {result.one_line_summary}
                    </p>
                  </section>

                  <section>
                    <p className="text-sm text-muted-foreground">상세 요약</p>
                    <p className="mt-1 whitespace-pre-wrap leading-7">
                      {result.detailed_summary}
                    </p>
                  </section>

                  <section>
                    <p className="mb-2 text-sm text-muted-foreground">키워드</p>
                    <div className="flex flex-wrap gap-2">
                      {result.keywords.map((keyword) => (
                        <Badge key={keyword}>{keyword}</Badge>
                      ))}
                    </div>
                  </section>

                  <div className="grid grid-cols-2 gap-4">
                    <section className="rounded-lg border border-border p-4">
                      <p className="mb-3 text-sm font-semibold">결정사항</p>
                      <div className="space-y-2 text-sm">
                        {result.decisions.map((decision) => (
                          <p key={decision.content}>• {decision.content}</p>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-lg border border-border p-4">
                      <p className="mb-3 text-sm font-semibold">액션아이템</p>
                      <div className="space-y-3 text-sm">
                        {result.action_items.map((item) => (
                          <div key={item.content}>
                            <p className="font-medium">{item.content}</p>
                            <p className="text-xs text-muted-foreground">
                              담당 {item.assignee ?? '-'} · 기한{' '}
                              {item.due_date ?? '-'} · 우선순위{' '}
                              {item.priority ?? '-'}
                            </p>
                          </div>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <section className="rounded-lg border border-warning/30 bg-warning/10 p-4">
                      <p className="mb-3 text-sm font-semibold">미결정 안건</p>
                      <div className="space-y-2 text-sm">
                        {result.open_issues.map((issue) => (
                          <p key={issue}>• {issue}</p>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-lg border border-destructive/30 bg-destructive/10 p-4">
                      <p className="mb-3 text-sm font-semibold">리스크</p>
                      <div className="space-y-2 text-sm">
                        {result.risks.map((risk) => (
                          <p key={risk}>• {risk}</p>
                        ))}
                      </div>
                    </section>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <section className="rounded-lg border border-border p-4">
                      <p className="mb-3 text-sm font-semibold">
                        다음 회의 안건
                      </p>
                      <div className="space-y-2 text-sm">
                        {result.next_agenda.map((item) => (
                          <p key={item}>• {item}</p>
                        ))}
                      </div>
                    </section>
                    <section className="rounded-lg border border-border p-4">
                      <p className="mb-3 text-sm font-semibold">
                        다음 회의 결정사항
                      </p>
                      <div className="space-y-2 text-sm">
                        {result.next_decision_items.map((item) => (
                          <p key={item}>• {item}</p>
                        ))}
                      </div>
                    </section>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Export</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => exportMutation.mutate('markdown')}
                disabled={!result || exportMutation.isPending}
              >
                <Download className="h-4 w-4" />
                Markdown 다운로드
              </Button>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => exportMutation.mutate('pdf')}
                disabled={!result || exportMutation.isPending}
              >
                <Download className="h-4 w-4" />
                PDF 다운로드
              </Button>
              {meeting.status === 'failed' ? (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => retryMutation.mutate()}
                >
                  <RotateCcw className="h-4 w-4" />
                  재처리
                </Button>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Backend 수동 업로드</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Select
                value={uploadFileType}
                onChange={(event) =>
                  setUploadFileType(event.target.value as BackendUploadFileType)
                }
              >
                {backendFileTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </Select>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={handleUploadFileChange}
              />
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadFileMutation.isPending}
              >
                <Upload className="h-4 w-4" />
                파일 업로드
              </Button>
              <p className="text-xs text-muted-foreground">
                원본 자동 업로드는 하지 않으며, 관리자가 필요한 파일만 직접
                업로드합니다.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>참석자 추가</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {candidateParticipants.slice(0, 6).map((participant) => (
                <Button
                  key={participant.id}
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                  onClick={() => addParticipantMutation.mutate(participant.id)}
                >
                  <span>{participant.name}</span>
                  <Plus className="h-4 w-4" />
                </Button>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>메모 타임라인</CardTitle>
            </CardHeader>
            <CardContent>
              {memos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  저장된 메모가 없습니다.
                </p>
              ) : (
                <div className="space-y-3">
                  {memos.map((memo) => (
                    <div
                      key={memo.id}
                      className="rounded-md border border-border px-3 py-2 text-sm"
                    >
                      <p className="font-mono text-xs text-primary">
                        {formatDuration(memo.timestamp_ms)}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap">{memo.memo}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {result ? (
            <Card>
              <CardHeader>
                <CardTitle>화면 주요 프레임</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {result.frame_timeline.map((item) => (
                  <div
                    key={`${item.timestamp_ms}-${item.description}`}
                    className="rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <p className="font-mono text-xs text-primary">
                      {formatDuration(item.timestamp_ms)}
                    </p>
                    <p className="mt-1">{item.description}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  )
}

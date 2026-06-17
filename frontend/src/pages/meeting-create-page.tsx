import { useMemo, useState } from 'react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FilePlus2, Plus, Search, X } from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { useNavigate } from 'react-router-dom'
import { z } from 'zod'
import { PageHeader } from '@/components/page-header'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { meetingsApi, participantsApi } from '@/lib/api'
import { getElectronAPI } from '@/lib/electron'
import { formatBytes } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'
import type { Participant } from '@/types/domain'
import type { PendingLocalFile } from '@/types/electron'

const createMeetingSchema = z.object({
  title: z.string().min(1, '회의 제목은 필수입니다.'),
  meeting_date: z.string().min(1, '회의 일자는 필수입니다.'),
  project_name: z.string().optional(),
  meeting_series: z.string().optional(),
  extra_memo: z.string().optional(),
  participant_only: z.boolean(),
})

type CreateMeetingForm = z.infer<typeof createMeetingSchema>

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

export function MeetingCreatePage(): React.JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [participantQuery, setParticipantQuery] = useState('')
  const [selectedParticipants, setSelectedParticipants] = useState<Participant[]>(
    [],
  )
  const [pendingFiles, setPendingFiles] = useState<PendingLocalFile[]>([])
  const [localFileMessage, setLocalFileMessage] = useState<string | null>(null)
  const electronAvailable = Boolean(getElectronAPI())
  const form = useForm<CreateMeetingForm>({
    resolver: zodResolver(createMeetingSchema),
    defaultValues: {
      title: '',
      meeting_date: today(),
      project_name: '',
      meeting_series: '',
      extra_memo: '',
      participant_only: true,
    },
  })
  const participantOnly = useWatch({
    control: form.control,
    name: 'participant_only',
  })
  const participantsQuery = useQuery({
    queryKey: ['participants', participantQuery],
    queryFn: () => participantsApi.search(participantQuery),
  })
  const candidates = useMemo(() => {
    const selectedIds = new Set(selectedParticipants.map((item) => item.id))

    return (participantsQuery.data ?? []).filter(
      (participant) => !selectedIds.has(participant.id) && participant.id !== user?.id,
    )
  }, [participantsQuery.data, selectedParticipants, user?.id])
  const createMutation = useMutation({
    mutationFn: async (values: CreateMeetingForm) => {
      if (!user) {
        throw new Error('로그인이 필요합니다.')
      }

      const electron = getElectronAPI()

      if (!electron) {
        throw new Error(
          '회의 진행 화면은 Electron 앱에서만 사용할 수 있습니다. frontend에서 npm run dev로 열린 Electron 창에서 다시 시도해주세요.',
        )
      }

      const meeting = await meetingsApi.create(
        {
          title: values.title,
          meeting_date: values.meeting_date,
          project_name: values.project_name || null,
          meeting_series: values.meeting_series || null,
          participant_ids: selectedParticipants.map((participant) => participant.id),
          participant_only: values.participant_only,
          extra_memo: values.extra_memo || null,
        },
        user,
      )
      const directory = await electron.createMeetingDirectory({
        meetingId: meeting.id,
        title: meeting.title,
      })
      const copiedAttachments = await Promise.all(
        pendingFiles.map((file) =>
          electron.copyAttachmentToMeetingDirectory({
            meetingId: meeting.id,
            sourcePath: file.path,
          }),
        ),
      )
      await meetingsApi.update(meeting.id, {
        local_base_path: directory.path,
        attachments: copiedAttachments,
      })
      await electron.writeAppLog({
        level: 'info',
        scope: 'meeting.create',
        meeting_id: meeting.id,
        message: 'meeting created',
        metadata: {
          participant_only: values.participant_only,
          attachment_count: copiedAttachments.length,
        },
      })

      return meeting
    },
    onSuccess: async (meeting) => {
      await queryClient.invalidateQueries({ queryKey: ['meetings'] })
      navigate(`/meetings/${meeting.id}/session`)
    },
  })

  const selectFiles = async (): Promise<void> => {
    const electron = getElectronAPI()

    if (!electron) {
      setLocalFileMessage(
        '파일 첨부는 Electron 앱에서만 사용할 수 있습니다. 브라우저 미리보기에서는 로컬 파일을 선택할 수 없습니다.',
      )
      return
    }

    const files = await electron.selectLocalFiles()
    setPendingFiles((prev) => [...prev, ...files])
    setLocalFileMessage(null)
  }

  return (
    <div>
      <PageHeader
        title="회의 등록"
        description="회의 기본 정보와 참석자를 등록한 뒤 회의 진행 화면으로 이동합니다."
      />

      <form
        className="grid grid-cols-[1fr_380px] gap-6"
        onSubmit={form.handleSubmit((values) => createMutation.mutate(values))}
      >
        <Card>
          <CardHeader>
            <CardTitle>기본 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">회의 제목</Label>
              <Input id="title" {...form.register('title')} />
              {form.formState.errors.title ? (
                <p className="text-xs text-destructive">
                  {form.formState.errors.title.message}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="meeting-date">회의 일자</Label>
                <Input
                  id="meeting-date"
                  type="date"
                  {...form.register('meeting_date')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-name">프로젝트명</Label>
                <Input id="project-name" {...form.register('project_name')} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="meeting-series">회의 시리즈</Label>
              <Input id="meeting-series" {...form.register('meeting_series')} />
            </div>

            <div className="space-y-2">
              <Label htmlFor="extra-memo">추가 메모</Label>
              <Textarea id="extra-memo" {...form.register('extra_memo')} />
            </div>

            <div className="flex items-center justify-between rounded-md border border-border px-4 py-3">
              <div>
                <p className="text-sm font-medium">참여자만 열람</p>
                <p className="text-xs text-muted-foreground">
                  회의 생성자, 참석자, 관리자만 상세 페이지와 원본 경로를 볼 수
                  있습니다.
                </p>
              </div>
              <Switch
                checked={participantOnly}
                onCheckedChange={(checked) =>
                  form.setValue('participant_only', checked, {
                    shouldDirty: true,
                  })
                }
              />
            </div>

            {createMutation.error ? (
              <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {createMutation.error instanceof Error
                  ? createMutation.error.message
                  : '회의 생성에 실패했습니다.'}
              </p>
            ) : null}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>참석자</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  value={participantQuery}
                  onChange={(event) => setParticipantQuery(event.target.value)}
                  placeholder="이름 또는 이메일 검색"
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedParticipants.map((participant) => (
                  <Badge key={participant.id} variant="secondary">
                    {participant.name}
                    <button
                      type="button"
                      className="ml-2 inline-flex"
                      onClick={() =>
                        setSelectedParticipants((prev) =>
                          prev.filter((item) => item.id !== participant.id),
                        )
                      }
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>

              <div className="max-h-52 overflow-auto rounded-md border border-border">
                {candidates.map((participant) => (
                  <button
                    key={participant.id}
                    type="button"
                    className="flex w-full items-center justify-between border-b border-border px-3 py-2 text-left text-sm last:border-0 hover:bg-muted"
                    onClick={() =>
                      setSelectedParticipants((prev) => [...prev, participant])
                    }
                  >
                    <span>
                      <span className="font-medium">{participant.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        {participant.email}
                      </span>
                    </span>
                    <Plus className="h-4 w-4" />
                  </button>
                ))}
              </div>
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
                disabled={!electronAvailable}
                onClick={selectFiles}
              >
                <FilePlus2 className="h-4 w-4" />
                이미지/문서 첨부
              </Button>

              {localFileMessage ? (
                <p className="rounded-md bg-warning/10 px-3 py-2 text-sm text-warning">
                  {localFileMessage}
                </p>
              ) : null}

              <div className="space-y-2">
                {pendingFiles.map((file) => (
                  <div
                    key={file.path}
                    className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm"
                  >
                    <span className="truncate">{file.fileName}</span>
                    <span className="ml-3 shrink-0 text-xs text-muted-foreground">
                      {formatBytes(file.sizeBytes)}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Button
            type="submit"
            size="lg"
            className="w-full"
            disabled={createMutation.isPending}
          >
            회의 생성 후 진행 화면으로 이동
          </Button>
          {!electronAvailable ? (
            <p className="rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm leading-6 text-warning">
              현재 화면에는 Electron preload API가 없습니다. 로컬 회의 폴더 생성,
              첨부 파일 복사, 화면 녹화는 Electron 앱에서만 동작합니다.
            </p>
          ) : null}
        </div>
      </form>
    </div>
  )
}

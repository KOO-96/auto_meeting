import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  FileText,
  Plus,
  Users,
} from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { meetingsApi, participantsApi } from '@/lib/api'
import { formatDate } from '@/lib/format'
import type { Meeting } from '@/types/domain'

function MetricCard({
  title,
  value,
  helper,
  icon: Icon,
  tone,
}: {
  title: string
  value: number
  helper: string
  icon: typeof FileText
  tone: 'primary' | 'warning' | 'success' | 'destructive'
}): React.JSX.Element {
  const toneClass = {
    primary: 'border-l-primary bg-primary/5 text-primary',
    warning: 'border-l-warning bg-warning/10 text-warning-foreground',
    success: 'border-l-success bg-success/10 text-success',
    destructive: 'border-l-destructive bg-destructive/10 text-destructive',
  }[tone]

  return (
    <Card className={`border-l-4 ${toneClass}`}>
      <CardContent className="flex items-start justify-between gap-3 p-5">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="mt-2 text-3xl font-semibold leading-none text-foreground">
            {value}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">{helper}</p>
        </div>
        <div className="rounded-md bg-card p-2 shadow-sm">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

function isActiveProcessing(meeting: Meeting): boolean {
  return ['queued', 'processing', 'validating'].includes(meeting.status)
}

export function DashboardPage(): React.JSX.Element {
  const meetingsQuery = useQuery({
    queryKey: ['meetings'],
    queryFn: meetingsApi.list,
  })
  const participantsQuery = useQuery({
    queryKey: ['participants'],
    queryFn: participantsApi.list,
  })
  const meetings = meetingsQuery.data ?? []
  const participants = participantsQuery.data ?? []
  const recording = meetings.filter((meeting) => meeting.status === 'recording')
  const processing = meetings.filter(isActiveProcessing)
  const failed = meetings.filter((meeting) => meeting.status === 'failed')
  const completed = meetings.filter((meeting) => meeting.status === 'completed')

  return (
    <div>
      <PageHeader
        title="대시보드"
        description="회의 생성, 처리 상태, 최근 회의 흐름을 확인합니다."
        actions={
          <Button asChild>
            <Link to="/meetings/new">
              <Plus className="h-4 w-4" />새 회의 시작
            </Link>
          </Button>
        }
      />

      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          title="전체 회의"
          value={meetings.length}
          helper="등록된 회의 수"
          icon={FileText}
          tone="primary"
        />
        <MetricCard
          title="처리 중"
          value={processing.length}
          helper="대기, 처리, 검증 포함"
          icon={Clock3}
          tone="warning"
        />
        <MetricCard
          title="완료"
          value={completed.length}
          helper="결과 확인 가능"
          icon={CheckCircle2}
          tone="success"
        />
        <MetricCard
          title="실패"
          value={failed.length}
          helper="재처리 필요"
          icon={AlertTriangle}
          tone="destructive"
        />
      </div>

      {recording.length > 0 ? (
        <Card className="mt-4 border-destructive/35 bg-destructive/5">
          <CardContent className="flex items-center justify-between gap-4 p-4">
            <div>
              <p className="font-medium text-destructive">
                기록 중으로 남은 회의가 {recording.length}건 있습니다.
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                강제 종료된 회의는 회의록 목록에서 계속 진행하거나 삭제할 수
                있습니다.
              </p>
            </div>
            <Button asChild variant="destructive">
              <Link to="/meetings">정리하기</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <div className="mt-6 grid grid-cols-[minmax(0,1fr)_360px] gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>최근 회의</CardTitle>
            <Button asChild variant="outline" size="sm">
              <Link to="/meetings">전체 보기</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {meetings.length === 0 ? (
              <EmptyState
                title="등록된 회의가 없습니다."
                description="새 회의를 생성하면 로컬 회의 폴더와 진행 화면이 준비됩니다."
              />
            ) : (
              <div className="space-y-2">
                {meetings.slice(0, 6).map((meeting) => (
                  <Link
                    key={meeting.id}
                    to={`/meetings/${meeting.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_128px_110px] items-center gap-4 rounded-md border border-border px-3 py-3 text-sm transition-colors hover:border-primary/35 hover:bg-primary/5"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">{meeting.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {meeting.project_name ?? '프로젝트 없음'} · 참석자{' '}
                        {meeting.participant_ids.length}명
                      </p>
                    </div>
                    <span className="text-muted-foreground">
                      {formatDate(meeting.meeting_date)}
                    </span>
                    <StatusBadge status={meeting.status} />
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>운영 정보</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-sm">
            <div className="rounded-md border border-border bg-muted/45 p-3">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Users className="h-4 w-4" />
                <p>등록 참여자</p>
              </div>
              <p className="mt-2 text-2xl font-semibold text-foreground">
                {participants.length}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">원본 저장 정책</p>
              <p className="mt-1 leading-6">
                화면 녹화, 음성 녹음, 메모, 첨부 파일은 회의 전용 로컬
                폴더에 저장됩니다.
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">업로드 정책</p>
              <p className="mt-1 leading-6">
                MVP에서는 원본 파일 자동 업로드를 수행하지 않습니다.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

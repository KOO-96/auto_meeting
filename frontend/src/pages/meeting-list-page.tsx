import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Play, Plus, Search, Trash2 } from 'lucide-react'
import { Link } from 'react-router-dom'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { StatusBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select } from '@/components/ui/select'
import { meetingsApi, participantsApi } from '@/lib/api'
import { canAccessMeeting } from '@/lib/access'
import { formatDate } from '@/lib/format'
import { useAuthStore } from '@/stores/auth-store'

export function MeetingListPage(): React.JSX.Element {
  const queryClient = useQueryClient()
  const user = useAuthStore((state) => state.user)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const meetingsQuery = useQuery({
    queryKey: ['meetings'],
    queryFn: meetingsApi.list,
  })
  const participantsQuery = useQuery({
    queryKey: ['participants'],
    queryFn: participantsApi.list,
  })
  const participants = useMemo(
    () => participantsQuery.data ?? [],
    [participantsQuery.data],
  )
  const deleteMutation = useMutation({
    mutationFn: meetingsApi.delete,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
  const meetings = useMemo(() => meetingsQuery.data ?? [], [meetingsQuery.data])
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()

    return meetings.filter((meeting) => {
      if (filter === 'mine' && !meeting.participant_ids.includes(user?.id ?? -1)) {
        return false
      }

      if (filter === 'participant_only' && !meeting.participant_only) {
        return false
      }

      if (
        ['recording', 'completed', 'failed'].includes(filter) &&
        meeting.status !== filter
      ) {
        return false
      }

      if (
        filter === 'processing' &&
        !['queued', 'processing', 'validating'].includes(meeting.status)
      ) {
        return false
      }

      if (!normalized) {
        return true
      }

      const attendeeNames = meeting.participant_ids
        .map((id) => participants.find((item) => item.id === id)?.name)
        .filter(Boolean)
        .join(' ')

      return [
        meeting.title,
        meeting.project_name,
        meeting.meeting_series,
        attendeeNames,
        meeting.keywords.join(' '),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(normalized))
    })
  }, [filter, meetings, participants, query, user?.id])

  return (
    <div>
      <PageHeader
        title="회의록 목록"
        description="처리 상태, 프로젝트, 참여자 기준으로 회의록을 찾습니다."
        actions={
          <Button asChild>
            <Link to="/meetings/new">
              <Plus className="h-4 w-4" />
              새 회의
            </Link>
          </Button>
        }
      />

      <Card className="mb-4">
        <CardContent className="grid grid-cols-[minmax(0,1fr)_220px] gap-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="회의 제목, 프로젝트명, 참석자, 키워드 검색"
            className="pl-9"
          />
        </div>
        <Select value={filter} onChange={(event) => setFilter(event.target.value)}>
          <option value="all">전체</option>
          <option value="recording">기록 중</option>
          <option value="processing">처리 중</option>
          <option value="completed">완료</option>
          <option value="failed">실패</option>
          <option value="mine">내가 참여한 회의</option>
          <option value="participant_only">참여자만 열람</option>
        </Select>
        </CardContent>
      </Card>

      {filtered.length === 0 ? (
        <EmptyState
          title="조건에 맞는 회의록이 없습니다."
          description="검색어 또는 필터를 조정하거나 새 회의를 생성하세요."
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="grid grid-cols-[minmax(0,1.2fr)_120px_170px_120px_110px_150px] border-b border-border bg-muted/60 px-4 py-3 text-xs font-semibold text-muted-foreground">
              <span>회의</span>
              <span>일자</span>
              <span>프로젝트</span>
              <span>권한</span>
              <span>상태</span>
              <span>작업</span>
            </div>
            <div className="divide-y divide-border">
              {filtered.map((meeting) => {
                const accessible = canAccessMeeting(meeting, user)
                const attendeePreview = meeting.participant_ids
                  .slice(0, 3)
                  .map((id) => participants.find((item) => item.id === id)?.name)
                  .filter(Boolean)
                  .join(', ')

                return (
                  <div
                    key={meeting.id}
                    className="grid grid-cols-[minmax(0,1.2fr)_120px_170px_120px_110px_150px] items-center px-4 py-4 text-sm transition-colors hover:bg-primary/5"
                  >
                    <div className="min-w-0">
                      <Link
                        to={`/meetings/${meeting.id}`}
                        className="truncate font-medium hover:text-primary"
                      >
                        {meeting.title}
                      </Link>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {attendeePreview || '참석자 없음'}{' '}
                        {meeting.participant_ids.length > 3
                          ? `외 ${meeting.participant_ids.length - 3}명`
                          : ''}
                      </p>
                    </div>
                    <span className="text-muted-foreground">
                      {formatDate(meeting.meeting_date)}
                    </span>
                    <span className="truncate pr-3">
                      {meeting.project_name ?? '-'}
                    </span>
                    <span>
                      <Badge
                        variant={
                          meeting.participant_only ? 'warning' : 'secondary'
                        }
                      >
                        {meeting.participant_only
                          ? accessible
                            ? '참여자'
                            : '제한됨'
                          : '전체'}
                      </Badge>
                    </span>
                    <StatusBadge status={meeting.status} />
                    <div className="flex gap-2">
                      {meeting.status === 'recording' ? (
                        <>
                          <Button asChild size="sm">
                            <Link to={`/meetings/${meeting.id}/session`}>
                              <Play className="h-3.5 w-3.5" />
                              계속
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="destructive"
                            disabled={deleteMutation.isPending}
                            onClick={() => deleteMutation.mutate(meeting.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            삭제
                          </Button>
                        </>
                      ) : (
                        <Button asChild size="sm" variant="outline">
                          <Link to={`/meetings/${meeting.id}`}>상세</Link>
                        </Button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}

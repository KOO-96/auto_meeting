import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Play, RotateCcw } from 'lucide-react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { PageHeader } from '@/components/page-header'
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
import { meetingsApi } from '@/lib/api'
import { processingStepLabel } from '@/lib/format'

export function ProcessingStatusPage(): React.JSX.Element {
  const params = useParams()
  const meetingId = Number(params.meetingId)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [dismissedModal, setDismissedModal] = useState<
    'completed' | 'failed' | null
  >(null)
  const statusQuery = useQuery({
    queryKey: ['meeting-status', meetingId],
    queryFn: () => meetingsApi.getStatus(meetingId),
    enabled: Number.isFinite(meetingId),
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status === 'queued' ||
        status === 'processing' ||
        status === 'validating'
        ? 3000
        : false
    },
  })
  const processMutation = useMutation({
    mutationFn: () => meetingsApi.process(meetingId),
    onSuccess: async () => {
      setDismissedModal(null)
      await queryClient.invalidateQueries({
        queryKey: ['meeting-status', meetingId],
      })
      await queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
  const retryMutation = useMutation({
    mutationFn: () => meetingsApi.retry(meetingId),
    onSuccess: async () => {
      setDismissedModal(null)
      await queryClient.invalidateQueries({
        queryKey: ['meeting-status', meetingId],
      })
      await queryClient.invalidateQueries({ queryKey: ['meetings'] })
    },
  })
  const status = statusQuery.data
  const currentStep = status?.current_step ?? 1
  const totalSteps = status?.total_steps ?? 5
  const modal =
    status?.status === 'completed' || status?.status === 'failed'
      ? status.status
      : null
  const visibleModal = dismissedModal === modal ? null : modal
  const progress = Math.min(100, Math.max(0, (currentStep / totalSteps) * 100))

  return (
    <div>
      <PageHeader
        title="처리 상태"
        description="Backend 처리 상태를 3초마다 확인하고 완료 또는 실패 시 polling을 중지합니다."
      />

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-border bg-muted/50">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-muted-foreground">현재 상태</p>
              <CardTitle className="mt-1 text-2xl">
                {status?.status === 'processing'
                  ? `processing ${currentStep}/${totalSteps}`
                  : status?.status ?? 'loading'}
              </CardTitle>
            </div>
            <div className="rounded-md bg-card px-4 py-3 text-right shadow-sm">
              <p className="text-xs text-muted-foreground">진행률</p>
              <p className="mt-1 text-2xl font-semibold">
                {Math.round(progress)}%
              </p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="h-3 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="grid grid-cols-5 gap-2">
            {[1, 2, 3, 4, 5].map((step) => (
              <div
                key={step}
                className={`min-h-24 rounded-md border px-3 py-3 text-sm ${
                  step <= currentStep
                    ? 'border-primary/30 bg-primary/10 text-primary'
                    : 'border-border bg-card text-muted-foreground'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="font-medium">{step}/5</p>
                  {step < currentStep ||
                  (status?.status === 'completed' && step === currentStep) ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : null}
                </div>
                <p className="mt-1">{processingStepLabel(step)}</p>
              </div>
            ))}
          </div>

          <p className="rounded-md bg-muted px-3 py-2 text-sm">
            {status?.message ?? '처리 상태를 불러오는 중입니다.'}
          </p>

          <div className="flex gap-2">
            <Button asChild>
              <Link to={`/meetings/${meetingId}`}>상세 보기</Link>
            </Button>
            {status?.status === 'metadata_saved' ? (
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
            {status?.status === 'failed' ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => retryMutation.mutate()}
              >
                <RotateCcw className="h-4 w-4" />
                재처리
              </Button>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog
        open={visibleModal === 'completed'}
        onOpenChange={() => setDismissedModal('completed')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>회의록 정리가 완료되었습니다.</DialogTitle>
            <DialogDescription>
              원본 전사, 상세 요약, 결정사항, 액션아이템을 확인할 수 있습니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDismissedModal('completed')}
            >
              나중에 보기
            </Button>
            <Button type="button" onClick={() => navigate(`/meetings/${meetingId}`)}>
              회의록 보기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={visibleModal === 'failed'}
        onOpenChange={() => setDismissedModal('failed')}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>회의록 처리에 실패했습니다.</DialogTitle>
            <DialogDescription>
              다시 시도하거나 원본 파일을 확인해주세요.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(`/meetings/${meetingId}`)}
            >
              상세 보기
            </Button>
            <Button type="button" onClick={() => retryMutation.mutate()}>
              재처리
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

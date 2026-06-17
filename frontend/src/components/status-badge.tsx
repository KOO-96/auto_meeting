import { Badge } from './ui/badge'

export function StatusBadge({ status }: { status: string }): React.JSX.Element {
  const variant =
    status === 'completed'
      ? 'success'
      : status === 'failed'
        ? 'destructive'
        : ['queued', 'processing', 'validating'].includes(status)
          ? 'warning'
          : 'secondary'

  const label: Record<string, string> = {
    draft: '작성 중',
    recording: '기록 중',
    metadata_saved: 'Metadata 저장',
    queued: '대기 중',
    processing: '처리 중',
    validating: '검증 중',
    completed: '완료',
    failed: '실패',
  }

  const dotClass =
    status === 'completed'
      ? 'bg-success'
      : status === 'failed'
        ? 'bg-destructive'
        : ['queued', 'processing', 'validating'].includes(status)
          ? 'bg-warning'
          : status === 'recording'
            ? 'bg-primary'
            : 'bg-muted-foreground'

  return (
    <Badge variant={variant} className="gap-1.5 whitespace-nowrap">
      <span className={`h-1.5 w-1.5 rounded-full ${dotClass}`} />
      {label[status] ?? status}
    </Badge>
  )
}

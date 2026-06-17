export function formatDate(value?: string | null): string {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(value))
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return '-'
  }

  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value))
}

export function formatDuration(ms?: number | null): string {
  const safeMs = Math.max(0, ms ?? 0)
  const totalSeconds = Math.floor(safeMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (hours > 0) {
    return [hours, minutes, seconds]
      .map((item) => String(item).padStart(2, '0'))
      .join(':')
  }

  return [minutes, seconds]
    .map((item) => String(item).padStart(2, '0'))
    .join(':')
}

export function formatBytes(bytes?: number | null): string {
  if (!bytes) {
    return '-'
  }

  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unitIndex = 0

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024
    unitIndex += 1
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`
}

export function processingStepLabel(step?: number | null): string {
  const labels: Record<number, string> = {
    0: '처리 대기',
    1: '업로드 완료',
    2: '음성 전사 중',
    3: '화면/첨부 분석 중',
    4: '회의록 생성 중',
    5: '결과 검증 중',
  }

  return labels[step ?? 1] ?? '처리 대기'
}

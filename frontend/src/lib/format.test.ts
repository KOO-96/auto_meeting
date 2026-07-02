import { describe, expect, it } from 'vitest'
import { formatBytes, formatDuration, processingStepLabel } from './format'

describe('formatDuration', () => {
  it('formats sub-hour durations as mm:ss', () => {
    expect(formatDuration(0)).toBe('00:00')
    expect(formatDuration(65_000)).toBe('01:05')
  })

  it('formats hour-plus durations as hh:mm:ss', () => {
    expect(formatDuration(3_661_000)).toBe('01:01:01')
  })

  it('clamps negative/nullish values to zero', () => {
    expect(formatDuration(-5)).toBe('00:00')
    expect(formatDuration(null)).toBe('00:00')
  })
})

describe('formatBytes', () => {
  it('returns a dash for empty sizes', () => {
    expect(formatBytes(0)).toBe('-')
    expect(formatBytes(null)).toBe('-')
  })

  it('scales to human-readable units', () => {
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1024)).toBe('1.0 KB')
    expect(formatBytes(1024 * 1024)).toBe('1.0 MB')
  })
})

describe('processingStepLabel', () => {
  it('maps known steps and falls back for unknown ones', () => {
    expect(processingStepLabel(2)).toBe('음성 전사 중')
    expect(processingStepLabel(5)).toBe('결과 검증 중')
    expect(processingStepLabel(99)).toBe('처리 대기') // unknown step -> fallback
    expect(processingStepLabel(null)).toBe('업로드 완료') // null -> defaults to step 1
  })
})

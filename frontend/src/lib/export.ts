import { formatDate, formatDuration } from './format'
import type { Meeting, MeetingResult, Participant, TimelineMemo } from '@/types/domain'

function participantNames(participants: Participant[], ids: number[]): string {
  const names = ids
    .map((id) => participants.find((item) => item.id === id)?.name)
    .filter(Boolean)

  return names.length > 0 ? names.join(', ') : '-'
}

export function buildMeetingMarkdown(
  meeting: Meeting,
  result: MeetingResult,
  participants: Participant[],
  memos: TimelineMemo[],
): string {
  const actions = result.action_items
    .map(
      (item) =>
        `- ${item.content} / 담당: ${item.assignee ?? '-'} / 기한: ${
          item.due_date ?? '-'
        } / 우선순위: ${item.priority ?? '-'}`,
    )
    .join('\n')
  const decisions = result.decisions
    .map((item) => `- ${item.content}`)
    .join('\n')
  const memoLines = memos
    .map((memo) => `- ${formatDuration(memo.timestamp_ms)} ${memo.memo}`)
    .join('\n')

  return `# ${meeting.title}

- 회의 일자: ${formatDate(meeting.meeting_date)}
- 프로젝트: ${meeting.project_name ?? '-'}
- 회의 시리즈: ${meeting.meeting_series ?? '-'}
- 참석자: ${participantNames(participants, meeting.participant_ids)}
- 참여자만 열람: ${meeting.participant_only ? '예' : '아니오'}

## 한 줄 요약

${result.one_line_summary}

## 상세 요약

${result.detailed_summary}

## 키워드

${result.keywords.map((keyword) => `- ${keyword}`).join('\n')}

## 결정사항

${decisions || '-'}

## 액션아이템

${actions || '-'}

## 미결정 안건

${result.open_issues.map((item) => `- ${item}`).join('\n') || '-'}

## 리스크

${result.risks.map((item) => `- ${item}`).join('\n') || '-'}

## 다음 회의 안건

${result.next_agenda.map((item) => `- ${item}`).join('\n') || '-'}

## 메모 타임라인

${memoLines || '-'}
`
}

export function buildMeetingPdfHtml(
  meeting: Meeting,
  result: MeetingResult,
  participants: Participant[],
  memos: TimelineMemo[],
): string {
  const markdown = buildMeetingMarkdown(meeting, result, participants, memos)
  const escaped = markdown
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  return `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="utf-8" />
    <title>${meeting.title}</title>
    <style>
      body {
        color: #172033;
        font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Malgun Gothic", sans-serif;
        line-height: 1.65;
        padding: 36px;
      }
      h1 {
        font-size: 24px;
        margin: 0 0 18px;
      }
      pre {
        white-space: pre-wrap;
        word-break: keep-all;
        font-family: inherit;
        font-size: 12px;
      }
    </style>
  </head>
  <body>
    <pre>${escaped}</pre>
  </body>
</html>`
}


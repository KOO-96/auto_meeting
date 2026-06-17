import type { Meeting, User } from '@/types/domain'

export function canAccessMeeting(meeting: Meeting, user: User | null): boolean {
  if (!user) {
    return false
  }

  if (!meeting.participant_only) {
    return true
  }

  return (
    user.role === 'admin' ||
    meeting.creator_id === user.id ||
    meeting.participant_ids.includes(user.id)
  )
}


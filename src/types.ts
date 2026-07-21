export type AvailabilityStatus = 'available' | 'unsure' | 'unavailable'

export interface Profile {
  id: string
  player_code: string
  display_name: string
  avatar_path: string | null
  avatar_url?: string | null
  is_active: boolean
  colorblind_mode: boolean
  created_at: string
  updated_at: string
}

export interface Availability {
  id: string
  user_id: string
  day: string
  status: AvailabilityStatus
  note: string | null
  created_at: string
  updated_at: string
}

export interface ChatMessage {
  id: string
  user_id: string
  message: string
  created_at: string
}

export interface MeetingEvent {
  id: string
  event_type: 'jackpot'
  day: string
  created_at: string
}

export type MeetingIdeaVoteValue = 'up' | 'down'

export interface MeetingIdea {
  id: string
  author_id: string
  day: string
  title: string
  created_at: string
}

export interface MeetingIdeaVote {
  idea_id: string
  user_id: string
  vote: MeetingIdeaVoteValue
  created_at: string
  updated_at: string
}

export type AvailabilityStatus = 'available' | 'unsure' | 'unavailable'

export interface Profile {
  id: string
  player_code: string
  display_name: string
  avatar_path: string | null
  avatar_url?: string | null
  is_active: boolean
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

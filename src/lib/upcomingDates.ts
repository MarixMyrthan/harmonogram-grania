import type { Availability, Profile } from '../types'
import { toDateKey } from './date'

export interface CandidateDate {
  day: string
  availableCount: number
  unsureCount: number
  entries: Availability[]
}

export function findUpcomingDates(
  profiles: Profile[],
  availability: Availability[],
  today = toDateKey(new Date()),
  limit = 4,
): CandidateDate[] {
  if (profiles.length === 0 || limit <= 0) return []

  const activeIds = new Set(profiles.map((profile) => profile.id))
  const byDay = new Map<string, Availability[]>()

  for (const entry of availability) {
    if (entry.day < today || !activeIds.has(entry.user_id)) continue

    const list = byDay.get(entry.day) || []
    list.push(entry)
    byDay.set(entry.day, list)
  }

  return [...byDay.entries()]
    .map(([day, entries]) => {
      const uniqueEntries = new Map(
        entries.map((entry) => [entry.user_id, entry]),
      )

      const values = profiles
        .map((profile) => uniqueEntries.get(profile.id))
        .filter((entry): entry is Availability => Boolean(entry))

      if (values.length !== profiles.length) return null
      if (values.some((entry) => entry.status === 'unavailable')) return null

      const availableCount = values.filter(
        (entry) => entry.status === 'available',
      ).length

      const unsureCount = values.filter(
        (entry) => entry.status === 'unsure',
      ).length

      return {
        day,
        availableCount,
        unsureCount,
        entries: values,
      }
    })
    .filter(
      (candidate): candidate is CandidateDate => Boolean(candidate),
    )
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(0, limit)
}

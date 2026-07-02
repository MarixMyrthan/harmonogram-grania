export function normalizePlayerCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, '')
}

export function playerCodeToEmail(value: string): string {
  const normalized = normalizePlayerCode(value).toLowerCase()
  return `${normalized}@players.invalid`
}

export function normalizePin(value: string): string {
  return value.replace(/\D/g, '').slice(0, 6)
}

export function isValidPin(value: string): boolean {
  return /^\d{6}$/.test(value)
}

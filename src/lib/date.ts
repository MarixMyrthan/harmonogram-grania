const polishMonthFormatter = new Intl.DateTimeFormat('pl-PL', {
  month: 'long',
  year: 'numeric',
})

const polishLongDateFormatter = new Intl.DateTimeFormat('pl-PL', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
})

export const WEEKDAYS = ['Pon', 'Wt', 'Śr', 'Czw', 'Pt', 'Sob', 'Niedz']

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0)
}

export function addMonths(date: Date, amount: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1)
}

export function toDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function fromDateKey(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

export function monthLabel(date: Date): string {
  const text = polishMonthFormatter.format(date)
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function longDateLabel(day: string): string {
  const text = polishLongDateFormatter.format(fromDateKey(day))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function buildMonthGrid(date: Date): Array<Date | null> {
  const first = startOfMonth(date)
  const last = endOfMonth(date)
  const mondayBasedOffset = (first.getDay() + 6) % 7
  const cells: Array<Date | null> = Array.from({ length: mondayBasedOffset }, () => null)

  for (let day = 1; day <= last.getDate(); day += 1) {
    cells.push(new Date(date.getFullYear(), date.getMonth(), day))
  }

  while (cells.length % 7 !== 0) cells.push(null)
  return cells
}

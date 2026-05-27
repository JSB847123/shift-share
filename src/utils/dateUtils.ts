const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토']

export function getDayName(date: Date): string {
  return DAY_NAMES[date.getDay()]
}

export function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function isWeekend(date: Date): boolean {
  const day = date.getDay()
  return day === 0 || day === 6
}

export function getDateRange(
  startDate: string,
  endDate: string,
  weekdayOnly: boolean,
  excludeDates: Set<string>,
): string[] {
  const dates: string[] = []
  const start = parseDate(startDate)
  const end = parseDate(endDate)

  const current = new Date(start)
  while (current <= end) {
    const dateStr = formatDate(current)
    const skip =
      excludeDates.has(dateStr) || (weekdayOnly && isWeekend(current))

    if (!skip) {
      dates.push(dateStr)
    }

    current.setDate(current.getDate() + 1)
  }

  return dates
}

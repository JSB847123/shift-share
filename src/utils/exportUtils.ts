import type { Assignment } from '../types'

export function toCSV(assignments: Assignment[]): string {
  const BOM = '\uFEFF'
  const header = '날짜,요일,차출 인원'
  const rows = assignments.map(
    (a) => `${a.date},${a.dayOfWeek},"${a.names.join(', ')}"`,
  )
  return BOM + [header, ...rows].join('\r\n')
}

export function downloadCSV(assignments: Assignment[], filename: string): void {
  const csv = toCSV(assignments)
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

export function copyToClipboard(assignments: Assignment[]): Promise<void> {
  const header = '날짜\t요일\t차출 인원'
  const rows = assignments.map(
    (a) => `${a.date}\t${a.dayOfWeek}\t${a.names.join(', ')}`,
  )
  const text = [header, ...rows].join('\n')
  return navigator.clipboard.writeText(text)
}

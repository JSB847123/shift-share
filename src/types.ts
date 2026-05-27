export interface ExcludeDate {
  date: string // YYYY-MM-DD
  reason: string
}

export interface PersonExclude {
  name: string
  date: string // YYYY-MM-DD
  reason: string
}

export interface PersonPin {
  name: string
  date: string // YYYY-MM-DD
  reason: string
}

export interface ConflictPair {
  nameA: string
  nameB: string
}

export interface SeparateRotation {
  id: string
  label: string
  type: 'day-of-month' | 'day-of-week'
  value: number // day-of-month: 1~31, day-of-week: 0=일~6=토
  perDay: number
}

export interface Assignment {
  date: string // YYYY-MM-DD
  dayOfWeek: string
  dayIndex: number // 0=일, 1=월, ..., 6=토
  names: string[]
  rotationId?: string // which rotation group this belongs to
}

export interface RotationStats {
  label: string
  stats: Record<string, number>
}

export interface ScheduleResult {
  assignments: Assignment[]
  mainStats: Record<string, number>
  separateStats: RotationStats[]
  excludedDates: ExcludeDate[]
  personExcludes: PersonExclude[]
  personPins: PersonPin[]
}

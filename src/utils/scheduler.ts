import type {
  Assignment, ConflictPair, ExcludeDate, PersonExclude, PersonPin,
  SeparateRotation, RotationStats, ScheduleResult,
} from '../types'
import { getDateRange, parseDate, getDayName } from './dateUtils'

function shuffle<T>(array: T[]): T[] {
  const arr = [...array]
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function findRotation(
  date: Date,
  rotations: SeparateRotation[],
): SeparateRotation | undefined {
  for (const rot of rotations) {
    if (rot.type === 'day-of-week' && date.getDay() === rot.value) return rot
    if (rot.type === 'day-of-month' && date.getDate() === rot.value) return rot
  }
  return undefined
}

function hasConflict(
  candidate: string,
  selected: string[],
  conflictMap: Map<string, Set<string>>,
): boolean {
  const conflicts = conflictMap.get(candidate)
  if (!conflicts) return false
  return selected.some((name) => conflicts.has(name))
}

function pickNames(
  availableNames: string[],
  stats: Record<string, number>,
  count: number,
  pinnedNames: string[],
  conflictMap: Map<string, Set<string>>,
  useOrder: boolean = false,
  nameOrder: string[] = [],
): string[] {
  const selected = [...pinnedNames]

  const remaining = availableNames.filter((n) => !selected.includes(n))
  const sortedNames = [...remaining].sort((a, b) => stats[a] - stats[b])

  let i = 0
  while (selected.length < count && i < sortedNames.length) {
    const currentCount = stats[sortedNames[i]]
    const sameCountGroup: string[] = []

    while (i < sortedNames.length && stats[sortedNames[i]] === currentCount) {
      sameCountGroup.push(sortedNames[i])
      i++
    }

    const ordered = useOrder
      ? [...sameCountGroup].sort((a, b) => nameOrder.indexOf(a) - nameOrder.indexOf(b))
      : shuffle(sameCountGroup)
    for (const name of ordered) {
      if (selected.length < count && !hasConflict(name, selected, conflictMap)) {
        selected.push(name)
      }
    }
  }

  return selected
}

function buildConflictMap(conflicts: ConflictPair[]): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>()
  for (const { nameA, nameB } of conflicts) {
    if (!map.has(nameA)) map.set(nameA, new Set())
    if (!map.has(nameB)) map.set(nameB, new Set())
    map.get(nameA)!.add(nameB)
    map.get(nameB)!.add(nameA)
  }
  return map
}

export function generateSchedule(
  startDate: string,
  endDate: string,
  names: string[],
  perDay: number,
  weekdayOnly: boolean,
  excludeDates: ExcludeDate[],
  personExcludes: PersonExclude[],
  personPins: PersonPin[],
  separateRotations: SeparateRotation[],
  conflicts: ConflictPair[],
  useOrder: boolean = false,
): ScheduleResult {
  const excludeSet = new Set(excludeDates.map((e) => e.date))
  const dates = getDateRange(startDate, endDate, weekdayOnly, excludeSet)
  const conflictMap = buildConflictMap(conflicts)

  // Build lookups
  const personExcludeMap = new Map<string, Set<string>>()
  for (const pe of personExcludes) {
    if (!personExcludeMap.has(pe.date)) {
      personExcludeMap.set(pe.date, new Set())
    }
    personExcludeMap.get(pe.date)!.add(pe.name)
  }

  const personPinMap = new Map<string, string[]>()
  for (const pp of personPins) {
    if (!personPinMap.has(pp.date)) {
      personPinMap.set(pp.date, [])
    }
    const list = personPinMap.get(pp.date)!
    if (!list.includes(pp.name)) {
      list.push(pp.name)
    }
  }

  // Initialize stats: main + each separate rotation
  const mainStats: Record<string, number> = {}
  const rotationStatsMap = new Map<string, Record<string, number>>()

  for (const name of names) {
    mainStats[name] = 0
  }
  for (const rot of separateRotations) {
    const s: Record<string, number> = {}
    for (const name of names) s[name] = 0
    rotationStatsMap.set(rot.id, s)
  }

  const assignments: Assignment[] = []

  for (const dateStr of dates) {
    const date = parseDate(dateStr)
    const dayIndex = date.getDay()
    const dayOfWeek = getDayName(date)

    const rotation = findRotation(date, separateRotations)

    const pinnedOnDate = (personPinMap.get(dateStr) ?? []).filter((n) => names.includes(n))
    const excludedOnDate = personExcludeMap.get(dateStr)
    const availableNames = names.filter(
      (n) => !pinnedOnDate.includes(n) && (!excludedOnDate || !excludedOnDate.has(n)),
    )

    if (rotation) {
      const rStats = rotationStatsMap.get(rotation.id)!
      const selected = pickNames(availableNames, rStats, rotation.perDay, pinnedOnDate, conflictMap, useOrder, names)

      for (const name of selected) {
        rStats[name]++
      }

      assignments.push({ date: dateStr, dayOfWeek, dayIndex, names: selected, rotationId: rotation.id })
    } else {
      const selected = pickNames(availableNames, mainStats, perDay, pinnedOnDate, conflictMap, useOrder, names)

      for (const name of selected) {
        mainStats[name]++
      }

      assignments.push({ date: dateStr, dayOfWeek, dayIndex, names: selected })
    }
  }

  const separateStats: RotationStats[] = separateRotations.map((rot) => ({
    label: rot.label,
    stats: rotationStatsMap.get(rot.id)!,
  }))

  return {
    assignments,
    mainStats,
    separateStats,
    excludedDates: excludeDates,
    personExcludes,
    personPins,
  }
}

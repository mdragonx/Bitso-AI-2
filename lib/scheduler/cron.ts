const FIELD_COUNT = 5
const MAX_SEARCH_MINUTES = 366 * 24 * 60

interface ParsedField {
  allowed: Set<number>
  wildcard: boolean
}

interface ParsedCron {
  minute: ParsedField
  hour: ParsedField
  dayOfMonth: ParsedField
  month: ParsedField
  dayOfWeek: ParsedField
}

const ranges = {
  minute: { min: 0, max: 59 },
  hour: { min: 0, max: 23 },
  dayOfMonth: { min: 1, max: 31 },
  month: { min: 1, max: 12 },
  dayOfWeek: { min: 0, max: 7 },
} as const

function expandPart(part: string, min: number, max: number): number[] {
  if (part === '*') {
    return Array.from({ length: max - min + 1 }, (_, idx) => min + idx)
  }

  const stepSplit = part.split('/')
  if (stepSplit.length > 2) {
    throw new Error('Invalid cron step segment')
  }

  const base = stepSplit[0]
  const step = stepSplit[1] ? Number(stepSplit[1]) : 1
  if (!Number.isInteger(step) || step <= 0) {
    throw new Error('Invalid cron step value')
  }

  let start = min
  let end = max

  if (base !== '*') {
    const rangeSplit = base.split('-')
    if (rangeSplit.length === 1) {
      const value = Number(rangeSplit[0])
      if (!Number.isInteger(value)) throw new Error('Invalid cron value')
      start = value
      end = value
    } else if (rangeSplit.length === 2) {
      start = Number(rangeSplit[0])
      end = Number(rangeSplit[1])
      if (!Number.isInteger(start) || !Number.isInteger(end) || start > end) {
        throw new Error('Invalid cron range')
      }
    } else {
      throw new Error('Invalid cron range segment')
    }
  }

  if (start < min || end > max) {
    throw new Error('Cron field out of range')
  }

  const values: number[] = []
  for (let value = start; value <= end; value += step) {
    values.push(value)
  }

  return values
}

function parseField(field: string, min: number, max: number): ParsedField {
  const wildcard = field.trim() === '*'
  const values = new Set<number>()

  for (const segment of field.split(',')) {
    const trimmed = segment.trim()
    if (!trimmed) {
      throw new Error('Invalid empty cron segment')
    }

    for (const value of expandPart(trimmed, min, max)) {
      values.add(value)
    }
  }

  return { allowed: values, wildcard }
}

function normalizeDow(value: number): number {
  return value === 7 ? 0 : value
}

function parseCron(cronExpression: string): ParsedCron {
  const parts = cronExpression.trim().split(/\s+/)
  if (parts.length !== FIELD_COUNT) {
    throw new Error('Cron expression must have 5 fields')
  }

  const minute = parseField(parts[0], ranges.minute.min, ranges.minute.max)
  const hour = parseField(parts[1], ranges.hour.min, ranges.hour.max)
  const dayOfMonth = parseField(parts[2], ranges.dayOfMonth.min, ranges.dayOfMonth.max)
  const month = parseField(parts[3], ranges.month.min, ranges.month.max)
  const rawDayOfWeek = parseField(parts[4], ranges.dayOfWeek.min, ranges.dayOfWeek.max)

  const normalizedDow = new Set<number>()
  for (const value of rawDayOfWeek.allowed) {
    normalizedDow.add(normalizeDow(value))
  }

  return {
    minute,
    hour,
    dayOfMonth,
    month,
    dayOfWeek: { allowed: normalizedDow, wildcard: rawDayOfWeek.wildcard },
  }
}

function getZonedDateParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hour12: false,
    weekday: 'short',
  })

  const parts = formatter.formatToParts(date)
  const read = (type: string) => Number(parts.find(part => part.type === type)?.value)
  const weekdayString = parts.find(part => part.type === 'weekday')?.value
  const weekdayLookup: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  const minute = read('minute')
  const hour = read('hour')
  const day = read('day')
  const month = read('month')
  const dow = weekdayString ? weekdayLookup[weekdayString] : undefined

  if ([minute, hour, day, month, dow].some(value => value == null || Number.isNaN(value))) {
    throw new Error('Unable to parse timezone adjusted date components')
  }

  return { minute, hour, day, month, dow: dow as number }
}

function matchesDay(parsed: ParsedCron, dayOfMonth: number, dayOfWeek: number): boolean {
  const domMatch = parsed.dayOfMonth.allowed.has(dayOfMonth)
  const dowMatch = parsed.dayOfWeek.allowed.has(dayOfWeek)

  if (parsed.dayOfMonth.wildcard && parsed.dayOfWeek.wildcard) return true
  if (parsed.dayOfMonth.wildcard) return dowMatch
  if (parsed.dayOfWeek.wildcard) return domMatch
  return domMatch || dowMatch
}

function matchesCron(parsed: ParsedCron, date: Date, timezone: string): boolean {
  const zoned = getZonedDateParts(date, timezone)

  return (
    parsed.minute.allowed.has(zoned.minute) &&
    parsed.hour.allowed.has(zoned.hour) &&
    parsed.month.allowed.has(zoned.month) &&
    matchesDay(parsed, zoned.day, zoned.dow)
  )
}

export function validateCronExpression(cronExpression: string): boolean {
  try {
    parseCron(cronExpression)
    return true
  } catch {
    return false
  }
}

export function getNextRunTime(cronExpression: string, timezone = 'UTC', fromDate = new Date()): Date {
  const parsed = parseCron(cronExpression)
  const candidate = new Date(fromDate)
  candidate.setSeconds(0, 0)
  candidate.setMinutes(candidate.getMinutes() + 1)

  for (let i = 0; i < MAX_SEARCH_MINUTES; i += 1) {
    if (matchesCron(parsed, candidate, timezone)) {
      return new Date(candidate)
    }

    candidate.setMinutes(candidate.getMinutes() + 1)
  }

  throw new Error('Unable to compute next cron run time within search window')
}

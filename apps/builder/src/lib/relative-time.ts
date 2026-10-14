export type RelativeTimeInput = Date | string | number

/** Past times closer than this read "just now" instead of "N seconds ago". */
export const JUST_NOW_SECONDS = 10

const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR
const DAYS_PER_MONTH = 30.44
const DAYS_PER_YEAR = 365.25

const formatters = new Map<string, Intl.RelativeTimeFormat>()

const formatterFor = (locale: string): Intl.RelativeTimeFormat => {
  let formatter = formatters.get(locale)
  if (!formatter) {
    // "always": "1 день назад" rather than "вчера", so every label in a list
    // reads the same way.
    formatter = new Intl.RelativeTimeFormat(locale, { numeric: "always" })
    formatters.set(locale, formatter)
  }
  return formatter
}

export const toTimestamp = (value: RelativeTimeInput): number =>
  value instanceof Date ? value.getTime() : new Date(value).getTime()

/** The largest unit that fits, rounded like date-fns' strict distance. */
const pickUnit = (
  absMs: number,
): { value: number; unit: Intl.RelativeTimeFormatUnit } => {
  const seconds = Math.round(absMs / SECOND)
  if (seconds < 60) {
    return { value: seconds, unit: "second" }
  }
  const minutes = Math.round(absMs / MINUTE)
  if (minutes < 60) {
    return { value: minutes, unit: "minute" }
  }
  const hours = Math.round(absMs / HOUR)
  if (hours < 24) {
    return { value: hours, unit: "hour" }
  }
  const days = Math.round(absMs / DAY)
  if (days < 7) {
    return { value: days, unit: "day" }
  }
  if (days < 30) {
    return { value: Math.round(days / 7), unit: "week" }
  }
  const months = Math.round(days / DAYS_PER_MONTH)
  if (months < 12) {
    return { value: Math.max(months, 1), unit: "month" }
  }
  return { value: Math.max(Math.round(days / DAYS_PER_YEAR), 1), unit: "year" }
}

/**
 * "5 минут назад" / "через 2 дня" in `locale`, relative to `now`. Plural
 * forms come from `Intl.RelativeTimeFormat`, so every locale is grammatical.
 * Past times under {@link JUST_NOW_SECONDS} return `justNow`. Invalid dates
 * return an empty string.
 */
export function formatRelativeTime(
  value: RelativeTimeInput,
  {
    locale,
    now,
    justNow,
  }: {
    locale: string
    now: number
    /** Translated "just now" label. */
    justNow: string
  },
): string {
  const time = toTimestamp(value)
  if (Number.isNaN(time)) {
    return ""
  }
  const diff = time - now
  if (diff <= 0 && -diff < JUST_NOW_SECONDS * SECOND) {
    return justNow
  }
  const { value: amount, unit } = pickUnit(Math.abs(diff))
  return formatterFor(locale).format(diff < 0 ? -amount : amount, unit)
}

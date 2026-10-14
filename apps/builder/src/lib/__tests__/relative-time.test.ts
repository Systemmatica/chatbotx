import { describe, expect, test } from "vitest"
import { formatRelativeTime } from "../relative-time"

const NOW = Date.parse("2026-10-14T12:00:00Z")
const SECOND = 1000
const MINUTE = 60 * SECOND
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const ru = (offsetMs: number) =>
  formatRelativeTime(NOW + offsetMs, {
    locale: "ru",
    now: NOW,
    justNow: "только что",
  })

const en = (offsetMs: number) =>
  formatRelativeTime(NOW + offsetMs, {
    locale: "en",
    now: NOW,
    justNow: "just now",
  })

describe("formatRelativeTime (ru)", () => {
  test("under 10 seconds ago reads 'только что'", () => {
    expect(ru(0)).toBe("только что")
    expect(ru(-9 * SECOND)).toBe("только что")
  })

  test("uses Russian plural forms for seconds", () => {
    expect(ru(-21 * SECOND)).toBe("21 секунду назад")
    expect(ru(-22 * SECOND)).toBe("22 секунды назад")
    expect(ru(-25 * SECOND)).toBe("25 секунд назад")
    expect(ru(-51 * SECOND)).toBe("51 секунду назад")
  })

  test("minutes, hours and days", () => {
    expect(ru(-1 * MINUTE)).toBe("1 минуту назад")
    expect(ru(-3 * MINUTE)).toBe("3 минуты назад")
    expect(ru(-10 * HOUR)).toBe("10 часов назад")
    expect(ru(-1 * HOUR)).toBe("1 час назад")
    expect(ru(-4 * DAY)).toBe("4 дня назад")
    expect(ru(-5 * DAY)).toBe("5 дней назад")
  })

  test("weeks, months and years", () => {
    expect(ru(-14 * DAY)).toBe("2 недели назад")
    expect(ru(-61 * DAY)).toBe("2 месяца назад")
    expect(ru(-800 * DAY)).toBe("2 года назад")
  })

  test("future times", () => {
    expect(ru(5 * SECOND)).toBe("через 5 секунд")
    expect(ru(24.5 * HOUR)).toBe("через 1 день")
  })

  test("accepts ISO strings and Dates, empty for invalid input", () => {
    expect(
      formatRelativeTime(new Date(NOW - 2 * MINUTE).toISOString(), {
        locale: "ru",
        now: NOW,
        justNow: "только что",
      }),
    ).toBe("2 минуты назад")
    expect(
      formatRelativeTime(new Date(NOW - 2 * MINUTE), {
        locale: "ru",
        now: NOW,
        justNow: "только что",
      }),
    ).toBe("2 минуты назад")
    expect(
      formatRelativeTime("not a date", {
        locale: "ru",
        now: NOW,
        justNow: "только что",
      }),
    ).toBe("")
  })
})

describe("formatRelativeTime (en)", () => {
  test("just now, then singular and plural forms", () => {
    expect(en(-3 * SECOND)).toBe("just now")
    expect(en(-51 * SECOND)).toBe("51 seconds ago")
    expect(en(-1 * MINUTE)).toBe("1 minute ago")
    expect(en(-10 * HOUR)).toBe("10 hours ago")
    expect(en(-4 * DAY)).toBe("4 days ago")
    expect(en(-1 * DAY)).toBe("1 day ago")
  })

  test("rounds to the nearest unit", () => {
    expect(en(-(59 * MINUTE + 40 * SECOND))).toBe("1 hour ago")
    expect(en(-90 * SECOND)).toBe("2 minutes ago")
  })

  test("future times", () => {
    expect(en(24.5 * HOUR)).toBe("in 1 day")
  })
})

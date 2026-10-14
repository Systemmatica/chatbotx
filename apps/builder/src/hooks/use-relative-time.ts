"use client"

import { useLocale, useTranslations } from "next-intl"
import { useCallback, useSyncExternalStore } from "react"
import { LIVE_REFRESH_INTERVAL_MS } from "@/lib/live-refresh"
import { formatRelativeTime, type RelativeTimeInput } from "@/lib/relative-time"

/**
 * One shared clock for every relative time label on the page: a single
 * interval (only while something is subscribed and the tab is visible) bumps
 * `now`, and each label re-renders only when its own text changes — "5 секунд
 * назад" updates every tick, "3 дня назад" practically never.
 */
const listeners = new Set<() => void>()
let now = Date.now()
let timer: ReturnType<typeof setInterval> | undefined

const tick = () => {
  now = Date.now()
  for (const listener of listeners) {
    listener()
  }
}

const isHidden = () =>
  typeof document !== "undefined" && document.visibilityState === "hidden"

const startTimer = () => {
  if (timer === undefined && !isHidden()) {
    timer = setInterval(tick, LIVE_REFRESH_INTERVAL_MS)
  }
}

const stopTimer = () => {
  clearInterval(timer)
  timer = undefined
}

const onVisibilityChange = () => {
  if (isHidden()) {
    stopTimer()
    return
  }
  tick()
  startTimer()
}

const subscribe = (listener: () => void) => {
  listeners.add(listener)
  if (listeners.size === 1) {
    now = Date.now()
    startTimer()
    document.addEventListener("visibilitychange", onVisibilityChange)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopTimer()
      document.removeEventListener("visibilitychange", onVisibilityChange)
    }
  }
}

/** The shared clock's current time (stale-free while nobody listens). */
const getNow = () => {
  if (listeners.size === 0) {
    now = Date.now()
  }
  return now
}

/**
 * Relative time label ("только что", "5 минут назад", "через 2 дня") in the
 * current interface locale that keeps itself fresh without network requests.
 * Returns an empty string for a missing or invalid date.
 */
export function useRelativeTime(
  value: RelativeTimeInput | null | undefined,
): string {
  const locale = useLocale()
  const t = useTranslations("relativeTime")
  const justNow = t("justNow")
  const time = value == null ? null : new Date(value).getTime()

  const getSnapshot = useCallback(
    () =>
      time === null
        ? ""
        : formatRelativeTime(time, { locale, justNow, now: getNow() }),
    [time, locale, justNow],
  )

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}

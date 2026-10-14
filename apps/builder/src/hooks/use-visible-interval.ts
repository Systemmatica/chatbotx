"use client"

import { useEffect, useRef } from "react"
import { LIVE_REFRESH_INTERVAL_MS } from "@/lib/live-refresh"

/** Focus and visibilitychange both fire on tab return: run once for both. */
const MIN_RESUME_GAP_MS = 1000

/**
 * Calls `callback` every `intervalMs` while the tab is visible — a background
 * refresh for data that can change server-side while a screen is open.
 *
 * - Paused while `document.visibilityState` is "hidden"; runs at once when the
 *   tab becomes visible or the window regains focus, then resumes the cadence.
 * - Never overlaps: while a promise returned by `callback` is pending, ticks
 *   are skipped.
 * - Does not run on mount (the screen does its own initial load) and stops
 *   while `enabled` is false.
 * - Always calls the latest `callback`, so it may close over fresh state.
 */
export function useVisibleInterval(
  callback: () => unknown,
  intervalMs: number = LIVE_REFRESH_INTERVAL_MS,
  { enabled = true }: { enabled?: boolean } = {},
): void {
  const callbackRef = useRef(callback)
  callbackRef.current = callback

  useEffect(() => {
    if (!enabled) {
      return
    }

    let timer: ReturnType<typeof setInterval> | undefined
    let pending = false
    let lastRunAt = 0
    let disposed = false

    const run = () => {
      if (pending || disposed) {
        return
      }
      lastRunAt = Date.now()
      let result: unknown
      try {
        result = callbackRef.current()
      } catch {
        return
      }
      if (result instanceof Promise) {
        pending = true
        result
          .catch(() => {
            // A failed background refresh waits for the next tick.
          })
          .finally(() => {
            pending = false
          })
      }
    }

    const isVisible = () => document.visibilityState !== "hidden"

    const start = () => {
      if (timer === undefined && isVisible()) {
        timer = setInterval(run, intervalMs)
      }
    }

    const stop = () => {
      clearInterval(timer)
      timer = undefined
    }

    const resume = () => {
      if (!isVisible()) {
        stop()
        return
      }
      if (Date.now() - lastRunAt >= MIN_RESUME_GAP_MS) {
        run()
      }
      // Restart so the next tick is a full interval after this run.
      stop()
      start()
    }

    start()
    document.addEventListener("visibilitychange", resume)
    window.addEventListener("focus", resume)
    return () => {
      disposed = true
      stop()
      document.removeEventListener("visibilitychange", resume)
      window.removeEventListener("focus", resume)
    }
  }, [enabled, intervalMs])
}

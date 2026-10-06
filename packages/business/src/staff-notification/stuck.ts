import type { StaffNotificationEvent } from "@chatbotx.io/worker-config"

/** Default `Workspace.stuckContactNotifyHours`; 0 turns the check off. */
export const DEFAULT_STUCK_CONTACT_NOTIFY_HOURS = 24
export const MAX_STUCK_CONTACT_NOTIFY_HOURS = 24 * 30

/** Choices offered in the UI (hours). */
export const STUCK_CONTACT_NOTIFY_HOUR_OPTIONS = [
  0, 1, 3, 6, 12, 24, 48, 72, 168,
] as const

/**
 * How far behind the threshold a scan still looks. The cron runs every 15
 * minutes, so each stale row is seen on many scans (the Redis claim reports
 * it once); the bound keeps the query on recent rows only and means a worker
 * outage longer than this silently skips the oldest ones instead of flooding
 * staff with a backlog.
 */
export const STUCK_SCAN_LOOKBACK_MS = 6 * 60 * 60 * 1000

/**
 * Node types where a long stay is the design, not a problem: a timed wait or
 * a follow-up waiting for its delay.
 */
export const STUCK_IGNORED_NODE_TYPES = ["wait", "followUp"] as const

/** Up to this many newly stuck contacts per workspace per scan are sent one by one; more become one summary. */
export const STUCK_INDIVIDUAL_LIMIT = 5

export type StuckScanWindow = {
  /** `currentNodeAt` must be at or before this… */
  staleBefore: Date
  /** …and strictly after this. */
  notBefore: Date
}

export function computeStuckScanWindow(
  now: Date,
  thresholdHours: number,
  lookbackMs: number = STUCK_SCAN_LOOKBACK_MS,
): StuckScanWindow | null {
  if (!Number.isFinite(thresholdHours) || thresholdHours <= 0) {
    return null
  }
  const staleBefore = new Date(now.getTime() - thresholdHours * 60 * 60 * 1000)
  return {
    staleBefore,
    notBefore: new Date(staleBefore.getTime() - lookbackMs),
  }
}

export function isInStuckWindow(
  reachedAt: Date,
  window: StuckScanWindow,
): boolean {
  const time = reachedAt.getTime()
  return (
    time <= window.staleBefore.getTime() && time > window.notBefore.getTime()
  )
}

export type StuckRow = {
  contactInboxId: string
  flowId: string
  nodeId: string
  reachedAt: Date
}

export type StuckGroup = { flowId: string; nodeId: string; count: number }

/** Groups by step, biggest first (ties keep first-seen order). */
export function groupStuckRows(rows: readonly StuckRow[]): StuckGroup[] {
  const groups = new Map<string, StuckGroup>()
  for (const row of rows) {
    const key = `${row.flowId}:${row.nodeId}`
    const group = groups.get(key)
    if (group) {
      group.count++
    } else {
      groups.set(key, { flowId: row.flowId, nodeId: row.nodeId, count: 1 })
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count)
}

export function clampStuckHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) {
    return 0
  }
  return Math.min(Math.round(hours), MAX_STUCK_CONTACT_NOTIFY_HOURS)
}

export type PlannedStuckEvent = {
  event: StaffNotificationEvent
  /** Deterministic id for single-contact events (a re-run cannot duplicate). */
  jobId?: string
}

/**
 * Turns the rows newly claimed in one scan of one workspace into events: one
 * per contact while the batch is small, otherwise a single summary so a mass
 * stall (a broken step, an outage) is one message instead of a flood.
 */
export function planStuckEvents(
  rows: readonly StuckRow[],
  thresholdHours: number,
  individualLimit: number = STUCK_INDIVIDUAL_LIMIT,
): PlannedStuckEvent[] {
  if (rows.length === 0) {
    return []
  }
  if (rows.length <= individualLimit) {
    return rows.map((row) => ({
      event: {
        kind: "contactStuck",
        contactInboxId: row.contactInboxId,
        flowId: row.flowId,
        nodeId: row.nodeId,
        reachedAt: row.reachedAt.toISOString(),
      },
      jobId: `staff-stuck-${row.contactInboxId}-${row.reachedAt.getTime()}`,
    }))
  }
  return [
    {
      event: {
        kind: "contactStuckSummary",
        total: rows.length,
        thresholdHours,
        groups: groupStuckRows(rows),
      },
    },
  ]
}

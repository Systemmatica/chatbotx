import type { ContactActivityBefore } from "@chatbotx.io/database/repositories"

/**
 * Pure part of the contact activity feed: ordering, cursor and page merge.
 *
 * The feed merges two kinds of events:
 * - table events (`ContactActivity` rows), paginated in SQL;
 * - derived events computed from existing tables (contact created, current
 *   tags, notes, current flow step...) — bounded per contact, so they are
 *   loaded whole and filtered in memory.
 *
 * Global order is `(occurredAt DESC, key DESC)`. Table keys are `a:` plus the
 * zero-padded id, so the string order of keys matches the numeric order of
 * ids and every derived key (`tag:`, `note:`...) sorts after `a:` — at the
 * same instant derived events come first, which is what the SQL cursor in
 * `contactActivityRepository.listByContact` assumes.
 */

export const contactActivityFeedTypes = [
  "contactCreated",
  "channelConnected",
  "tagAdded",
  "tagRemoved",
  "leadMagnetReceived",
  "customFieldChanged",
  "flowStarted",
  "stepReached",
  "noteAdded",
  "assignmentChanged",
  "conversationClosed",
] as const
export type ContactActivityFeedType = (typeof contactActivityFeedTypes)[number]

export type ContactActivityFeedActor = {
  type: "user" | "bot" | "api"
  userId: string | null
  name: string | null
}

export type ContactActivityFeedDetails = {
  channel?: string | null
  source?: string | null
  inboxName?: string | null
  tagName?: string | null
  leadMagnetName?: string | null
  customFieldName?: string | null
  oldValue?: string | null
  newValue?: string | null
  flowId?: string | null
  flowName?: string | null
  nodeType?: string | null
  nodeName?: string | null
  nodePreview?: string | null
  assigneeName?: string | null
  assigneeKind?: "user" | "team" | null
  notePreview?: string | null
}

export type ContactActivityFeedItem = {
  /** Stable, unique key; also the cursor tie-breaker. */
  id: string
  type: ContactActivityFeedType
  occurredAt: Date
  actor: ContactActivityFeedActor | null
  details: ContactActivityFeedDetails
}

export type ContactActivityFeedPage = {
  items: ContactActivityFeedItem[]
  nextCursor: string | null
}

export type FeedCursor = { at: number; key: string }

export const TABLE_KEY_PREFIX = "a:"
const ID_PAD = 20

export const tableEventKey = (id: string): string =>
  `${TABLE_KEY_PREFIX}${id.padStart(ID_PAD, "0")}`

export function compareFeedItems(
  a: Pick<ContactActivityFeedItem, "id" | "occurredAt">,
  b: Pick<ContactActivityFeedItem, "id" | "occurredAt">,
): number {
  const byTime = b.occurredAt.getTime() - a.occurredAt.getTime()
  if (byTime !== 0) {
    return byTime
  }
  if (a.id === b.id) {
    return 0
  }
  return a.id < b.id ? 1 : -1
}

/** Whether the item comes strictly after the cursor in feed order. */
export function isAfterCursor(
  item: Pick<ContactActivityFeedItem, "id" | "occurredAt">,
  cursor: FeedCursor | null,
): boolean {
  if (!cursor) {
    return true
  }
  return (
    compareFeedItems(item, {
      id: cursor.key,
      occurredAt: new Date(cursor.at),
    }) > 0
  )
}

const PLUS = /\+/g
const SLASH = /\//g
const PADDING = /=+$/
const DASH = /-/g
const UNDERSCORE = /_/g
const LEADING_ZEROS = /^0+/
const WHITESPACE_RUN = /\s+/g

// Cursor JSON is ASCII only (a number and an ASCII key), so plain btoa/atob
// are safe here.
const toBase64Url = (value: string): string =>
  btoa(value).replace(PLUS, "-").replace(SLASH, "_").replace(PADDING, "")

const fromBase64Url = (value: string): string => {
  const base64 = value.replace(DASH, "+").replace(UNDERSCORE, "/")
  return atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4))
}

export function encodeFeedCursor(
  item: Pick<ContactActivityFeedItem, "id" | "occurredAt">,
): string {
  return toBase64Url(
    JSON.stringify({ at: item.occurredAt.getTime(), key: item.id }),
  )
}

/** Malformed cursors decode to `null` (first page) instead of throwing. */
export function decodeFeedCursor(
  value: string | null | undefined,
): FeedCursor | null {
  if (!value) {
    return null
  }
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as unknown
    if (
      parsed &&
      typeof parsed === "object" &&
      "at" in parsed &&
      "key" in parsed &&
      typeof parsed.at === "number" &&
      Number.isFinite(parsed.at) &&
      typeof parsed.key === "string" &&
      parsed.key.length > 0
    ) {
      return { at: parsed.at, key: parsed.key }
    }
  } catch {
    // fall through
  }
  return null
}

/** Translates a feed cursor into the table query's "strictly older" bound. */
export function cursorToTableBefore(
  cursor: FeedCursor | null,
): ContactActivityBefore | undefined {
  if (!cursor) {
    return
  }
  const createdAt = new Date(cursor.at)
  if (cursor.key.startsWith(TABLE_KEY_PREFIX)) {
    const id = cursor.key
      .slice(TABLE_KEY_PREFIX.length)
      .replace(LEADING_ZEROS, "")
    return { createdAt, id: id || "0" }
  }
  return { createdAt }
}

/**
 * One page of the merged feed. `table` must hold the table rows after the
 * cursor in feed order, fetched with `limit + 1` so a full page is detectable;
 * `derived` may hold every derived event (they are filtered here).
 */
export function mergeFeedPage(props: {
  derived: readonly ContactActivityFeedItem[]
  table: readonly ContactActivityFeedItem[]
  cursor: FeedCursor | null
  limit: number
}): ContactActivityFeedPage {
  const limit = Math.max(1, props.limit)
  const candidates = [...props.derived, ...props.table]
    .filter((item) => isAfterCursor(item, props.cursor))
    .sort(compareFeedItems)

  const seen = new Set<string>()
  const unique = candidates.filter((item) => {
    if (seen.has(item.id)) {
      return false
    }
    seen.add(item.id)
    return true
  })

  const items = unique.slice(0, limit)
  const last = items.at(-1)
  return {
    items,
    nextCursor: unique.length > limit && last ? encodeFeedCursor(last) : null,
  }
}

const VALUE_MAX_CHARS = 120

/** Human-readable custom field value for the feed (truncated). */
export function formatActivityValue(value: unknown): string | null {
  if (value === null || value === undefined || value === "") {
    return null
  }
  let text: string
  if (typeof value === "string") {
    text = value
  } else if (typeof value === "number" || typeof value === "boolean") {
    text = String(value)
  } else if (value instanceof Date) {
    text = value.toISOString()
  } else if (Array.isArray(value)) {
    text = value
      .map((entry) =>
        typeof entry === "string" ? entry : JSON.stringify(entry),
      )
      .join(", ")
  } else {
    text = JSON.stringify(value)
  }
  const chars = Array.from(text.replace(WHITESPACE_RUN, " ").trim())
  if (chars.length <= VALUE_MAX_CHARS) {
    return chars.join("")
  }
  return `${chars.slice(0, VALUE_MAX_CHARS - 1).join("")}…`
}

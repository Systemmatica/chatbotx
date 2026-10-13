/**
 * @mentions of workspace members inside free text (contact notes). A mention
 * is stored inline as `@[Display name](userId)`: the text stays readable as
 * plain text, survives edits without a side table, and the user id makes the
 * mention unambiguous for notifications. Client-safe (no Node built-ins).
 */

export type MentionSegment =
  | { type: "text"; text: string }
  | { type: "mention"; name: string; userId: string }

const MENTION_NAME_MAX_LENGTH = 100
/** Characters that would break the `@[name](id)` markup. */
const MENTION_NAME_UNSAFE = /[[\]()\r\n]/g
const WHITESPACE_RUN = /\s+/g
const MENTION_SOURCE = String.raw`@\[([^\][\r\n]{1,${MENTION_NAME_MAX_LENGTH}})\]\((\d{1,20})\)`
const QUERY_MAX_LENGTH = 30
const QUERY_STOP = /[\r\n@[\]()]/
const WORD_BOUNDARY_BEFORE = /\s/
const LEADING_SPACE = /^ /

const mentionPattern = () => new RegExp(MENTION_SOURCE, "g")

export function sanitizeMentionName(name: string): string {
  return name
    .replace(MENTION_NAME_UNSAFE, " ")
    .replace(WHITESPACE_RUN, " ")
    .trim()
    .slice(0, MENTION_NAME_MAX_LENGTH)
}

/** The stored markup for one mention. */
export function formatMention(name: string, userId: string): string {
  const safeName = sanitizeMentionName(name) || userId
  return `@[${safeName}](${userId})`
}

export function parseMentionSegments(text: string): MentionSegment[] {
  const segments: MentionSegment[] = []
  let lastIndex = 0
  for (const match of text.matchAll(mentionPattern())) {
    const index = match.index ?? 0
    if (index > lastIndex) {
      segments.push({ type: "text", text: text.slice(lastIndex, index) })
    }
    segments.push({
      type: "mention",
      name: match[1] ?? "",
      userId: match[2] ?? "",
    })
    lastIndex = index + match[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ type: "text", text: text.slice(lastIndex) })
  }
  return segments
}

/** Distinct mentioned user ids, in order of first appearance. */
export function extractMentionedUserIds(text: string): string[] {
  const ids = new Set<string>()
  for (const match of text.matchAll(mentionPattern())) {
    if (match[2]) {
      ids.add(match[2])
    }
  }
  return [...ids]
}

/** `@[Anna](42) hi` → `@Anna hi` — for previews, notifications, exports. */
export function mentionsToPlainText(text: string): string {
  return text.replace(mentionPattern(), (_match, name: string) => `@${name}`)
}

/**
 * The mention being typed at `caret`: an `@` at the start of the text or
 * after whitespace, followed by up to 30 characters without a line break.
 * Returns where the `@` is and what was typed after it, or `null`.
 */
export function findMentionQuery(
  text: string,
  caret: number,
): { start: number; query: string } | null {
  const end = Math.min(Math.max(caret, 0), text.length)
  const from = Math.max(0, end - QUERY_MAX_LENGTH - 1)
  for (let index = end - 1; index >= from; index--) {
    const char = text[index]
    if (char === "@") {
      const before = index > 0 ? (text[index - 1] ?? "") : ""
      if (before && !WORD_BOUNDARY_BEFORE.test(before)) {
        return null
      }
      const query = text.slice(index + 1, end)
      if (query.startsWith(" ")) {
        return null
      }
      return { start: index, query }
    }
    if (char !== undefined && QUERY_STOP.test(char)) {
      return null
    }
  }
  return null
}

/**
 * Replaces the typed `@query` (from `start` to `caret`) with the mention
 * markup plus a trailing space, and returns the new caret position.
 */
export function insertMention(props: {
  text: string
  start: number
  caret: number
  name: string
  userId: string
}): { text: string; caret: number } {
  const markup = `${formatMention(props.name, props.userId)} `
  const before = props.text.slice(0, props.start)
  const after = props.text.slice(props.caret).replace(LEADING_SPACE, "")
  return {
    text: `${before}${markup}${after}`,
    caret: before.length + markup.length,
  }
}

/** Users mentioned in `next` but not in `previous` (an edited note only notifies new mentions). */
export function newlyMentionedUserIds(
  previous: string | null | undefined,
  next: string,
): string[] {
  const before = new Set(extractMentionedUserIds(previous ?? ""))
  return extractMentionedUserIds(next).filter((userId) => !before.has(userId))
}

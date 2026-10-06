import type { StaffNotifierStore } from "./store"

/** How long a "Connect Telegram" deep link stays valid. */
export const STAFF_LINK_CODE_TTL_SECONDS = 15 * 60

/** 12 random bytes → 16 base64url chars, well inside Telegram's 64-char `start` limit. */
const LINK_CODE_BYTES = 12
const LINK_CODE_PATTERN = /^[A-Za-z0-9_-]{16}$/
const BASE64_PLUS = /\+/g
const BASE64_SLASH = /\//g
const BASE64_PADDING = /=+$/
const START_COMMAND = /^\/start(?:@\w+)?(?:\s+(\S+))?\s*$/

export type StaffLinkCodePayload = {
  workspaceMemberId: string
  workspaceId: string
  userId: string
}

export const staffLinkCodeKey = (code: string): string =>
  `staff-notifier:link:${code}`

const toBase64Url = (bytes: Uint8Array): string => {
  let binary = ""
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
    .replace(BASE64_PLUS, "-")
    .replace(BASE64_SLASH, "_")
    .replace(BASE64_PADDING, "")
}

export function generateStaffLinkCode(
  randomBytes: (size: number) => Uint8Array = (size) =>
    globalThis.crypto.getRandomValues(new Uint8Array(size)),
): string {
  return toBase64Url(randomBytes(LINK_CODE_BYTES))
}

export const isWellFormedStaffLinkCode = (code: string): boolean =>
  LINK_CODE_PATTERN.test(code)

/**
 * Issues a one-time code bound to one workspace membership. The binding lives
 * only in Redis with a TTL, so an unused code simply expires.
 */
export async function issueStaffLinkCode(
  store: StaffNotifierStore,
  payload: StaffLinkCodePayload,
  options: {
    now?: Date
    generate?: () => string
  } = {},
): Promise<{ code: string; expiresAt: Date }> {
  const now = options.now ?? new Date()
  const generate = options.generate ?? (() => generateStaffLinkCode())
  // A collision on 96 random bits is practically impossible; the NX loop
  // just guarantees a code can never be re-bound to someone else.
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = generate()
    const created = await store.setIfAbsent(
      staffLinkCodeKey(code),
      JSON.stringify(payload),
      STAFF_LINK_CODE_TTL_SECONDS,
    )
    if (created) {
      return {
        code,
        expiresAt: new Date(now.getTime() + STAFF_LINK_CODE_TTL_SECONDS * 1000),
      }
    }
  }
  throw new Error("Could not allocate a unique Telegram link code")
}

const isPayload = (value: unknown): value is StaffLinkCodePayload => {
  if (typeof value !== "object" || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.workspaceMemberId === "string" &&
    typeof record.workspaceId === "string" &&
    typeof record.userId === "string"
  )
}

/**
 * Redeems a code exactly once: the read and the delete are one atomic step,
 * so two concurrent `/start` calls cannot both succeed. Expired, unknown,
 * malformed or already-used codes all return `null`.
 */
export async function consumeStaffLinkCode(
  store: StaffNotifierStore,
  code: string,
): Promise<StaffLinkCodePayload | null> {
  if (!isWellFormedStaffLinkCode(code)) {
    return null
  }
  const raw = await store.take(staffLinkCodeKey(code))
  if (!raw) {
    return null
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    return isPayload(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** `/start <code>` → code; anything else → null. */
export function parseStartCommand(text: string | undefined): {
  isStart: boolean
  code: string | null
} {
  const match = START_COMMAND.exec(text?.trim() ?? "")
  if (!match) {
    return { isStart: false, code: null }
  }
  return { isStart: true, code: match[1] ?? null }
}

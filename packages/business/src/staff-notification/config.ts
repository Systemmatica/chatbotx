/**
 * Platform-level Telegram bot that notifies workspace staff (not the
 * workspace's customer-facing bot). Configured by env only; when the token is
 * unset the whole feature is inert: no UI entry point, no jobs enqueued.
 *
 * - `NOTIFY_TELEGRAM_BOT_TOKEN` — token from @BotFather (required to enable).
 * - `NOTIFY_TELEGRAM_BOT_USERNAME` — optional; fetched via `getMe` and cached
 *   in memory when absent.
 */

export const STAFF_NOTIFIER_WEBHOOK_PATH = "/api/staff-notifier/telegram"

export const getStaffNotifierBotToken = (): string | null => {
  const token = process.env.NOTIFY_TELEGRAM_BOT_TOKEN?.trim()
  return token ? token : null
}

const LEADING_AT = /^@/

export const getStaffNotifierBotUsernameFromEnv = (): string | null => {
  const username = process.env.NOTIFY_TELEGRAM_BOT_USERNAME?.trim().replace(
    LEADING_AT,
    "",
  )
  return username ? username : null
}

export const isStaffNotifierConfigured = (): boolean =>
  getStaffNotifierBotToken() !== null

const toHex = (buffer: ArrayBuffer): string =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("")

/**
 * Secret Telegram echoes in `X-Telegram-Bot-Api-Secret-Token` on every
 * webhook call. Derived from the bot token (anyone holding the token already
 * controls the bot), so there is no extra env var to keep in sync. Hex keeps
 * it inside Telegram's allowed alphabet (A-Z, a-z, 0-9, _ and -).
 *
 * Web Crypto on purpose: this module is reachable from the business barrel,
 * which must stay free of Node built-ins (edge-safe import graph).
 */
export async function deriveStaffNotifierWebhookSecret(
  botToken: string,
): Promise<string> {
  const data = new TextEncoder().encode(`staff-notifier-webhook:${botToken}`)
  const digest = await globalThis.crypto.subtle.digest("SHA-256", data)
  return toHex(digest)
}

/** Constant-time string comparison (length leak only). */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false
  }
  // Visit every character regardless of where the first mismatch is.
  let mismatches = 0
  for (let index = 0; index < a.length; index++) {
    mismatches += a.charCodeAt(index) === b.charCodeAt(index) ? 0 : 1
  }
  return mismatches === 0
}

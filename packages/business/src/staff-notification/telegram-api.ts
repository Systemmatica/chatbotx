const TELEGRAM_API_BASE = "https://api.telegram.org"
const REQUEST_TIMEOUT_MS = 15_000
const CHAT_GONE_DESCRIPTION = /chat not found|user not found/i

type TelegramResponse<T> =
  | { ok: true; result: T }
  | {
      ok: false
      error_code?: number
      description?: string
      parameters?: { retry_after?: number }
    }

/**
 * A Telegram Bot API call that came back `ok: false` (or a non-JSON HTTP
 * failure). `errorCode` mirrors Telegram's `error_code` (HTTP-like status).
 */
export class StaffNotifierTelegramError extends Error {
  readonly errorCode: number
  readonly retryAfterSeconds: number | null

  constructor(props: {
    method: string
    errorCode: number
    description: string
    retryAfterSeconds?: number | null
  }) {
    super(
      `Telegram ${props.method} failed (${props.errorCode}): ${props.description}`,
    )
    this.name = "StaffNotifierTelegramError"
    this.errorCode = props.errorCode
    this.retryAfterSeconds = props.retryAfterSeconds ?? null
  }

  /**
   * The chat can never receive messages again until the member links anew:
   * they blocked the bot (403), deleted the chat, or the id is wrong (400
   * "chat not found").
   */
  get isChatUnreachable(): boolean {
    if (this.errorCode === 403) {
      return true
    }
    return this.errorCode === 400 && CHAT_GONE_DESCRIPTION.test(this.message)
  }

  get isRateLimited(): boolean {
    return this.errorCode === 429
  }
}

export async function callTelegramBotApi<T>(
  botToken: string,
  method: string,
  payload: Record<string, unknown> = {},
  fetchImpl: typeof fetch = fetch,
): Promise<T> {
  const response = await fetchImpl(
    `${TELEGRAM_API_BASE}/bot${botToken}/${method}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    },
  )

  let body: TelegramResponse<T> | null = null
  try {
    body = (await response.json()) as TelegramResponse<T>
  } catch {
    body = null
  }

  if (body?.ok) {
    return body.result
  }

  throw new StaffNotifierTelegramError({
    method,
    errorCode: body?.error_code ?? response.status,
    description: body?.description ?? response.statusText,
    retryAfterSeconds: body?.parameters?.retry_after ?? null,
  })
}

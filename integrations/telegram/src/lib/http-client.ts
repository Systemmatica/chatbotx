import ky, { isHTTPError, type KyInstance } from "ky"
import { parseOriginError, TelegramAPIException } from "../exception"
import { logger } from "./logger"

const BOT_TOKEN_IN_URL_RE = /\/bot[^/\s]+\//g

/** Strips the bot token from any Bot API / file URL before it is logged. */
export const redactTelegramToken = (value: string): string =>
  value.replace(BOT_TOKEN_IN_URL_RE, "/bot<redacted>/")

type GetOptions = {
  searchParams?: Record<string, string>
}

type PostOptions = {
  json?: unknown
}

class TelegramHttpClient {
  private readonly client: KyInstance

  constructor(botToken: string) {
    this.client = ky.create({
      baseUrl: `https://api.telegram.org/bot${botToken}/`,
      timeout: 30_000,
      retry: {
        limit: 3,
        methods: ["get", "post"],
        statusCodes: [408, 413, 429, 500, 502, 503, 504],
        backoffLimit: 1000,
      },
      hooks: {
        beforeError: [
          ({ error, request }) => {
            // ky's error message embeds the request URL, which carries the
            // bot token — redact it before anything downstream logs it.
            error.message = redactTelegramToken(error.message)
            if (isHTTPError(error)) {
              logger.error(
                {
                  url: redactTelegramToken(request.url),
                  method: request.method,
                },
                `HTTP ${error.response.status}: ${error.response.statusText}`,
              )
            }
            return error
          },
        ],
      },
    })
  }

  private toException(error: unknown): TelegramAPIException {
    const sdkException = parseOriginError(error)

    return new TelegramAPIException(
      sdkException.message ?? "Telegram API call failed",
      sdkException.httpStatusCode,
      sdkException.code,
      sdkException.subCode,
      sdkException.type,
      error,
    )
  }

  private async request<T>(call: () => Promise<T>): Promise<T> {
    try {
      return await call()
    } catch (error) {
      // Timeouts/network errors bypass `beforeError` but still carry the URL.
      if (error instanceof Error) {
        error.message = redactTelegramToken(error.message)
      }
      throw this.toException(error)
    }
  }

  get<T>(endpoint: string, options?: GetOptions): Promise<T> {
    return this.request(() => this.client.get(endpoint, options).json<T>())
  }

  post<T>(endpoint: string, options?: PostOptions): Promise<T> {
    return this.request(() => this.client.post(endpoint, options).json<T>())
  }
}

export const createTelegramClient = (botToken: string): TelegramHttpClient =>
  new TelegramHttpClient(botToken)

import { staffNotificationService } from "@chatbotx.io/business"
import { getChildLogger } from "@chatbotx.io/logger"
import { NextResponse } from "next/server"

const log = getChildLogger("staff-notifier-webhook")

/**
 * Webhook of the platform staff-notifier Telegram bot (public: `/api` is in
 * `proxy.ts` publicRoutes). Telegram proves the call is genuine with the
 * `X-Telegram-Bot-Api-Secret-Token` header set at `setWebhook` time.
 *
 * Always answers 200 for authenticated calls, even on internal errors, so
 * Telegram does not redeliver a `/start` whose one-time code may already be
 * spent. The reply to the user is returned as a webhook-response method.
 */
export async function POST(request: Request) {
  if (!staffNotificationService.isConfigured()) {
    return new NextResponse(null, { status: 404 })
  }
  const secret = request.headers.get("x-telegram-bot-api-secret-token")
  if (!(await staffNotificationService.isValidWebhookSecret(secret))) {
    return new NextResponse(null, { status: 401 })
  }

  let update: unknown
  try {
    update = await request.json()
  } catch {
    return NextResponse.json({ ok: true })
  }

  try {
    const reply = await staffNotificationService.handleTelegramUpdate(update)
    return NextResponse.json(reply ?? { ok: true })
  } catch (err) {
    log.error({ err }, "Failed to handle staff notifier update")
    return NextResponse.json({ ok: true })
  }
}

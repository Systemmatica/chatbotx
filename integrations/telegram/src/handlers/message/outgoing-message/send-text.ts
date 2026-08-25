import {
  richTextToTelegramHtml,
  type SendTextStepSchema,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import { MAX_INLINE_BUTTONS_PER_ROW } from "../../../constants"
import type {
  TelegramAuthValue,
  TelegramSendMessageRequest,
} from "../../../schema"
import {
  buildCanonicalInlineButton,
  buildInlineButton,
  buildInlineKeyboardFromButtons,
} from "./send-button"

export function* convertFlowStepText(
  props: Parameters<
    MessageHandlers<TelegramAuthValue, SendTextStepSchema>["sendFlowStep"]
  >[0],
): Generator<TelegramSendMessageRequest> {
  const {
    data: { step, contact },
  } = props
  const buttons = [
    ...step.buttons.map((button) =>
      buildInlineButton({ flowId: props.data.flowId, button }),
    ),
    ...(props.data.quickReplies ?? []).map(buildCanonicalInlineButton),
  ]

  // Telegram supports exactly this codepath's HTML subset for
  // `parse_mode: "HTML"` — only set it once the step actually carries rich
  // markup ("v2"); legacy/plain steps ("v1"/absent) send exactly as before,
  // with no parse_mode, so a literal "<" or "&" typed by the author is never
  // reinterpreted.
  const text = richTextToTelegramHtml(step.text, step.version)
  const parse_mode = step.version === "v2" ? ("HTML" as const) : undefined

  if (buttons.length === 0) {
    yield { chat_id: contact.sourceId, text, parse_mode }
    return
  }

  const keyboard = buildInlineKeyboardFromButtons(
    buttons,
    MAX_INLINE_BUTTONS_PER_ROW,
  )

  yield {
    chat_id: contact.sourceId,
    text,
    parse_mode,
    reply_markup: keyboard,
  }
}

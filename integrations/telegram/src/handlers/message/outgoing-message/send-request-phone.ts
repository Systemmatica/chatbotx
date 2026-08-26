import type {
  RemoveReplyKeyboardStepSchema,
  RequestPhoneStepSchema,
} from "@chatbotx.io/flow-config"
import type { MessageHandlers } from "@chatbotx.io/sdk"
import type {
  TelegramAuthValue,
  TelegramReplyKeyboardMarkup,
  TelegramReplyKeyboardRemove,
  TelegramSendMessageRequest,
} from "../../../schema"

/**
 * Telegram's native "share your phone number" affordance: a reply keyboard
 * (NOT an inline keyboard — see `TelegramReplyKeyboardMarkup`'s doc) with a
 * single button carrying `request_contact: true`. Tapping it makes the
 * client send its own `contact` back to the bot; the client only offers the
 * user's own number here, so there is no "wrong contact" concern on this
 * path itself (a user can still forward an arbitrary contact card
 * afterwards — see incoming-message.ts's `ownContact` check, which is the
 * real safety net).
 *
 * `resize_keyboard: true` shrinks the keyboard to fit exactly this one
 * button instead of Telegram's default full-size layout; `one_time_keyboard:
 * true` hides it again after one tap (still explicitly removed by a
 * subsequent `removeReplyKeyboard` step so it does not linger if the user
 * ignores the prompt and keeps typing instead).
 */
export function buildRequestContactKeyboard(
  buttonLabel: string,
): TelegramReplyKeyboardMarkup {
  return {
    keyboard: [[{ text: buttonLabel, request_contact: true }]],
    resize_keyboard: true,
    one_time_keyboard: true,
  }
}

export function* convertFlowStepRequestPhone(
  props: Parameters<
    MessageHandlers<TelegramAuthValue, RequestPhoneStepSchema>["sendFlowStep"]
  >[0],
): Generator<TelegramSendMessageRequest> {
  const {
    data: { step, contact },
  } = props

  yield {
    chat_id: contact.sourceId,
    text: step.message,
    reply_markup: buildRequestContactKeyboard(step.buttonLabel),
  }
}

const REPLY_KEYBOARD_REMOVE: TelegramReplyKeyboardRemove = {
  remove_keyboard: true,
}

/**
 * Telegram requires non-empty `text` on every `sendMessage` call, so a
 * blank/absent `message` falls back to a single space — the keyboard-removal
 * request still needs something to attach to, and a lone space renders as
 * (effectively) nothing in the chat.
 */
export function* convertFlowStepRemoveReplyKeyboard(
  props: Parameters<
    MessageHandlers<
      TelegramAuthValue,
      RemoveReplyKeyboardStepSchema
    >["sendFlowStep"]
  >[0],
): Generator<TelegramSendMessageRequest> {
  const {
    data: { step, contact },
  } = props

  yield {
    chat_id: contact.sourceId,
    text: step.message?.trim() || " ",
    reply_markup: REPLY_KEYBOARD_REMOVE,
  }
}

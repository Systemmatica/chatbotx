import type { ConversationAttributes } from "@chatbotx.io/database/partials"
import type { ConversationModel } from "@chatbotx.io/database/types"

type IncomingRoutingDecision =
  | { type: "none" }
  | {
      type: "challenge"
      conversation: ConversationModel
      challenge: NonNullable<ConversationAttributes["challenge"]>
    }
  | {
      type: "automatedResponse"
      conversation: ConversationModel
      // A bot command (e.g. "/start") arrived while a challenge was pending:
      // the caller clears the challenge so the command restarts the bot
      // instead of being stored as the answer.
      clearsChallenge?: boolean
    }
  // The contact sent actionable input but a human handles the conversation
  // (bot disabled): no bot reacts, staff may need to be told.
  | { type: "humanMode"; conversation: ConversationModel }

// Telegram-style bot command: "/start", "/help@my_bot", "/start payload".
const BOT_COMMAND_RE = /^\/[A-Za-z0-9_]{1,32}(@[A-Za-z0-9_]+)?(\s|$)/

export const isBotCommand = (text: string | null | undefined): boolean =>
  typeof text === "string" && BOT_COMMAND_RE.test(text.trim())

export async function resolveIncomingTextRouting(props: {
  conversation: ConversationModel
  // A pending challenge (e.g. Get User Data) accepts any actionable reply —
  // text, an uploaded attachment, or a shared location.
  hasActionableInput: boolean
  // Automated (AI) responses stay text-driven only.
  hasText: boolean
  // The message text, used to let bot commands override a pending challenge.
  text?: string | null
  isConversationActive: (conversation: ConversationModel) => Promise<boolean>
}): Promise<IncomingRoutingDecision> {
  if (!props.hasActionableInput) {
    return { type: "none" }
  }

  const conversation = props.conversation
  if (!(await props.isConversationActive(conversation))) {
    return { type: "humanMode", conversation }
  }

  const challenge = (
    conversation.additionalAttributes as ConversationAttributes | undefined
  )?.challenge
  if (challenge) {
    if (props.hasText && isBotCommand(props.text)) {
      return { type: "automatedResponse", conversation, clearsChallenge: true }
    }
    return { type: "challenge", conversation, challenge }
  }

  if (!props.hasText) {
    return { type: "none" }
  }

  return { type: "automatedResponse", conversation }
}

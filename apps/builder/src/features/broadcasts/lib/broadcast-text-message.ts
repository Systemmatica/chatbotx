import {
  type BroadcastSubaction,
  broadcastSubactions,
  type ChannelType,
  channelTypes,
} from "@chatbotx.io/database/partials"
import {
  BUTTON_LABEL_MAX,
  getVisibleTextLength,
  refineSendTextRichText,
  type SendTextStepVersionSchema,
  sendTextStepVersions,
  TIKTOK_CARD_TITLE_MAX,
} from "@chatbotx.io/flow-config"
import { zodUrlWithVariables } from "@chatbotx.io/utils"
import { z } from "zod"

export const BROADCAST_TEXT_MAX_BUTTONS = 3

const strictBroadcastTextMessageSchema = z
  .object({
    text: z.string().trim().min(1, "Text is required"),
    version: sendTextStepVersions.optional(),
    buttons: z
      .array(
        z.object({
          label: z.string().trim().min(1).max(BUTTON_LABEL_MAX),
          url: zodUrlWithVariables(),
        }),
      )
      .max(BROADCAST_TEXT_MAX_BUTTONS),
  })
  .superRefine(refineSendTextRichText)

type BroadcastTextMessageDraft = {
  text: string
  version?: SendTextStepVersionSchema
  buttons: { label: string; url: string }[]
}

/**
 * Template subactions must start with an approved template (the audience may
 * be outside the 24h window), so a free-form text is only offered for the
 * regular subactions.
 */
export function supportsBroadcastTextMessage(
  subaction: BroadcastSubaction | null | undefined,
): boolean {
  return (
    !!subaction &&
    subaction !== broadcastSubactions.enum.whatsappTemplateMessage &&
    subaction !== broadcastSubactions.enum.messengerTemplateMessage
  )
}

/**
 * Strict "Text" broadcast rules — the same limits the flow builder enforces
 * on a `sendText` step (non-empty, valid rich text, ≤ `SEND_TEXT_MAX`
 * visible chars, button label ≤ `BUTTON_LABEL_MAX`, URL or `{{variable}}`
 * link, TikTok card-title limit once buttons are attached).
 */
export function validateBroadcastTextMessage(
  message: BroadcastTextMessageDraft | undefined,
  channel: ChannelType,
  ctx: z.RefinementCtx,
  path: (string | number)[],
): void {
  const version = message?.version ?? sendTextStepVersions.enum.v2
  const text = message?.text ?? ""
  const buttons = message?.buttons ?? []

  if (getVisibleTextLength(text, version) === 0) {
    ctx.addIssue({
      code: "custom",
      message: "Text is required",
      path: [...path, "text"],
    })
    return
  }

  const parsed = strictBroadcastTextMessageSchema.safeParse({
    text,
    version,
    buttons,
  })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({
        code: "custom",
        message: issue.message,
        path: [...path, ...issue.path.map((segment) => segment as string)],
      })
    }
    return
  }

  if (
    channel === channelTypes.enum.tiktok &&
    buttons.length > 0 &&
    getVisibleTextLength(text, version) > TIKTOK_CARD_TITLE_MAX
  ) {
    ctx.addIssue({
      code: "custom",
      message: `TikTok messages with buttons must be at most ${TIKTOK_CARD_TITLE_MAX} characters`,
      path: [...path, "text"],
    })
  }
}

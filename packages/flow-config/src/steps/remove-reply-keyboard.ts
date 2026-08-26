import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { stepTypes } from "./step-action"

/**
 * Channel-agnostic "hide/remove the native reply keyboard shown by a
 * previous `requestPhone` step" (Telegram's `ReplyKeyboardRemove`). `message`
 * is optional: Telegram's `sendMessage` requires non-empty text on every
 * call, so an empty/blank `message` falls back to a single space so the
 * keyboard-removal request still has something to attach to; channels with
 * no reply-keyboard concept no-op this step entirely (documented at each
 * channel's `sendFlowStep` switch).
 */
export const removeReplyKeyboardStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.removeReplyKeyboard),
  message: z.string().trim().max(1000).optional(),
})

export type RemoveReplyKeyboardStepSchema = z.infer<
  typeof removeReplyKeyboardStepSchema
>

export const removeReplyKeyboardStepDefaultFn = (
  props: Partial<RemoveReplyKeyboardStepSchema> = {},
): RemoveReplyKeyboardStepSchema => ({
  message: "",
  ...props,
  id: createId(),
  stepType: stepTypes.enum.removeReplyKeyboard,
})

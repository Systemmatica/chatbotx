import { createId } from "@chatbotx.io/utils"
import { z } from "zod"
import { baseStepSchema } from "./base"
import { stepTypes } from "./step-action"

export const REQUEST_PHONE_BUTTON_LABEL_MAX = 20

/**
 * Channel-agnostic "ask for the contact's phone number via the channel's own
 * native contact-sharing UI" step (mirrors `getButtonLabel` for Telegram's
 * `KeyboardButton.request_contact`). Every channel receives the same config
 * shape — only Telegram currently has a matching native reply-keyboard
 * mechanism (see `PHONE_REQUEST_NATIVE_CHANNELS` in
 * `integrations/telegram/src/handlers/message/outgoing-message/send-request-phone.ts`);
 * every other channel's outgoing converter falls back to a plain text prompt
 * built from `message` (documented at each channel's `sendFlowStep` switch),
 * never throws, and never drops the step silently.
 *
 * This step only *asks*; it does not pause the flow. Pairing it with a
 * `getUserData` step configured with `ReplyFormat.phoneContact` right after
 * it gives both the native tap-to-share affordance (this step) and the
 * wait-for-reply/validate/advance behavior (`getUserData`).
 */
export const requestPhoneStepSchema = baseStepSchema.extend({
  stepType: z.literal(stepTypes.enum.requestPhone),
  message: z.string().trim().min(1).max(1000),
  buttonLabel: z.string().trim().min(1).max(REQUEST_PHONE_BUTTON_LABEL_MAX),
})

export type RequestPhoneStepSchema = z.infer<typeof requestPhoneStepSchema>

export const requestPhoneStepDefaultFn = (
  props: Partial<RequestPhoneStepSchema> = {},
): RequestPhoneStepSchema => ({
  message: "",
  buttonLabel: "Share phone number",
  ...props,
  id: createId(),
  stepType: stepTypes.enum.requestPhone,
})

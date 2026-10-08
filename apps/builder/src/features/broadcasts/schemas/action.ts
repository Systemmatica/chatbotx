import {
  broadcastScheduleTypes,
  broadcastSubactions,
  channelTypes,
} from "@chatbotx.io/database/partials"
import {
  messengerTemplateParamsSchema,
  sendTextStepVersions,
  validateWaTemplateSendParams,
  type WaTemplateParams,
  waTemplateParamsSchema,
} from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { contactFilterRequest } from "@/features/contact-filter/schemas"
import {
  BROADCAST_TEXT_MAX_BUTTONS,
  supportsBroadcastTextMessage,
  validateBroadcastTextMessage,
} from "../lib/broadcast-text-message"

/**
 * What a non-template broadcast sends: an existing flow ("flow") or a message
 * typed right in the form ("text") that the server wraps into a service flow.
 */
export const broadcastContentTypes = z.enum(["flow", "text"])
export type BroadcastContentType = z.infer<typeof broadcastContentTypes>

/**
 * Deliberately loose: the form keeps the draft while the user toggles
 * between "Text" and "Flow", so the strict rules (required text, rich-text
 * limit, button label/url) are applied in `createBroadcastRequest`'s
 * `superRefine` only when `contentType === "text"`.
 */
export const broadcastTextMessageSchema = z.object({
  text: z.string(),
  version: sendTextStepVersions.optional(),
  buttons: z
    .array(
      z.object({
        label: z.string(),
        url: z.string(),
      }),
    )
    .max(BROADCAST_TEXT_MAX_BUTTONS),
})
export type BroadcastTextMessageInput = z.infer<
  typeof broadcastTextMessageSchema
>

export const createBroadcastRequest = z
  .object({
    channel: channelTypes,
    flowId: zodBigintAsString().optional(),
    templateId: zodBigintAsString().optional(),
    integrationWhatsappId: zodBigintAsString().optional(),
    integrationMessengerId: zodBigintAsString().optional(),
    templateData: z
      .union([waTemplateParamsSchema, messengerTemplateParamsSchema])
      .optional(),
    buttons: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          flowId: z.string().optional(),
        }),
      )
      .optional(),
    subaction: broadcastSubactions,
    schedulesType: broadcastScheduleTypes,
    schedulesAt: z
      .string()
      .refine(
        (value) => {
          const date = new Date(value)
          const currentDate = new Date()

          return !Number.isNaN(date.getTime()) && date > currentDate
        },
        {
          message: "Schedules must be after now.",
        },
      )
      .nullable(),
    contactFilter: contactFilterRequest.shape.contactFilter,
    contentType: broadcastContentTypes.optional(),
    textMessage: broadcastTextMessageSchema.optional(),
  })
  .refine(
    (data) =>
      data.contentType === broadcastContentTypes.enum.text ||
      !!(data.flowId || data.templateId),
    {
      message: "Either flow or template must be selected",
      path: ["flowId"],
    },
  )
  .superRefine((data, ctx) => {
    if (data.contentType !== broadcastContentTypes.enum.text) {
      return
    }
    if (!supportsBroadcastTextMessage(data.subaction)) {
      ctx.addIssue({
        code: "custom",
        message: "Text broadcasts are not supported for this subaction",
        path: ["contentType"],
      })
      return
    }
    validateBroadcastTextMessage(data.textMessage, data.channel, ctx, [
      "textMessage",
    ])
  })
  // Send-blocking WhatsApp template rules (MPM sections, LTO expiration):
  // the flow editor enforces them at publish, this refinement covers the
  // broadcast surface with the same shared rule set.
  .superRefine((data, ctx) => {
    if (data.channel === channelTypes.enum.whatsapp && data.templateData) {
      validateWaTemplateSendParams(data.templateData as WaTemplateParams, ctx, [
        "templateData",
      ])
    }
  })
export type CreateBroadcastRequest = z.infer<typeof createBroadcastRequest>

export const updateBroadcastSchema = z.object({
  name: z.string().trim().min(1).max(255),
})
export type UpdateBroadcastSchema = z.infer<typeof updateBroadcastSchema>

import { createId, zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { stepTypes } from "./step-action"

export const NOTIFY_AGENT_TEXT_MAX_LENGTH = 1000

/**
 * "Notify staff": sends `text` (with {{variables}} resolved for the contact)
 * to workspace members who linked the staff Telegram notifier. Fire and
 * forget — the flow continues whether or not anyone is linked.
 */
export const notifyAgentStepSchema = z.object({
  id: zodBigintAsString(),
  stepType: z.literal(stepTypes.enum.notifyAgent),
  text: z.string().trim().min(1).max(NOTIFY_AGENT_TEXT_MAX_LENGTH),
})

export type NotifyAgentStepSchema = z.infer<typeof notifyAgentStepSchema>

export const notifyAgentStepDefaultFn = (
  props?: Partial<NotifyAgentStepSchema>,
): NotifyAgentStepSchema => ({
  id: createId(),
  stepType: stepTypes.enum.notifyAgent,
  text: "",
  ...props,
})

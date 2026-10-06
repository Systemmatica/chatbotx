import { staffNotificationService } from "@chatbotx.io/business"
import type { NotifyAgentStepSchema } from "@chatbotx.io/flow-config"
import { contactVariableService } from "@chatbotx.io/variables"
import type { ExecuteStepProps } from "./flow"

/**
 * "Notify staff" step: resolves {{variables}} like sendText/setCustomField do
 * and enqueues a staff notification job. Telegram is never called here (the
 * default worker delivers), and nothing in this step can fail the flow: the
 * producer swallows and logs its own errors, and an unconfigured notifier is
 * a no-op.
 */
export async function notifyAgent({
  conversation,
  contactInbox,
  step,
}: ExecuteStepProps<NotifyAgentStepSchema>): Promise<void> {
  if (!staffNotificationService.isConfigured()) {
    return
  }
  const variables = await contactVariableService.getAll({
    contactId: conversation.contactId,
    contactInbox,
    conversation,
  })
  const text = await contactVariableService.replaceAll({
    text: step.text ?? "",
    variables,
  })
  await staffNotificationService.notifyStepReached({
    workspaceId: conversation.workspaceId,
    conversationId: conversation.id,
    contactInboxId: contactInbox.id,
    text,
  })
}

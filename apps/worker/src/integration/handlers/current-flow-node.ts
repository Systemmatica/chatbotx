import { contactInboxService } from "@chatbotx.io/business/contact-inbox"
import type {
  ContactInboxModel,
  ConversationModel,
} from "@chatbotx.io/database/types"
import { logger } from "../../lib/logger"

/**
 * Remembers which flow node the bot just entered for this contact inbox, so
 * the builder can show "current step" and how long the contact has been on
 * it. Best-effort by contract: any failure is logged and swallowed — losing
 * this bookkeeping must never fail or retry the flow step itself.
 *
 * Awaited by the caller (not fire-and-forget) on purpose: the next node is
 * enqueued only after the current one finishes, so awaiting keeps the writes
 * in node order. A detached promise from node A could land after node B's.
 */
export async function recordCurrentFlowNode(props: {
  conversation: Pick<ConversationModel, "workspaceId" | "contactId">
  contactInbox: Pick<ContactInboxModel, "id"> &
    Partial<
      Pick<
        ContactInboxModel,
        "currentFlowId" | "currentNodeId" | "currentNodeAt"
      >
    >
  flowId: string
  nodeId: string
}): Promise<void> {
  const { conversation, contactInbox, flowId, nodeId } = props
  try {
    await contactInboxService.recordCurrentFlowNode({
      contactInboxId: contactInbox.id,
      contactId: conversation.contactId,
      workspaceId: conversation.workspaceId,
      flowId,
      nodeId,
      previous: contactInbox,
    })
  } catch (error) {
    logger.error(
      {
        err: error,
        contactInboxId: contactInbox.id,
        flowId,
        nodeId,
      },
      "Failed to record current flow node; continuing the flow",
    )
  }
}

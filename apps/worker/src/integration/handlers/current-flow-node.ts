import { contactActivityService } from "@chatbotx.io/business"
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
  /** The entered node is the flow's start node. */
  isStartNode?: boolean
}): Promise<void> {
  const { conversation, contactInbox, flowId, nodeId } = props
  try {
    const recorded = await contactInboxService.recordCurrentFlowNode({
      contactInboxId: contactInbox.id,
      contactId: conversation.contactId,
      workspaceId: conversation.workspaceId,
      flowId,
      nodeId,
      previous: contactInbox,
    })
    // "Flow started" for the contact history: the start node was entered, or
    // the contact moved into another flow. Riding on the throttled write
    // above keeps loop bursts (same node re-entered) from logging repeats.
    if (
      recorded &&
      (props.isStartNode || contactInbox.currentFlowId !== flowId)
    ) {
      await contactActivityService.record({
        workspaceId: conversation.workspaceId,
        contactId: conversation.contactId,
        type: "flowStarted",
        actor: { type: "bot" },
        payload: { flowId, nodeId },
      })
    }
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

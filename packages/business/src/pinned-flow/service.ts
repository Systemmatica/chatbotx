import { and, count, db, eq } from "@chatbotx.io/database/client"
import { flowModel, pinnedFlowModel } from "@chatbotx.io/database/schema"
import { ChatbotXException, notFoundException } from "../errors"
import {
  canPinMoreFlows,
  MAX_PINNED_FLOWS,
  orderPinnedFlows,
  type PinnedFlowEntry,
} from "./ordering"

export const pinnedFlowLimitException = () =>
  new ChatbotXException(
    `You can pin up to ${MAX_PINNED_FLOWS} flows`,
    "pinnedFlowLimitReached",
    409,
  )

/** Personal flow pins (sidebar quick links), scoped to user + workspace. */
class PinnedFlowService {
  async list(input: {
    userId: string
    workspaceId: string
  }): Promise<PinnedFlowEntry[]> {
    const rows = await db
      .select({
        flowId: pinnedFlowModel.flowId,
        name: flowModel.name,
        pinnedAt: pinnedFlowModel.createdAt,
      })
      .from(pinnedFlowModel)
      // Joining on the workspace too keeps a pin from ever exposing a flow of
      // another workspace, whatever was written in the row.
      .innerJoin(
        flowModel,
        and(
          eq(flowModel.id, pinnedFlowModel.flowId),
          eq(flowModel.workspaceId, pinnedFlowModel.workspaceId),
        ),
      )
      .where(
        and(
          eq(pinnedFlowModel.userId, input.userId),
          eq(pinnedFlowModel.workspaceId, input.workspaceId),
        ),
      )
      .orderBy(pinnedFlowModel.createdAt)
      .limit(MAX_PINNED_FLOWS)

    return orderPinnedFlows(rows)
  }

  /** Idempotent: pinning an already pinned flow is a no-op. */
  async pin(input: {
    userId: string
    workspaceId: string
    flowId: string
  }): Promise<void> {
    const { userId, workspaceId, flowId } = input

    const flow = await db.query.flowModel.findFirst({
      where: { id: flowId, workspaceId },
      columns: { id: true },
    })
    if (!flow) {
      throw notFoundException("Flow not found")
    }

    const [existing] = await db
      .select({ value: count() })
      .from(pinnedFlowModel)
      .where(
        and(
          eq(pinnedFlowModel.userId, userId),
          eq(pinnedFlowModel.workspaceId, workspaceId),
        ),
      )
    const alreadyPinned = await db.query.pinnedFlowModel.findFirst({
      where: { userId, workspaceId, flowId },
      columns: { id: true },
    })
    if (alreadyPinned) {
      return
    }
    if (!canPinMoreFlows(existing?.value ?? 0)) {
      throw pinnedFlowLimitException()
    }

    await db
      .insert(pinnedFlowModel)
      .values({ userId, workspaceId, flowId })
      .onConflictDoNothing({
        target: [
          pinnedFlowModel.userId,
          pinnedFlowModel.workspaceId,
          pinnedFlowModel.flowId,
        ],
      })
  }

  /** Idempotent: unpinning a flow that is not pinned is a no-op. */
  async unpin(input: {
    userId: string
    workspaceId: string
    flowId: string
  }): Promise<void> {
    await db
      .delete(pinnedFlowModel)
      .where(
        and(
          eq(pinnedFlowModel.userId, input.userId),
          eq(pinnedFlowModel.workspaceId, input.workspaceId),
          eq(pinnedFlowModel.flowId, input.flowId),
        ),
      )
  }
}

export const pinnedFlowService = new PinnedFlowService()

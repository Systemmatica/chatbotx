"use server"

import { db, inArray } from "@chatbotx.io/database/client"
import {
  flowAnalyticsSessionModel,
  flowModel,
} from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteFlowAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(bulkUpdateIdsRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: BulkUpdateIdsRequest
    }) => {
      await deleteFlows(workspaceId, parsedInput.ids)
    },
  )

/**
 * Deletes the given flows of a workspace and retires their analytics
 * sessions. Ids outside the workspace are ignored. Returns the deleted ids.
 */
export const deleteFlows = async (
  workspaceId: string,
  ids: string[],
): Promise<string[]> => {
  const deletedFlows = await db.query.flowModel.findMany({
    where: {
      workspaceId,
      id: {
        in: ids,
      },
    },
  })
  if (deletedFlows.length === 0) {
    return []
  }

  const deletedFlowIds = deletedFlows.map((flow) => flow.id)

  await db.transaction(async (tx) => {
    await tx.delete(flowModel).where(inArray(flowModel.id, deletedFlowIds))

    await tx
      .update(flowAnalyticsSessionModel)
      .set({
        deletedAt: new Date(),
      })
      .where(inArray(flowAnalyticsSessionModel.flowId, deletedFlowIds))
  })

  return deletedFlowIds
}

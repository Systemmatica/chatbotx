"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { triggerModel } from "@chatbotx.io/database/schema"
import { removeTriggerCache } from "@chatbotx.io/events"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteTriggersAction = workspaceActionClient
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
      await deleteTriggers(workspaceId, parsedInput.ids)
    },
  )

/** Deletes triggers of a workspace; returns the ids actually deleted. */
export const deleteTriggers = async (
  workspaceId: string,
  ids: string[],
): Promise<string[]> => {
  const deleted = await db
    .delete(triggerModel)
    .where(
      and(
        eq(triggerModel.workspaceId, workspaceId),
        inArray(triggerModel.id, ids),
      ),
    )
    .returning({ id: triggerModel.id })

  await removeTriggerCache(workspaceId)

  return deleted.map((row) => row.id)
}

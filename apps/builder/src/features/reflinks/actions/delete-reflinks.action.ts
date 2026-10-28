"use server"

import { and, db, eq, inArray } from "@chatbotx.io/database/client"
import { reflinkModel } from "@chatbotx.io/database/schema"
import {
  type BulkUpdateIdsRequest,
  bulkUpdateIdsRequest,
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"

export const deleteReflinksAction = workspaceActionClient
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
      await deleteReflinks(workspaceId, parsedInput.ids)
    },
  )

/** Deletes ref links of a workspace; returns the ids actually deleted. */
export const deleteReflinks = async (
  workspaceId: string,
  ids: string[],
): Promise<string[]> => {
  const deleted = await db
    .delete(reflinkModel)
    .where(
      and(
        eq(reflinkModel.workspaceId, workspaceId),
        eq(reflinkModel.type, "refLink"),
        inArray(reflinkModel.id, ids),
      ),
    )
    .returning({ id: reflinkModel.id })

  return deleted.map((row) => row.id)
}

import { workspaceTokenAuthAPI } from "@/orpc"
import { listWorkspaceInboxTeams } from "../queries"
import { listInboxTeamsResponse } from "../schema/action"

export const inboxTeamsWorkspaceTokenAPIs = {
  listTeamsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/teams",
      summary: "List teams",
      tags: ["Teams"],
    })
    .output(listInboxTeamsResponse)
    .handler(
      async ({ context }) =>
        await listWorkspaceInboxTeams({ workspaceId: context.workspace.id }),
    ),
}

export default inboxTeamsWorkspaceTokenAPIs

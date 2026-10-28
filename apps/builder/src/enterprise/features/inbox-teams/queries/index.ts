import { inboxTeamService } from "@chatbotx.io/business"
import { assertCurrentUserCanAccessChatbot } from "@/lib/auth/utils"
import type {
  ListInboxTeamsRequest,
  ListInboxTeamsResponse,
} from "../schema/action"

export async function listInboxTeams(
  input: ListInboxTeamsRequest,
): Promise<ListInboxTeamsResponse> {
  await assertCurrentUserCanAccessChatbot(input.workspaceId)

  return await listWorkspaceInboxTeams(input)
}

/**
 * Lists inbox teams without the session check — for callers that authorized the
 * workspace another way (workspace token).
 */
export async function listWorkspaceInboxTeams(
  input: ListInboxTeamsRequest,
): Promise<ListInboxTeamsResponse> {
  const data = await inboxTeamService.listByWorkspace({
    workspaceId: input.workspaceId,
  })

  return { data }
}

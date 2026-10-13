import { pinnedFlowService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { ORPCError } from "@orpc/server"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"

const tags = ["Flows"]

const pinFlowRequest = withWorkspaceIdSchema.extend({
  flowId: zodBigintAsString(),
})

const pinnedFlowsResponse = z.object({
  data: z.array(
    z.object({
      flowId: z.string(),
      name: z.string(),
      pinnedAt: z.date(),
    }),
  ),
})

/** Returns the member's user id, or null without the `flows` permission. */
const resolveFlowsMember = async (workspaceId: string) => {
  const member = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!member) {
    throw new ORPCError("UNAUTHORIZED")
  }
  return hasWorkspacePermission(
    member.targetWorkspaceMember.permissions,
    "flows",
  )
    ? member.user.id
    : null
}

const requireFlowsMember = async (workspaceId: string) => {
  const userId = await resolveFlowsMember(workspaceId)
  if (!userId) {
    throw new ChatbotXException(
      "User is not authorized to manage flows",
      "forbidden",
      403,
    )
  }
  return userId
}

export const pinnedFlowsAPI = {
  listPinnedFlowsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/pinned-flows",
      summary: "List the current member's pinned flows",
      tags,
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(pinnedFlowsResponse)
    .handler(async ({ input }) => {
      // The sidebar asks for every member; without flow access there is
      // simply nothing pinned to show.
      const userId = await resolveFlowsMember(input.workspaceId)
      if (!userId) {
        return { data: [] }
      }
      const data = await pinnedFlowService.list({
        userId,
        workspaceId: input.workspaceId,
      })
      return { data }
    }),

  pinFlowAPI: authorizedAPI
    .route({
      method: "PUT",
      path: "/workspaces/{workspaceId}/flows/{flowId}/pin",
      summary: "Pin a flow to the current member's sidebar",
      tags,
    })
    .input(pinFlowRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const userId = await requireFlowsMember(input.workspaceId)
      await pinnedFlowService.pin({
        userId,
        workspaceId: input.workspaceId,
        flowId: input.flowId,
      })
    }),

  unpinFlowAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/flows/{flowId}/pin",
      summary: "Unpin a flow from the current member's sidebar",
      tags,
    })
    .input(pinFlowRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const userId = await requireFlowsMember(input.workspaceId)
      await pinnedFlowService.unpin({
        userId,
        workspaceId: input.workspaceId,
        flowId: input.flowId,
      })
    }),
}

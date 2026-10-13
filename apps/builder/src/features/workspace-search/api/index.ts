import { workspaceSearchService } from "@chatbotx.io/business"
import { ORPCError } from "@orpc/server"
import {
  canViewContactEmailAndPhone,
  getAssignedContactsUserId,
} from "@/features/contacts/permissions"
import {
  hasContactsAccess,
  hasWorkspacePermission,
} from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import { searchWorkspaceRequest, searchWorkspaceResponse } from "../schemas"

export const workspaceSearchAPI = {
  searchWorkspaceAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/search",
      summary:
        "Quick search across contacts, flows, flow steps and lead magnets",
      tags: ["Search"],
    })
    .input(searchWorkspaceRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(searchWorkspaceResponse)
    .handler(async ({ input }) => {
      const member = await getCurrentUserAndTargetWorkspace(input.workspaceId)
      if (!member) {
        throw new ORPCError("UNAUTHORIZED")
      }

      // Each group follows the same permission as its section in the sidebar;
      // contacts additionally keep the assigned-only and phone visibility rules
      // of the contacts list.
      const { permissions } = member.targetWorkspaceMember
      const contactsAccess = hasContactsAccess(permissions)

      return await workspaceSearchService.search({
        workspaceId: input.workspaceId,
        query: input.query,
        scope: {
          contacts: contactsAccess
            ? {
                includePhone: canViewContactEmailAndPhone(permissions),
                restrictToAssignedUserId: getAssignedContactsUserId({
                  permissions,
                  userId: member.user.id,
                }),
              }
            : null,
          flows: hasWorkspacePermission(permissions, "flows"),
          leadMagnets: contactsAccess,
        },
      })
    }),
}

import { leadMagnetService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  createLeadMagnetRequest,
  leadMagnetIdRequest,
  listLeadMagnetsRequest,
  updateLeadMagnetRequest,
} from "../schemas/request"
import {
  leadMagnetResource,
  listLeadMagnetsResponse,
} from "../schemas/resource"

const tags = ["LeadMagnets"]

/**
 * Lead magnets are shared by the whole workspace (and create tags), so members
 * limited to their assigned contacts can see them but not manage them.
 */
const requireLeadMagnetManagement = async (workspaceId: string) => {
  const scope = await requireContactPermissionScope(workspaceId)
  if (scope.restrictToAssignedUserId) {
    throw new ChatbotXException(
      "User is not authorized to manage lead magnets",
      "forbidden",
      403,
    )
  }
}

export const leadMagnetsAuthenticatedAPI = {
  listLeadMagnetsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/lead-magnets",
      summary: "List lead magnets with recipient counts",
      tags,
    })
    .input(listLeadMagnetsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listLeadMagnetsResponse)
    .handler(async ({ input }) => {
      const accessScope = await requireContactPermissionScope(input.workspaceId)
      const data = await leadMagnetService.list({
        workspaceId: input.workspaceId,
        accessScope,
      })
      return { data }
    }),

  createLeadMagnetAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/lead-magnets",
      summary: "Create a lead magnet and its tag",
      tags,
    })
    .input(createLeadMagnetRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(leadMagnetResource)
    .handler(async ({ input }) => {
      await requireLeadMagnetManagement(input.workspaceId)
      return await leadMagnetService.create(input)
    }),

  updateLeadMagnetAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: "/workspaces/{workspaceId}/lead-magnets/{leadMagnetId}",
      summary: "Update a lead magnet",
      tags,
    })
    .input(updateLeadMagnetRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(leadMagnetResource)
    .handler(async ({ input }) => {
      const { workspaceId, leadMagnetId, ...data } = input
      await requireLeadMagnetManagement(workspaceId)
      return await leadMagnetService.update({
        workspaceId,
        id: leadMagnetId,
        ...data,
      })
    }),

  deleteLeadMagnetAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/lead-magnets/{leadMagnetId}",
      summary: "Delete a lead magnet (its tag is kept)",
      tags,
    })
    .input(leadMagnetIdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      await requireLeadMagnetManagement(input.workspaceId)
      await leadMagnetService.delete({
        workspaceId: input.workspaceId,
        id: input.leadMagnetId,
      })
    }),
}

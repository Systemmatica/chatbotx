import { contactViewService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
import { generateWhere } from "@/features/contacts/queries/list-contacts.queries"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  contactViewIdRequest,
  countContactGroupsRequest,
  createContactViewRequest,
  duplicateContactViewRequest,
  reorderContactViewsRequest,
  updateContactViewRequest,
} from "../schemas/request"
import {
  contactViewResource,
  countContactGroupsResponse,
  listContactViewsResponse,
} from "../schemas/resource"

const tags = ["Contact views"]

/**
 * Views are shared by the whole workspace, so members limited to their
 * assigned contacts can use them but not create or change them.
 */
const requireViewManagement = async (workspaceId: string) => {
  const scope = await requireContactPermissionScope(workspaceId)
  if (scope.restrictToAssignedUserId) {
    throw new ChatbotXException(
      "User is not authorized to manage contact views",
      "forbidden",
      403,
    )
  }
}

export const contactViewsAuthenticatedAPI = {
  listContactViewsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contact-views",
      summary: "List saved contact views",
      tags,
    })
    .input(withWorkspaceIdSchema)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listContactViewsResponse)
    .handler(async ({ input }) => {
      await requireContactPermissionScope(input.workspaceId)
      const data = await contactViewService.list(input)
      return { data }
    }),

  createContactViewAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/contact-views",
      summary: "Save a contact view",
      tags,
    })
    .input(createContactViewRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(contactViewResource)
    .handler(async ({ input, context }) => {
      await requireViewManagement(input.workspaceId)
      return await contactViewService.create({
        ...input,
        createdById: context.user?.id ?? null,
      })
    }),

  updateContactViewAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: "/workspaces/{workspaceId}/contact-views/{viewId}",
      summary: "Rename a contact view or replace its settings",
      tags,
    })
    .input(updateContactViewRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(contactViewResource)
    .handler(async ({ input }) => {
      const { workspaceId, viewId, ...data } = input
      await requireViewManagement(workspaceId)
      return await contactViewService.update({
        workspaceId,
        id: viewId,
        ...data,
      })
    }),

  duplicateContactViewAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/contact-views/{viewId}/duplicate",
      summary: "Duplicate a contact view",
      tags,
    })
    .input(duplicateContactViewRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(contactViewResource)
    .handler(async ({ input, context }) => {
      await requireViewManagement(input.workspaceId)
      return await contactViewService.duplicate({
        workspaceId: input.workspaceId,
        id: input.viewId,
        name: input.name,
        createdById: context.user?.id ?? null,
      })
    }),

  deleteContactViewAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/contact-views/{viewId}",
      summary: "Delete a contact view",
      tags,
    })
    .input(contactViewIdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      await requireViewManagement(input.workspaceId)
      await contactViewService.delete({
        workspaceId: input.workspaceId,
        id: input.viewId,
      })
    }),

  reorderContactViewsAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/contact-views/reorder",
      summary: "Reorder contact view tabs",
      tags,
    })
    .input(reorderContactViewsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listContactViewsResponse)
    .handler(async ({ input }) => {
      await requireViewManagement(input.workspaceId)
      const data = await contactViewService.reorder(input)
      return { data }
    }),

  countContactGroupsAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/contact-groups/count",
      summary: "Count filtered contacts per group",
      tags,
    })
    .input(countContactGroupsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(countContactGroupsResponse)
    .handler(async ({ input }) => {
      const { groupBy, ...listInput } = input
      const scope = await requireContactPermissionScope(input.workspaceId)
      // Same scoping and filter as the list (incl. assigned-only members).
      const where = generateWhere(listInput, scope)
      const data = await contactViewService.countGroups({
        workspaceId: input.workspaceId,
        where,
        groupBy,
      })
      return { data }
    }),
}

import { contactActivityService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { resolveContactPermissionScope } from "@/features/contacts/permissions"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  CONTACT_ACTIVITY_PAGE_SIZE,
  listContactActivityRequest,
  listContactActivityResponse,
} from "../schemas"

export const contactActivityAPI = {
  listContactActivityAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/contacts/{contactId}/activity",
      summary: "List a contact's activity history (newest first)",
      tags: ["Contacts"],
    })
    .input(listContactActivityRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listContactActivityResponse)
    .handler(async ({ input }) => {
      // Same gate as the contact card: contacts section access, and members
      // limited to assigned conversations only see those contacts.
      const scope = await resolveContactPermissionScope(input.workspaceId)
      if (!scope) {
        throw notFoundException("Contact not found")
      }
      const page = await contactActivityService.listFeed({
        workspaceId: input.workspaceId,
        contactId: input.contactId,
        accessScope: {
          restrictToAssignedUserId: scope.restrictToAssignedUserId,
        },
        cursor: input.cursor,
        limit: input.limit ?? CONTACT_ACTIVITY_PAGE_SIZE,
      })
      return { data: page.items, nextCursor: page.nextCursor }
    }),
}

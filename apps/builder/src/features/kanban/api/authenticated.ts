import { kanbanBoardService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
import { workspaceAuthorizedMidddleware } from "@/middlewares/auth"
import { authorizedAPI } from "@/orpc"
import {
  createKanbanBoardRequest,
  getKanbanBoardCardsRequest,
  kanbanBoardIdRequest,
  listKanbanBoardsRequest,
  moveKanbanCardRequest,
  updateKanbanBoardRequest,
} from "../schemas/request"
import {
  getKanbanBoardCardsResponse,
  kanbanBoardResource,
  listKanbanBoardsResponse,
} from "../schemas/resource"

const tags = ["Kanban"]

/**
 * Board structure is shared by the whole workspace, so members limited to
 * their assigned contacts can use boards but not create or reshape them.
 */
const requireBoardManagement = async (workspaceId: string) => {
  const scope = await requireContactPermissionScope(workspaceId)
  if (scope.restrictToAssignedUserId) {
    throw new ChatbotXException(
      "User is not authorized to manage Kanban boards",
      "forbidden",
      403,
    )
  }
}

export const kanbanAuthenticatedAPI = {
  listKanbanBoardsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/kanban-boards",
      summary: "List Kanban boards",
      tags,
    })
    .input(listKanbanBoardsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(listKanbanBoardsResponse)
    .handler(async ({ input }) => {
      await requireContactPermissionScope(input.workspaceId)
      const data = await kanbanBoardService.list({
        workspaceId: input.workspaceId,
        flowId: input.flowId,
      })
      return { data }
    }),

  createKanbanBoardAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/kanban-boards",
      summary: "Create a Kanban board",
      tags,
    })
    .input(createKanbanBoardRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(kanbanBoardResource)
    .handler(async ({ input }) => {
      await requireBoardManagement(input.workspaceId)
      return await kanbanBoardService.create(input)
    }),

  updateKanbanBoardAPI: authorizedAPI
    .route({
      method: "PATCH",
      path: "/workspaces/{workspaceId}/kanban-boards/{boardId}",
      summary: "Update a Kanban board",
      tags,
    })
    .input(updateKanbanBoardRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(kanbanBoardResource)
    .handler(async ({ input }) => {
      const { workspaceId, boardId, ...data } = input
      await requireBoardManagement(workspaceId)
      return await kanbanBoardService.update({
        workspaceId,
        id: boardId,
        ...data,
      })
    }),

  deleteKanbanBoardAPI: authorizedAPI
    .route({
      method: "DELETE",
      path: "/workspaces/{workspaceId}/kanban-boards/{boardId}",
      summary: "Delete a Kanban board",
      tags,
    })
    .input(kanbanBoardIdRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      await requireBoardManagement(input.workspaceId)
      await kanbanBoardService.delete({
        workspaceId: input.workspaceId,
        id: input.boardId,
      })
    }),

  getKanbanBoardCardsAPI: authorizedAPI
    .route({
      method: "GET",
      path: "/workspaces/{workspaceId}/kanban-boards/{boardId}/cards",
      summary: "List Kanban board cards grouped by stage",
      tags,
    })
    .input(getKanbanBoardCardsRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .output(getKanbanBoardCardsResponse)
    .handler(async ({ input }) => {
      const { workspaceId, boardId, ...filters } = input
      const accessScope = await requireContactPermissionScope(workspaceId)
      return await kanbanBoardService.getCards({
        workspaceId,
        boardId,
        ...filters,
        accessScope,
      })
    }),

  moveKanbanCardAPI: authorizedAPI
    .route({
      method: "POST",
      path: "/workspaces/{workspaceId}/kanban-boards/{boardId}/move",
      summary: "Move a contact to a Kanban stage",
      tags,
    })
    .input(moveKanbanCardRequest)
    .use(workspaceAuthorizedMidddleware, (input) => input.workspaceId)
    .handler(async ({ input }) => {
      const { workspaceId, boardId, contactId, stageId } = input
      const accessScope = await requireContactPermissionScope(workspaceId)
      await kanbanBoardService.moveCard({
        workspaceId,
        boardId,
        contactId,
        stageId,
        accessScope,
      })
    }),
}

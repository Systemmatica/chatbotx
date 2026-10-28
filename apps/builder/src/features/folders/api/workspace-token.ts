import { folderService } from "@chatbotx.io/business"
import { folderTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createFolderSchema, editFolderSchema } from "../schema/action"
import { folderResource, listFoldersResponse } from "../schema/resource"

const folderIdInput = z.object({ id: zodBigintAsString() })

const listFoldersWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/folders",
    summary:
      'List folders of a type. Omit parentId for all folders, pass "0" for root-level folders only',
    tags: ["Folders"],
  })
  .input(
    z.object({
      folderType: folderTypes,
      parentId: zodBigintAsString().nullish(),
    }),
  )
  .output(listFoldersResponse)
  .errors(possibleErrorsOnListingResource)
  .handler(async ({ context, input }) => ({
    data: await folderService.list({
      workspaceId: context.workspace.id,
      folderType: input.folderType,
      parentId: input.parentId,
    }),
  }))

const createFolderWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "POST",
    path: "/v1/folders",
    summary: "Create a folder",
    successStatus: 201,
    tags: ["Folders"],
  })
  .input(
    createFolderSchema.extend({
      parentId: createFolderSchema.shape.parentId.optional().default(null),
    }),
  )
  .output(folderResource)
  .errors(possibleErrorsOnCreatingResource)
  .handler(async ({ context, input }) => {
    const workspaceId = context.workspace.id
    // `folderService.create` looks the parent up by id only, so scope it to
    // this workspace and folder type before nesting under it.
    if (input.parentId) {
      await folderService.ensureExists({
        id: input.parentId,
        workspaceId,
        folderType: input.folderType,
      })
    }

    return await folderService.create({ workspaceId, data: input })
  })

const updateFolderWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "PATCH",
    path: "/v1/folders/{id}",
    summary: "Rename a folder",
    tags: ["Folders"],
  })
  .input(editFolderSchema.extend(folderIdInput.shape))
  .output(folderResource)
  .errors(possibleErrorsOnUpdatingResource)
  .handler(async ({ context, input }) => {
    const { id, ...data } = input
    return await folderService.update({
      workspaceId: context.workspace.id,
      id,
      data,
    })
  })

const deleteFolderWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "DELETE",
    path: "/v1/folders/{id}",
    summary: "Delete a folder and its subfolders",
    successStatus: 204,
    tags: ["Folders"],
  })
  .input(folderIdInput)
  .errors(possibleErrorsOnDeletingResource)
  .handler(async ({ context, input }) => {
    const workspaceId = context.workspace.id
    await folderService.findOrFail({ id: input.id, workspaceId })
    await folderService.bulkDelete({ workspaceId, ids: [input.id] })
  })

const moveToFolderWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "POST",
    path: "/v1/folders/move",
    summary:
      "Move resources of a folder type into a folder (null moves them to the root)",
    tags: ["Folders"],
  })
  .input(
    z.object({
      folderType: folderTypes,
      ids: z.array(zodBigintAsString()).min(1).max(100),
      folderId: zodBigintAsString().nullable(),
    }),
  )
  .errors(possibleErrorsOnUpdatingResource)
  .handler(async ({ context, input }) => {
    await folderService.changeFolder({
      workspaceId: context.workspace.id,
      folderType: input.folderType,
      modelIds: input.ids,
      newFolderId: input.folderId ?? "",
    })
  })

export const foldersWorkspaceTokenAPIs = {
  listFoldersWorkspaceTokenAPI,
  createFolderWorkspaceTokenAPI,
  updateFolderWorkspaceTokenAPI,
  deleteFolderWorkspaceTokenAPI,
  moveToFolderWorkspaceTokenAPI,
}

export default foldersWorkspaceTokenAPIs

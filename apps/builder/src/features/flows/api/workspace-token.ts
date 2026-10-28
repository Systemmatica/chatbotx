import {
  flowAnalyticsService,
  flowNodeStatsResponse,
} from "@chatbotx.io/analytics"
import {
  flowService,
  flowVersionService,
  folderService,
} from "@chatbotx.io/business"
import {
  ChatbotXException,
  notFoundException,
} from "@chatbotx.io/business/errors"
import { folderTypes } from "@chatbotx.io/database/partials"
import { edgeSchema } from "@chatbotx.io/flow-config"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import { flowVersionResource } from "@/features/flow-versions/schema/resource"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createFlow } from "../actions/create-flow-action"
import { deleteFlows } from "../actions/delete-flow.action"
import { publishFlow } from "../actions/publish-flow-action"
import { updateDraftFlowVersion } from "../actions/update-draft-flow-version-action"
import { updateFlow } from "../actions/update-flow-action"
import { buildFlowExport } from "../lib/flow-export"
import { importFlowFromExport } from "../lib/flow-import"
import { listFlows } from "../queries"
import {
  createFlowSchema,
  type PublishFlowSchema,
  updateFlowSchema,
} from "../schemas/action"
import { flowResource } from "../schemas/resource"

const flowIdInput = z.object({ id: zodBigintAsString() })

const publicFlowDetail = flowResource.and(
  z.object({
    draftVersion: flowVersionResource.nullable(),
    publishedVersion: flowVersionResource.nullable(),
  }),
)

// Kept loose on purpose: the importer validates the envelope itself and
// returns a precise reason (e.g. an unsupported formatVersion), which a strict
// input schema here would replace with a generic request error.
const flowExportBody = z
  .record(z.string(), z.unknown())
  .describe(
    "Flow export JSON as produced by GET /v1/flows/{id}/export (formatVersion 2)",
  )

const flowGraphBody = z.object({
  nodes: z.array(z.any()),
  edges: z.array(edgeSchema),
})

const findFlowOrFail = async (workspaceId: string, id: string) => {
  const flow = await flowService.findBy({ workspaceId, id })
  if (!flow) {
    throw notFoundException("Flow not found")
  }
  return flow
}

const getFlowDetail = async (workspaceId: string, id: string) => {
  const flow = await findFlowOrFail(workspaceId, id)
  const [draftVersion, publishedVersion] = await Promise.all([
    flowVersionService.findDraft({ flowId: flow.id, workspaceId }),
    flowVersionService.findPublished({ flowId: flow.id, workspaceId }),
  ])

  return {
    ...flow,
    draftVersion: draftVersion ?? null,
    publishedVersion: publishedVersion ?? null,
  }
}

const flowWorkspaceTokenAPIs = {
  listFlowsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/flows",
      summary: "Get all flows",
      tags: ["Flows"],
    })
    .input(z.object({}))
    .output(
      z.object({
        data: z.array(flowResource.pick({ id: true, name: true })),
      }),
    )
    .handler(
      async ({ context, input }) =>
        await listFlows({
          ...input,
          workspaceId: context.workspace.id,
          active: true,
        }),
    ),

  getFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/flows/{id}",
      summary: "Get a flow with its draft and published version content",
      tags: ["Flows"],
    })
    .input(flowIdInput)
    .output(publicFlowDetail)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await getFlowDetail(context.workspace.id, input.id),
    ),

  createFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows",
      summary: "Create an empty flow",
      successStatus: 201,
      tags: ["Flows"],
    })
    .input(
      createFlowSchema.extend({
        folderId: createFlowSchema.shape.folderId.optional().default(null),
      }),
    )
    .output(z.object({ id: z.string() }))
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await createFlow(context.workspace.id, input),
    ),

  updateFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/flows/{id}",
      summary: "Rename, activate or deactivate a flow",
      tags: ["Flows"],
    })
    .input(updateFlowSchema.extend(flowIdInput.shape))
    .output(flowResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      await updateFlow({ workspaceId: context.workspace.id, id }, rest)
      return await findFlowOrFail(context.workspace.id, id)
    }),

  deleteFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/flows/{id}",
      summary: "Delete a flow",
      successStatus: 204,
      tags: ["Flows"],
    })
    .input(flowIdInput)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const deletedIds = await deleteFlows(context.workspace.id, [input.id])
      if (deletedIds.length === 0) {
        throw notFoundException("Flow not found")
      }
    }),

  exportFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/flows/{id}/export",
      summary: "Export the published version of a flow (formatVersion 2)",
      tags: ["Flows"],
    })
    .input(flowIdInput)
    .output(flowExportBody)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const result = await buildFlowExport({
        workspaceId: context.workspace.id,
        flowId: input.id,
      })
      if (result.status === "notFound") {
        throw notFoundException("Flow not found")
      }
      if (result.status === "notPublished") {
        throw new ChatbotXException(
          "Flow has no published version to export",
          "notPublished",
          409,
        )
      }
      return result.envelope
    }),

  importFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows/import",
      summary: "Create a flow from a flow export JSON",
      successStatus: 201,
      tags: ["Flows"],
    })
    .input(
      z.object({
        data: flowExportBody,
        folderId: zodBigintAsString().nullish(),
      }),
    )
    .output(
      z.object({
        flowId: z.string(),
        warnings: z.array(
          z.object({
            entityKind: z.string(),
            path: z.string(),
            value: z.string(),
          }),
        ),
      }),
    )
    .errors(possibleErrorsOnCreatingResource)
    .handler(async ({ context, input }) => {
      if (input.folderId) {
        await folderService.ensureExists({
          id: input.folderId,
          workspaceId: context.workspace.id,
          folderType: folderTypes.enum.flow,
        })
      }

      return await importFlowFromExport({
        workspaceId: context.workspace.id,
        data: input.data,
        folderId: input.folderId,
      })
    }),

  updateFlowDraftWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/flows/{id}/draft",
      summary: "Replace the draft content (nodes and edges) of a flow",
      tags: ["Flows"],
    })
    .input(flowGraphBody.extend(flowIdInput.shape))
    .output(flowVersionResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const flow = await findFlowOrFail(workspaceId, input.id)
      const draft = await flowVersionService.findDraft({
        flowId: flow.id,
        workspaceId,
      })
      if (!draft) {
        throw notFoundException("Draft flow version not found")
      }

      await updateDraftFlowVersion(
        { workspaceId, id: draft.id },
        { nodes: input.nodes, edges: input.edges },
      )

      return {
        ...draft,
        nodes: input.nodes,
        edges: input.edges,
      }
    }),

  publishFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/flows/{id}/publish",
      summary:
        "Publish a flow: the stored draft, or the nodes and edges given in the body",
      tags: ["Flows"],
    })
    .input(flowGraphBody.partial().extend(flowIdInput.shape))
    .output(publicFlowDetail)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const flow = await findFlowOrFail(workspaceId, input.id)

      let graph = { nodes: input.nodes, edges: input.edges }
      if (!(graph.nodes && graph.edges)) {
        const draft = await flowVersionService.findDraft({
          flowId: flow.id,
          workspaceId,
        })
        if (!draft) {
          throw notFoundException("Draft flow version not found")
        }
        graph = {
          nodes: graph.nodes ?? draft.nodes,
          edges: graph.edges ?? (draft.edges as PublishFlowSchema["edges"]),
        }
      }

      // The graph is only typed loosely here: `publishFlow` validates it with
      // `publishFlowSchema`, and an invalid graph surfaces as a 422 through
      // the workspace-token error mapping.
      await publishFlow(
        { workspaceId, id: flow.id },
        graph as PublishFlowSchema,
      )

      return await getFlowDetail(workspaceId, flow.id)
    }),

  moveFlowWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/flows/{id}/folder",
      summary: "Move a flow to a folder (null moves it to the root)",
      tags: ["Flows"],
    })
    .input(flowIdInput.extend({ folderId: zodBigintAsString().nullable() }))
    .output(flowResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      await findFlowOrFail(workspaceId, input.id)
      await folderService.changeFolder({
        workspaceId,
        folderType: folderTypes.enum.flow,
        modelIds: [input.id],
        newFolderId: input.folderId ?? "",
      })
      return await findFlowOrFail(workspaceId, input.id)
    }),

  getFlowStatsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/flows/{id}/stats",
      summary:
        "Get per-node analytics of a flow (sent, delivered, clicked, failed)",
      tags: ["Flows", "Analytics"],
    })
    .input(flowIdInput)
    .output(flowNodeStatsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const flow = await findFlowOrFail(context.workspace.id, input.id)
      return await flowAnalyticsService.getFlowStats({
        workspaceId: context.workspace.id,
        flowId: flow.id,
      })
    }),
}

export default flowWorkspaceTokenAPIs

"use server"

import { customFieldService, flowService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { type FlowExport, parseFlowExport } from "@chatbotx.io/flow-config"
import { getTranslations } from "next-intl/server"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateFlowsFromTemplateSchema,
  createFlowsFromTemplateSchema,
} from "../schemas/action"
import {
  buildFunnelCommonFlow,
  buildFunnelEntryFlows,
  resolveFunnelTemplateTexts,
} from "../templates/funnel-template"

/** Re-validates a built template exactly like an uploaded export file. */
const toImportInput = (
  built: FlowExport,
  workspaceId: string,
  folderId: string | null,
) => {
  const parsed = parseFlowExport(built)
  if (!parsed.ok) {
    throw new ChatbotXException(
      `Flow template is invalid: ${parsed.reason}`,
      "flowTemplateInvalid",
    )
  }
  const [flow] = parsed.data.flows
  return {
    workspaceId,
    folderId,
    name: flow.name,
    active: flow.active,
    enableInInbox: flow.enableInInbox,
    startNodeId: flow.startNodeId,
    nodes: flow.nodes,
    edges: flow.edges,
    customFields: parsed.data.customFields,
  }
}

/**
 * Creates every flow of a built-in template as drafts, in one transaction.
 * The common flow is imported first so the entry flows can point their
 * "start flow" block at its freshly minted id.
 */
export const createFlowsFromTemplateAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createFlowsFromTemplateSchema)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateFlowsFromTemplateSchema
    }) => {
      const t = await getTranslations("flowTemplates.funnel")
      const texts = resolveFunnelTemplateTexts((key) => t(key))
      const folderId = parsedInput.folderId ?? null

      const result = await flowService.importFlowExports(async (importOne) => {
        const common = await importOne(
          toImportInput(buildFunnelCommonFlow(texts), workspaceId, folderId),
        )
        const createdCustomFieldIds = [...common.createdCustomFieldIds]
        const flowIds = [common.flowId]
        for (const entry of buildFunnelEntryFlows(texts, common.flowId)) {
          const imported = await importOne(
            toImportInput(entry, workspaceId, folderId),
          )
          flowIds.push(imported.flowId)
          createdCustomFieldIds.push(...imported.createdCustomFieldIds)
        }
        return { commonFlowId: common.flowId, flowIds, createdCustomFieldIds }
      })

      if (result.createdCustomFieldIds.length > 0) {
        await customFieldService.invalidate({ workspaceId })
      }

      return { flowId: result.commonFlowId, flowIds: result.flowIds }
    },
  )

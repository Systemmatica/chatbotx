import { customFieldService, flowService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import {
  collectFlowReferenceWarnings,
  type FlowReferenceWarning,
  parseFlowExport,
} from "@chatbotx.io/flow-config"

export type ImportFlowFromExportResult = {
  flowId: string
  warnings: FlowReferenceWarning[]
}

/**
 * Synchronous counterpart of the worker's flow-import handler for callers
 * that already hold the export JSON (the public API). Runs the same parse →
 * `flowService.importFlowExport` → custom-field cache invalidation sequence,
 * so custom-field resolution, id remapping and folder scoping behave exactly
 * like a file import from the UI.
 */
export const importFlowFromExport = async (input: {
  workspaceId: string
  data: unknown
  folderId?: string | null
}): Promise<ImportFlowFromExportResult> => {
  const parsed = parseFlowExport(input.data)
  if (!parsed.ok) {
    throw new ChatbotXException(parsed.reason, "flowImportSchemaMismatch", 422)
  }

  const exportedFlow = parsed.data.flows[0]
  const result = await flowService.importFlowExport({
    workspaceId: input.workspaceId,
    name: exportedFlow.name,
    active: exportedFlow.active,
    enableInInbox: exportedFlow.enableInInbox,
    startNodeId: exportedFlow.startNodeId,
    nodes: exportedFlow.nodes,
    edges: exportedFlow.edges,
    customFields: parsed.data.customFields,
    folderId: input.folderId,
  })

  if (result.createdCustomFieldIds.length > 0) {
    await customFieldService.invalidate({ workspaceId: input.workspaceId })
  }

  // Custom-field references with a manifest entry are always resolved by the
  // import, so only the remaining (unmapped) references are reported — the
  // same filter the worker applies.
  const manifestIds = new Set(Object.keys(parsed.data.customFields))
  const warnings = collectFlowReferenceWarnings(exportedFlow).filter(
    (warning) =>
      !(warning.entityKind === "customField" && manifestIds.has(warning.value)),
  )

  return { flowId: result.flowId, warnings }
}

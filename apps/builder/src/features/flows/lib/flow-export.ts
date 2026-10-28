import {
  customFieldService,
  flowService,
  flowVersionService,
} from "@chatbotx.io/business"
import {
  collectCustomFieldReferences,
  FLOW_EXPORT_FORMAT_VERSION,
  type FlowExport,
  type FlowExportCustomField,
  flowExportSchema,
} from "@chatbotx.io/flow-config"

export type BuildFlowExportResult =
  | { status: "notFound" }
  | { status: "notPublished" }
  | { status: "ok"; envelope: FlowExport; fileName: string }

export const toFlowExportFileName = (name: string): string => {
  const slug =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "flow"
  return `${slug}.chatbotx-flow.json`
}

/**
 * Builds the flow export envelope (format version 2) from the published
 * version of a flow. Shared by the download route and the public API so both
 * emit exactly what the importer accepts.
 */
export const buildFlowExport = async (input: {
  workspaceId: string
  flowId: string
}): Promise<BuildFlowExportResult> => {
  const flow = await flowService.findBy({
    workspaceId: input.workspaceId,
    id: input.flowId,
  })
  if (!flow) {
    return { status: "notFound" }
  }

  const publishedVersion = await flowVersionService.findPublished({
    flowId: flow.id,
    workspaceId: flow.workspaceId,
  })
  if (!publishedVersion) {
    return { status: "notPublished" }
  }

  const customFieldIds = collectCustomFieldReferences({
    nodes: publishedVersion.nodes,
    edges: publishedVersion.edges,
  })
  const customFieldRows = await customFieldService.findManyByIds({
    workspaceId: flow.workspaceId,
    ids: customFieldIds,
  })
  const customFields = Object.fromEntries(
    customFieldRows.map((row): [string, FlowExportCustomField] => [
      row.id,
      { name: row.name, type: row.type },
    ]),
  )

  const envelope = {
    formatVersion: FLOW_EXPORT_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    source: { workspaceId: flow.workspaceId, flowId: flow.id },
    flows: [
      {
        name: flow.name,
        active: flow.active,
        enableInInbox: flow.enableInInbox,
        startNodeId: publishedVersion.startNodeId,
        nodes: publishedVersion.nodes,
        edges: publishedVersion.edges,
      },
    ],
    customFields,
  }

  // Guards against export ever emitting a payload the importer would reject —
  // the envelope is hand-built above and not otherwise validated.
  flowExportSchema.parse(envelope)

  return {
    status: "ok",
    envelope: envelope as FlowExport,
    fileName: toFlowExportFileName(flow.name),
  }
}

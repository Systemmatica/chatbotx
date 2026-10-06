import { resolveFlowNodeDisplay } from "@chatbotx.io/business/flow-node-display"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { formatStepLabel } from "@/features/flow-steps/lib/step-label"

type StepLabelTranslate = Parameters<typeof formatStepLabel>[1]

type FlowVersionLike = {
  id: string
  isLatest?: boolean | null
  isDraft?: boolean | null
  nodes?: unknown
}

export type FlowWithVersionsLike = {
  id: string
  name: string
  currentVersionId?: string | null
  draftVersionId?: string | null
  flowVersions?: readonly FlowVersionLike[] | null
}

/** Sticky notes on the canvas: never executed, so never a recorded position. */
const NON_EXECUTABLE_NODE_TYPES = new Set(["addNotes"])

/**
 * The version whose nodes a contact can be on: the published one, the draft
 * for a never-published flow — same fallback as `currentFlowStepService`.
 */
export const pickPositionFlowVersion = (
  flow: FlowWithVersionsLike,
): FlowVersionLike | undefined => {
  const versions = flow.flowVersions ?? []
  return (
    versions.find((version) => version.id === flow.currentVersionId) ??
    versions.find((version) => version.isLatest) ??
    versions.find((version) => version.id === flow.draftVersionId) ??
    versions.find((version) => version.isDraft)
  )
}

const nodeIdOf = (node: unknown): string | undefined => {
  if (typeof node !== "object" || node === null) {
    return
  }
  const id = (node as { id?: unknown }).id
  return typeof id === "string" && id !== "" ? id : undefined
}

/** Node options of one flow, labelled like the "current step" line. */
export const buildFlowNodeOptions = (
  flow: FlowWithVersionsLike,
  t: StepLabelTranslate,
): SelectOption[] => {
  const nodes = pickPositionFlowVersion(flow)?.nodes
  if (!Array.isArray(nodes)) {
    return []
  }

  const labelCounts = new Map<string, number>()
  const options: SelectOption[] = []
  for (const node of nodes) {
    const id = nodeIdOf(node)
    if (!id) {
      continue
    }
    const display = resolveFlowNodeDisplay(node)
    if (display.nodeType && NON_EXECUTABLE_NODE_TYPES.has(display.nodeType)) {
      continue
    }
    const baseLabel = formatStepLabel(display, t)
    // The combobox searches/selects by label, so equal labels must differ.
    const seen = (labelCounts.get(baseLabel) ?? 0) + 1
    labelCounts.set(baseLabel, seen)
    options.push({
      label: seen === 1 ? baseLabel : `${baseLabel} (${seen})`,
      value: id,
    })
  }
  return options
}

/** Flow → node tree for the `currentFlowNode` picker and its chip label. */
export const buildFlowNodeOptionTree = (
  flows: readonly FlowWithVersionsLike[],
  t: StepLabelTranslate,
): SelectOption[] =>
  flows.map((flow) => ({
    label: flow.name,
    value: String(flow.id),
    children: buildFlowNodeOptions(flow, t),
  }))

/** "Flow › Step" for a stored `[flowId, nodeId]`; falls back to raw ids. */
export const formatFlowNodeValue = (
  value: unknown,
  tree: readonly SelectOption[] | undefined,
): string => {
  if (!(Array.isArray(value) && value.length === 2)) {
    return Array.isArray(value) ? value.join(", ") : String(value ?? "")
  }
  const [flowId, nodeId] = value.map(String)
  const flow = tree?.find((option) => option.value === flowId)
  const node = flow?.children?.find((option) => option.value === nodeId)
  return `${flow?.label ?? flowId} › ${node?.label ?? nodeId}`
}

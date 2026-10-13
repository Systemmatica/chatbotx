import { type FlowNode, stepTypes } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import { clone } from "remeda"
import { NODE_CARD_WIDTH_PX } from "../nodes/node-dimensions"

type MutableRecord = Record<string, unknown>

const DEFAULT_NODE_MEASURED = { width: NODE_CARD_WIDTH_PX, height: 100 }

const isRecord = (value: unknown): value is MutableRecord =>
  typeof value === "object" && value !== null

/**
 * How ids and node references are rewritten while a node's data is cloned.
 *
 * - `nextId` issues the replacement for an id. It must answer the same old id
 *   with the same new id, so an edge's `sourceHandle` (a button, option or
 *   state id) can be remapped after the fact through the same mapping.
 * - `resolveNodeRef` maps a reference to another canvas node into the clone's
 *   world, or `null` when the referenced node is not part of the clone. When
 *   absent (single-node duplicate), button routes and their actions are
 *   cleared and split-traffic cases are unlinked.
 */
export type NodeCloneContext = {
  nextId: (previousId: string) => string
  resolveNodeRef?: (nodeId: string) => string | null
}

/** A memoized `nextId`: one fresh id per distinct old id, recorded in `ids`. */
export const createIdRemapper = () => {
  const ids = new Map<string, string>()
  const nextId = (previousId: string) => {
    const existing = ids.get(previousId)
    if (existing) {
      return existing
    }
    const fresh = createId()
    ids.set(previousId, fresh)
    return fresh
  }
  return { ids, nextId }
}

const remapId = (value: unknown, ctx: NodeCloneContext): string =>
  typeof value === "string" && value.length > 0 ? ctx.nextId(value) : createId()

const cloneButton = <T extends MutableRecord>(
  button: T,
  ctx: NodeCloneContext,
): T => {
  const id = remapId(button.id, ctx)

  if (!ctx.resolveNodeRef) {
    return {
      ...clone(button),
      id,
      beforeStep: null,
      buttonType: null,
      steps: [],
    } as T
  }

  const next: MutableRecord = { ...clone(button), id }
  next.steps = Array.isArray(next.steps)
    ? next.steps.map((step) => (isRecord(step) ? cloneStep(step, ctx) : step))
    : []

  const beforeStep = next.beforeStep
  if (!isRecord(beforeStep)) {
    return next as T
  }

  if (beforeStep.stepType === stepTypes.enum.startAnotherNode) {
    // A button that opens another canvas node only keeps its route when that
    // node travels along; otherwise the copy starts unrouted.
    const target =
      typeof beforeStep.nodeId === "string"
        ? ctx.resolveNodeRef(beforeStep.nodeId)
        : null
    if (!target) {
      const unrouted: MutableRecord = {
        ...next,
        buttonType: null,
        beforeStep: null,
      }
      return unrouted as T
    }
    next.beforeStep = {
      ...beforeStep,
      id: remapId(beforeStep.id, ctx),
      nodeId: target,
    }
    return next as T
  }

  next.beforeStep = cloneStep(beforeStep, ctx)
  return next as T
}

const cloneElement = <T extends MutableRecord>(
  element: T,
  ctx: NodeCloneContext,
): T => {
  if (element.type === "button") {
    return cloneButton(element, ctx)
  }

  return {
    ...clone(element),
    id: remapId(element.id, ctx),
  } as T
}

const cloneCase = (caseItem: MutableRecord, ctx: NodeCloneContext) => {
  const next: MutableRecord = { ...clone(caseItem) }

  // Condition cases carry their own id: it is the case's source handle.
  if (typeof next.id === "string") {
    next.id = remapId(next.id, ctx)
  }

  if (!ctx.resolveNodeRef) {
    next.nodeId = null
  } else if ("nodeId" in next) {
    next.nodeId =
      typeof next.nodeId === "string" ? ctx.resolveNodeRef(next.nodeId) : null
  }

  return next
}

function cloneStep<T extends MutableRecord>(step: T, ctx: NodeCloneContext): T {
  const nextStep = {
    ...clone(step),
    id: remapId(step.id, ctx),
  } as MutableRecord

  // Step-level node references (e.g. a "start another node" action) follow
  // the clone when their target came along and otherwise keep pointing at it.
  if (ctx.resolveNodeRef && typeof nextStep.nodeId === "string") {
    nextStep.nodeId = ctx.resolveNodeRef(nextStep.nodeId) ?? nextStep.nodeId
  }

  if (Array.isArray(nextStep.states)) {
    nextStep.states = nextStep.states.map((state) =>
      isRecord(state) ? { ...clone(state), id: remapId(state.id, ctx) } : state,
    )
  }

  if (Array.isArray(nextStep.buttons)) {
    nextStep.buttons = nextStep.buttons.map((button) =>
      isRecord(button) ? cloneButton(button, ctx) : button,
    )
  }

  if (Array.isArray(nextStep.cards)) {
    nextStep.cards = nextStep.cards.map((card) =>
      isRecord(card) ? cloneStep(card, ctx) : card,
    )
  }

  if (Array.isArray(nextStep.elements)) {
    nextStep.elements = nextStep.elements.map((element) =>
      isRecord(element) ? cloneElement(element, ctx) : element,
    )
  }

  if (Array.isArray(nextStep.options)) {
    nextStep.options = nextStep.options.map((option) =>
      isRecord(option)
        ? { ...clone(option), id: remapId(option.id, ctx) }
        : option,
    )
  }

  if (Array.isArray(nextStep.cases)) {
    nextStep.cases = nextStep.cases.map((caseItem) =>
      isRecord(caseItem) ? cloneCase(caseItem, ctx) : caseItem,
    )
  }

  if (typeof nextStep.otherwiseId === "string") {
    nextStep.otherwiseId = remapId(nextStep.otherwiseId, ctx)
  }

  if (typeof nextStep.buttonId === "string") {
    nextStep.buttonId = remapId(nextStep.buttonId, ctx)
  }

  if (isRecord(nextStep.image)) {
    nextStep.image = cloneStep(nextStep.image, ctx)
  }

  return nextStep as T
}

/** Clones a node's `details` with every id it owns rewritten through `ctx`. */
export const cloneFlowNodeDetails = (
  sourceDetails: FlowNode["data"]["details"],
  ctx: NodeCloneContext,
): FlowNode["data"]["details"] => {
  const details = clone(sourceDetails)

  if ("beforeStep" in details && isRecord(details.beforeStep)) {
    details.beforeStep = cloneStep(
      details.beforeStep as MutableRecord,
      ctx,
    ) as typeof details.beforeStep
  }

  if ("steps" in details && Array.isArray(details.steps)) {
    details.steps = details.steps.map((step) =>
      cloneStep(step as MutableRecord, ctx),
    ) as typeof details.steps
  }

  if ("quickReplies" in details && Array.isArray(details.quickReplies)) {
    details.quickReplies = details.quickReplies.map((button) =>
      cloneButton(button as MutableRecord, ctx),
    ) as typeof details.quickReplies
  }

  return details
}

export const duplicateFlowNodeData = (node: FlowNode): FlowNode["data"] =>
  ({
    name: `${node.data.name} Copy`,
    isStartNode: false,
    details: cloneFlowNodeDetails(node.data.details, createIdRemapper()),
  }) as FlowNode["data"]

export const duplicateFlowNode = (node: FlowNode): FlowNode =>
  ({
    id: createId(),
    type: node.type,
    position: {
      x: node.position.x + 100,
      y: node.position.y + 100,
    },
    measured: {
      width: node.measured?.width ?? DEFAULT_NODE_MEASURED.width,
      height: node.measured?.height ?? DEFAULT_NODE_MEASURED.height,
    },
    data: duplicateFlowNodeData(node),
  }) as FlowNode

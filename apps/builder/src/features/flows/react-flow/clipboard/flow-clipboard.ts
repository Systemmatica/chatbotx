import { type FlowNode, nodeTypeSchema } from "@chatbotx.io/flow-config"
import { createId } from "@chatbotx.io/utils"
import type { Edge, XYPosition } from "@xyflow/react"
import { clone } from "remeda"
import { z } from "zod"
import { NODE_CARD_WIDTH_PX } from "../nodes/node-dimensions"
import {
  cloneFlowNodeDetails,
  createIdRemapper,
} from "../toolbar/duplicate-node-data"

/**
 * Canvas clipboard: the pure half of copy / cut / paste.
 *
 * A copy is serialized into a versioned JSON payload so it survives the trip
 * through the system clipboard (other tabs, other flows of the same
 * workspace). Pasting rebuilds the nodes with fresh ids and remaps every edge
 * between them through the same id mapping.
 */

export const FLOW_CLIPBOARD_TYPE = "chatbotx/flow-nodes"
export const FLOW_CLIPBOARD_VERSION = 1

/** Default shift for a paste that has no pointer position to land on. */
export const PASTE_OFFSET: XYPosition = { x: 40, y: 40 }

const DEFAULT_NODE_HEIGHT = 100

const clipboardNodeSchema = z.looseObject({
  id: z.string().min(1),
  type: nodeTypeSchema,
  position: z.object({ x: z.number(), y: z.number() }),
  measured: z
    .object({ width: z.number(), height: z.number() })
    .partial()
    .optional(),
  data: z.looseObject({
    name: z.string(),
    details: z.record(z.string(), z.unknown()),
  }),
})

const clipboardEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullish(),
  targetHandle: z.string().nullish(),
})

export const flowClipboardPayloadSchema = z.object({
  type: z.literal(FLOW_CLIPBOARD_TYPE),
  version: z.literal(FLOW_CLIPBOARD_VERSION),
  workspaceId: z.string().min(1),
  flowId: z.string().min(1),
  nodes: z.array(clipboardNodeSchema).min(1),
  edges: z.array(clipboardEdgeSchema),
})

export type FlowClipboardPayload = z.infer<typeof flowClipboardPayloadSchema>
export type ClipboardEdge = z.infer<typeof clipboardEdgeSchema>

/** What leaves the canvas: everything but React Flow's transient UI state. */
const toClipboardNode = (node: FlowNode) => {
  const {
    selected: _selected,
    dragging: _dragging,
    width: _width,
    height: _height,
    data,
    ...rest
  } = node
  const { forceToolbarVisible: _forceToolbarVisible, ...restData } =
    data as FlowNode["data"] & { forceToolbarVisible?: boolean }
  return clone({ ...rest, data: restData })
}

/**
 * Builds the payload for `selectedIds`: those nodes plus only the edges whose
 * both ends are copied. Returns `null` when nothing on the canvas matches.
 */
export const buildClipboardPayload = ({
  nodes,
  edges,
  selectedIds,
  workspaceId,
  flowId,
}: {
  nodes: readonly FlowNode[]
  edges: readonly Edge[]
  selectedIds: ReadonlySet<string>
  workspaceId: string
  flowId: string
}): FlowClipboardPayload | null => {
  const copied = nodes.filter((node) => selectedIds.has(node.id))
  if (copied.length === 0) {
    return null
  }
  const copiedIds = new Set(copied.map((node) => node.id))

  return {
    type: FLOW_CLIPBOARD_TYPE,
    version: FLOW_CLIPBOARD_VERSION,
    workspaceId,
    flowId,
    nodes: copied.map(toClipboardNode) as FlowClipboardPayload["nodes"],
    edges: edges
      .filter(
        (edge) => copiedIds.has(edge.source) && copiedIds.has(edge.target),
      )
      .map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        sourceHandle: edge.sourceHandle ?? null,
        targetHandle: edge.targetHandle ?? null,
      })),
  }
}

export const serializeClipboardPayload = (payload: FlowClipboardPayload) =>
  JSON.stringify(payload)

/** Parses clipboard text; anything that is not a valid payload is `null`. */
export const parseClipboardPayload = (
  text: string | null | undefined,
): FlowClipboardPayload | null => {
  if (!text) {
    return null
  }
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return null
  }
  const result = flowClipboardPayloadSchema.safeParse(json)
  return result.success ? result.data : null
}

/** Top-left corner of the nodes' bounding box. */
const boundingOrigin = (
  nodes: readonly { position: XYPosition }[],
): XYPosition => ({
  x: Math.min(...nodes.map((node) => node.position.x)),
  y: Math.min(...nodes.map((node) => node.position.y)),
})

/**
 * The translation that lands a paste. With a pointer `anchor`, the copied
 * group's top-left corner goes to it. Without one the group is shifted by
 * `offset` from where it was copied, again and again while that spot is
 * already taken by an existing node, so repeated pastes cascade instead of
 * stacking exactly on top of each other.
 */
export const resolvePasteTranslation = ({
  nodes,
  anchor,
  existingPositions = [],
  offset = PASTE_OFFSET,
}: {
  nodes: readonly { position: XYPosition }[]
  anchor?: XYPosition | null
  existingPositions?: readonly XYPosition[]
  offset?: XYPosition
}): XYPosition => {
  const origin = boundingOrigin(nodes)
  if (anchor) {
    return { x: anchor.x - origin.x, y: anchor.y - origin.y }
  }

  const occupied = new Set(
    existingPositions.map((position) => `${position.x}:${position.y}`),
  )
  const isTaken = (dx: number, dy: number) =>
    nodes.some((node) =>
      occupied.has(`${node.position.x + dx}:${node.position.y + dy}`),
    )

  let step = 1
  // Bounded so a pathological canvas can never spin forever.
  while (step < 50 && isTaken(offset.x * step, offset.y * step)) {
    step += 1
  }
  return { x: offset.x * step, y: offset.y * step }
}

/**
 * Remaps an edge's handle into the pasted copy. A node's own handles reuse
 * the node id and split-traffic cases are named `<nodeId>-case-<index>`;
 * every other handle is a button / option / state id the clone re-issued.
 */
const remapHandle = (
  handle: string | null | undefined,
  oldNodeId: string,
  newNodeId: string,
  ids: ReadonlyMap<string, string>,
): string | null => {
  if (!handle || handle === oldNodeId) {
    return newNodeId
  }
  const casePrefix = `${oldNodeId}-case-`
  if (handle.startsWith(casePrefix)) {
    return `${newNodeId}-case-${handle.slice(casePrefix.length)}`
  }
  return ids.get(handle) ?? null
}

export type PastedElements = {
  nodes: FlowNode[]
  edges: Edge[]
}

/**
 * Materializes a payload as brand-new canvas elements: fresh ids for nodes,
 * steps, buttons, options and states; edges remapped through the same id
 * mapping (an edge whose handle cannot be resolved is dropped rather than
 * left dangling); never a start node; every pasted node selected.
 */
export const instantiateClipboardPayload = (
  payload: FlowClipboardPayload,
  translation: XYPosition,
): PastedElements => {
  const { ids, nextId } = createIdRemapper()
  const nodeIds = new Map<string, string>()
  for (const node of payload.nodes) {
    nodeIds.set(node.id, nextId(node.id))
  }
  const resolveNodeRef = (nodeId: string) => nodeIds.get(nodeId) ?? null

  const nodes = payload.nodes.map((node) => {
    const { details, ...restData } = (node as unknown as FlowNode).data
    return {
      id: nodeIds.get(node.id) as string,
      type: node.type,
      position: {
        x: node.position.x + translation.x,
        y: node.position.y + translation.y,
      },
      measured: {
        width: node.measured?.width ?? NODE_CARD_WIDTH_PX,
        height: node.measured?.height ?? DEFAULT_NODE_HEIGHT,
      },
      selected: true,
      data: {
        ...clone(restData),
        isStartNode: false,
        details: cloneFlowNodeDetails(details, {
          nextId,
          resolveNodeRef,
        }),
      },
    } as FlowNode
  })

  const edges: Edge[] = []
  for (const edge of payload.edges) {
    const source = nodeIds.get(edge.source)
    const target = nodeIds.get(edge.target)
    if (!(source && target)) {
      continue
    }
    const sourceHandle = remapHandle(
      edge.sourceHandle,
      edge.source,
      source,
      ids,
    )
    const targetHandle = remapHandle(
      edge.targetHandle,
      edge.target,
      target,
      ids,
    )
    if (!(sourceHandle && targetHandle)) {
      continue
    }
    edges.push({ id: createId(), source, target, sourceHandle, targetHandle })
  }

  return { nodes, edges }
}

import type { ElkExtendedEdge, ElkNode, LayoutOptions } from "elkjs"
import { NODE_CARD_WIDTH_PX } from "../nodes/node-dimensions"

/** Horizontal gap between consecutive steps (between layers), in px. */
export const AUTO_LAYOUT_HORIZONTAL_GAP = 120

/** Vertical gap between sibling steps in the same column, in px. */
const AUTO_LAYOUT_VERTICAL_GAP = 60

/** Height used for a node React Flow has not measured yet. */
const FALLBACK_NODE_HEIGHT = 120

export type AutoLayoutNode = {
  id: string
  position: { x: number; y: number }
  width?: number
  height?: number
  isStartNode?: boolean
}

export type AutoLayoutEdge = {
  source: string
  target: string
}

export type AutoLayoutPositions = Record<string, { x: number; y: number }>

const ROOT_LAYOUT_OPTIONS: LayoutOptions = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  "elk.edgeRouting": "ORTHOGONAL",
  "elk.padding": "[top=0,left=0,bottom=0,right=0]",
  "elk.layered.spacing.nodeNodeBetweenLayers": String(
    AUTO_LAYOUT_HORIZONTAL_GAP,
  ),
  "elk.spacing.nodeNode": String(AUTO_LAYOUT_VERTICAL_GAP),
  "elk.spacing.componentComponent": String(AUTO_LAYOUT_VERTICAL_GAP),
  // Keep sibling order close to the authored order (e.g. button order) so the
  // result reads top-to-bottom the way the author built it.
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
}

const START_NODE_LAYOUT_OPTIONS: LayoutOptions = {
  "elk.layered.layering.layerConstraint": "FIRST",
}

/**
 * Computes left-to-right positions for every node with ELK's layered algorithm.
 *
 * Pure apart from lazily loading ELK: takes the measured node boxes and edges,
 * returns new top-left positions keyed by node id. The result is translated so
 * the laid-out graph starts at the original top-left corner of the canvas
 * content, which keeps the viewport jump small.
 */
export async function computeAutoLayout(
  nodes: readonly AutoLayoutNode[],
  edges: readonly AutoLayoutEdge[],
): Promise<AutoLayoutPositions> {
  if (nodes.length === 0) {
    return {}
  }

  const { default: ELK } = await import("elkjs/lib/elk.bundled.js")
  const elk = new ELK()

  const nodeIds = new Set(nodes.map((node) => node.id))
  // Start node first: together with the model-order strategy and the FIRST
  // layer constraint this pins the entry point to the leftmost column.
  const orderedNodes = [...nodes].sort(
    (a, b) => Number(Boolean(b.isStartNode)) - Number(Boolean(a.isStartNode)),
  )

  const children: ElkNode[] = orderedNodes.map((node) => ({
    id: node.id,
    width: node.width ?? NODE_CARD_WIDTH_PX,
    height: node.height ?? FALLBACK_NODE_HEIGHT,
    layoutOptions: node.isStartNode ? START_NODE_LAYOUT_OPTIONS : undefined,
  }))

  const seenEdges = new Set<string>()
  const elkEdges: ElkExtendedEdge[] = []
  for (const edge of edges) {
    if (
      edge.source === edge.target ||
      !nodeIds.has(edge.source) ||
      !nodeIds.has(edge.target)
    ) {
      continue
    }
    const key = `${edge.source}->${edge.target}`
    if (seenEdges.has(key)) {
      continue
    }
    seenEdges.add(key)
    elkEdges.push({
      id: `e${elkEdges.length}`,
      sources: [edge.source],
      targets: [edge.target],
    })
  }

  const graph = await elk.layout({
    id: "root",
    layoutOptions: ROOT_LAYOUT_OPTIONS,
    children,
    edges: elkEdges,
  })

  const originX = Math.min(...nodes.map((node) => node.position.x))
  const originY = Math.min(...nodes.map((node) => node.position.y))

  const positions: AutoLayoutPositions = {}
  for (const child of graph.children ?? []) {
    positions[child.id] = {
      x: Math.round(originX + (child.x ?? 0)),
      y: Math.round(originY + (child.y ?? 0)),
    }
  }

  return positions
}

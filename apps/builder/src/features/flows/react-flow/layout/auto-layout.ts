import type { ElkExtendedEdge, ElkNode, LayoutOptions } from "elkjs"
import { NODE_CARD_WIDTH_PX } from "../nodes/node-dimensions"

/** Horizontal gap between consecutive steps (between layers), in px. */
export const AUTO_LAYOUT_HORIZONTAL_GAP = 120

/** Vertical gap between sibling steps in the same column, in px. */
const AUTO_LAYOUT_VERTICAL_GAP = 60

/**
 * Vertical gap between rows: between stacked sections and between the rows a
 * long section is wrapped into. Wider than the sibling gap so rows read as
 * separate bands.
 */
export const AUTO_LAYOUT_ROW_GAP = 160

/** Width:height the finished layout aims for — a typical laptop viewport. */
export const AUTO_LAYOUT_TARGET_ASPECT_RATIO = 16 / 9

/**
 * Rows up to this wide are never wrapped (about eight blocks): framed on a
 * full-HD screen they still render at a readable zoom of ~0.5.
 */
export const AUTO_LAYOUT_MAX_ROW_WIDTH = 3840

/** Height used for a node React Flow has not measured yet. */
const FALLBACK_NODE_HEIGHT = 120

/** "2.7 Follow-up" → section 2. Whitespace before the number is ignored. */
const SECTION_NUMBER_REGEX = /^\s*(\d+)\./

export type AutoLayoutNode = {
  id: string
  position: { x: number; y: number }
  width?: number
  height?: number
  isStartNode?: boolean
  /** Block name; a leading "N." puts the block in section N. */
  name?: string
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

type Box = { id: string; x: number; y: number; width: number; height: number }

/** One laid-out section: node boxes relative to the section's top-left. */
type Group = { boxes: Box[] }

const sizeOf = (node: AutoLayoutNode) => ({
  width: node.width ?? NODE_CARD_WIDTH_PX,
  height: node.height ?? FALLBACK_NODE_HEIGHT,
})

export const parseSectionNumber = (name: string | undefined) => {
  const match = name ? SECTION_NUMBER_REGEX.exec(name) : null
  return match ? Number(match[1]) : null
}

/**
 * Visits every node breadth-first from the start node (then from any node not
 * reached yet, in canvas order). Returns the visit order and, per node, the
 * node it was discovered from.
 */
const traverse = (
  nodes: readonly AutoLayoutNode[],
  edges: readonly AutoLayoutEdge[],
) => {
  const outgoing = new Map<string, string[]>()
  for (const edge of edges) {
    const targets = outgoing.get(edge.source) ?? []
    targets.push(edge.target)
    outgoing.set(edge.source, targets)
  }

  const roots = [
    ...nodes.filter((node) => node.isStartNode),
    ...nodes.filter((node) => !node.isStartNode),
  ]
  const order: string[] = []
  const parent = new Map<string, string>()
  const visited = new Set<string>()
  for (const root of roots) {
    if (visited.has(root.id)) {
      continue
    }
    visited.add(root.id)
    const queue = [root.id]
    while (queue.length > 0) {
      const id = queue.shift() as string
      order.push(id)
      for (const target of outgoing.get(id) ?? []) {
        if (!visited.has(target)) {
          visited.add(target)
          parent.set(target, id)
          queue.push(target)
        }
      }
    }
  }
  return { order, parent }
}

/**
 * Groups nodes into sections by the leading number of their name. A node
 * without a number joins the section of the node it was reached from (or of
 * the previously visited node). Returns `null` when no node is numbered.
 * Sections are ordered by number, with the start node's section first; each
 * keeps the traversal order, which ELK uses as model order.
 */
const groupBySection = (
  nodes: readonly AutoLayoutNode[],
  edges: readonly AutoLayoutEdge[],
): string[][] | null => {
  const numbered = new Map<string, number>()
  for (const node of nodes) {
    const section = parseSectionNumber(node.name)
    if (section !== null) {
      numbered.set(node.id, section)
    }
  }
  if (numbered.size === 0) {
    return null
  }

  const { order, parent } = traverse(nodes, edges)
  const lowestSection = Math.min(...numbered.values())
  const sectionOf = new Map<string, number>()
  let previous: number | undefined
  for (const id of order) {
    const parentId = parent.get(id)
    const section =
      numbered.get(id) ??
      (parentId === undefined ? undefined : sectionOf.get(parentId)) ??
      previous ??
      lowestSection
    sectionOf.set(id, section)
    previous = section
  }

  const members = new Map<number, string[]>()
  for (const id of order) {
    const section = sectionOf.get(id) as number
    const list = members.get(section) ?? []
    list.push(id)
    members.set(section, list)
  }

  const startNode = nodes.find((node) => node.isStartNode)
  const startSection = startNode ? sectionOf.get(startNode.id) : undefined
  return [...members.keys()]
    .sort((a, b) => {
      if (a === startSection) {
        return -1
      }
      if (b === startSection) {
        return 1
      }
      return a - b
    })
    .map((section) => members.get(section) as string[])
}

type Elk = { layout: (graph: ElkNode) => Promise<ElkNode> }

/** Lays one set of nodes out left-to-right with ELK's layered algorithm. */
const layoutGroup = async (
  elk: Elk,
  ids: readonly string[],
  nodeById: ReadonlyMap<string, AutoLayoutNode>,
  edges: readonly AutoLayoutEdge[],
): Promise<Group> => {
  const memberIds = new Set(ids)
  // Start node first: together with the model-order strategy and the FIRST
  // layer constraint this pins the entry point to the leftmost column.
  const ordered = [...ids].sort(
    (a, b) =>
      Number(Boolean(nodeById.get(b)?.isStartNode)) -
      Number(Boolean(nodeById.get(a)?.isStartNode)),
  )
  const children: ElkNode[] = ordered.map((id) => {
    const node = nodeById.get(id) as AutoLayoutNode
    return {
      id,
      ...sizeOf(node),
      layoutOptions: node.isStartNode ? START_NODE_LAYOUT_OPTIONS : undefined,
    }
  })

  const seenEdges = new Set<string>()
  const elkEdges: ElkExtendedEdge[] = []
  for (const edge of edges) {
    if (
      edge.source === edge.target ||
      !memberIds.has(edge.source) ||
      !memberIds.has(edge.target)
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

  const boxes = (graph.children ?? []).map((child) => {
    const size = sizeOf(nodeById.get(child.id) as AutoLayoutNode)
    return { id: child.id, x: child.x ?? 0, y: child.y ?? 0, ...size }
  })
  return { boxes }
}

/**
 * Splits a group into vertical bands ("layers"): runs of nodes whose x ranges
 * overlap. Bands never overlap each other horizontally, so any consecutive
 * run of them can be moved as a rigid block.
 */
const toBands = (group: Group): Box[][] => {
  const sorted = [...group.boxes].sort((a, b) => a.x - b.x)
  const bands: Box[][] = []
  let bandRight = Number.NEGATIVE_INFINITY
  for (const box of sorted) {
    const current = bands.at(-1)
    if (current && box.x < bandRight) {
      current.push(box)
      bandRight = Math.max(bandRight, box.x + box.width)
    } else {
      bands.push([box])
      bandRight = box.x + box.width
    }
  }
  return bands
}

const bounds = (boxes: readonly Box[]) => ({
  minX: Math.min(...boxes.map((box) => box.x)),
  minY: Math.min(...boxes.map((box) => box.y)),
  maxX: Math.max(...boxes.map((box) => box.x + box.width)),
  maxY: Math.max(...boxes.map((box) => box.y + box.height)),
})

/**
 * Stacks the groups top to bottom, wrapping every group into rows of at most
 * `maxBandsPerRow` layers. Each row keeps ELK's relative placement and is
 * shifted to the left edge, so nothing inside a row can overlap.
 */
const arrange = (bandsPerGroup: readonly Box[][][], maxBandsPerRow: number) => {
  const placed: Box[] = []
  let top = 0
  for (const bands of bandsPerGroup) {
    for (let start = 0; start < bands.length; start += maxBandsPerRow) {
      const rowBands = bands.slice(start, start + maxBandsPerRow)
      const row = rowBands.flat()
      const { minX, minY, maxY } = bounds(row)
      for (const band of rowBands) {
        // A lone block hangs from the row's top edge (ELK centres it on its
        // neighbours), so chains read as a straight row of card tops. Bands
        // never share x, so this cannot create an overlap.
        for (const box of band) {
          const y = band.length === 1 ? minY : box.y
          placed.push({ ...box, x: box.x - minX, y: y - minY + top })
        }
      }
      top += maxY - minY + AUTO_LAYOUT_ROW_GAP
    }
  }
  return placed
}

/**
 * How small a layout appears when fitted into a viewport of the target aspect
 * ratio: the larger of its width and height, each measured against the
 * viewport's side. Lower means a bigger zoom when framed, i.e. more readable.
 */
const fitCost = (boxes: readonly Box[]) => {
  const { minX, minY, maxX, maxY } = bounds(boxes)
  return Math.max((maxX - minX) / AUTO_LAYOUT_TARGET_ASPECT_RATIO, maxY - minY)
}

/**
 * Wraps sections into rows so the whole layout fits a 16:9 screen as large as
 * possible. A layout no wider than `AUTO_LAYOUT_MAX_ROW_WIDTH` is left alone:
 * it already reads fine and wrapping a short flow only scatters it. Otherwise
 * every row count is tried (rows split evenly, so no stub last row) and the
 * one that frames biggest wins; ties go to fewer rows.
 */
const arrangeToAspectRatio = (groups: readonly Group[]) => {
  const bandsPerGroup = groups.map(toBands)
  const longest = Math.max(...bandsPerGroup.map((bands) => bands.length))
  let best = arrange(bandsPerGroup, longest)
  const { minX, maxX } = bounds(best)
  if (maxX - minX <= AUTO_LAYOUT_MAX_ROW_WIDTH) {
    return best
  }

  let bestCost = fitCost(best)
  let previousPerRow = longest
  for (let rows = 2; rows <= longest; rows += 1) {
    const perRow = Math.ceil(longest / rows)
    if (perRow === previousPerRow) {
      continue
    }
    previousPerRow = perRow
    const candidate = arrange(bandsPerGroup, perRow)
    const cost = fitCost(candidate)
    if (cost < bestCost) {
      best = candidate
      bestCost = cost
    }
  }
  return best
}

/**
 * Computes positions for every node so a large flow fits a screen.
 *
 * Nodes are grouped into sections by the leading number of their name
 * ("2.7 …" → section 2). Each section is laid out left-to-right with ELK's
 * layered algorithm and the sections are stacked top to bottom, start node's
 * section first. Without numbered names the whole flow is one section. Any
 * section with too many layers is wrapped into several rows, with the row
 * length chosen so the whole picture lands near a 16:9 viewport.
 *
 * Pure apart from lazily loading ELK: takes the measured node boxes and edges,
 * returns new top-left positions keyed by node id. The result is translated so
 * it starts at the original top-left corner of the canvas content, which keeps
 * the viewport jump small.
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

  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const sections = groupBySection(nodes, edges) ?? [
    nodes.map((node) => node.id),
  ]

  const groups: Group[] = []
  for (const ids of sections) {
    groups.push(await layoutGroup(elk, ids, nodeById, edges))
  }

  const originX = Math.min(...nodes.map((node) => node.position.x))
  const originY = Math.min(...nodes.map((node) => node.position.y))

  const positions: AutoLayoutPositions = {}
  for (const box of arrangeToAspectRatio(groups)) {
    positions[box.id] = {
      x: Math.round(originX + box.x),
      y: Math.round(originY + box.y),
    }
  }

  return positions
}

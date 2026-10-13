/**
 * Read-only "table of contents" of a flow: every block in the order a contact
 * would meet it, starting from the start block. Blocks no edge leads to come
 * last, flagged as unreachable, so nothing on the canvas is missing from it.
 */

export type OutlineSourceNode = {
  id: string
  type?: string
  position: { x: number; y: number }
  data: { name?: unknown; isStartNode?: unknown; [key: string]: unknown }
}

export type OutlineSourceEdge = {
  source: string
  target: string
  sourceHandle?: string | null
}

export type FlowOutlineItem = {
  id: string
  name: string
  type: string
  isStartNode: boolean
  reachable: boolean
}

// Node data only changes identity when it is edited (a drag moves `position`),
// so caching by reference keeps rebuilding the outline cheap while dragging.
const serializedDataCache = new WeakMap<object, string>()

const serializeData = (data: object): string => {
  const cached = serializedDataCache.get(data)
  if (cached !== undefined) {
    return cached
  }
  const serialized = JSON.stringify(data)
  serializedDataCache.set(data, serialized)
  return serialized
}

/**
 * Rank of an outgoing edge inside its source block: buttons and step states
 * follow the order they appear in the block, the block's own "next step"
 * handle (whose id is the node id) goes last.
 */
const handleRank = (node: OutlineSourceNode, handle: string | null): number => {
  if (!handle || handle === node.id) {
    return Number.MAX_SAFE_INTEGER
  }
  const index = serializeData(node.data).indexOf(`"${handle}"`)
  return index === -1 ? Number.MAX_SAFE_INTEGER - 1 : index
}

const byPosition = (a: OutlineSourceNode, b: OutlineSourceNode) =>
  a.position.x - b.position.x || a.position.y - b.position.y

const toItem = (
  node: OutlineSourceNode,
  reachable: boolean,
): FlowOutlineItem => ({
  id: node.id,
  name: typeof node.data.name === "string" ? node.data.name : "",
  type: node.type ?? "",
  isStartNode: Boolean(node.data.isStartNode),
  reachable,
})

export const buildFlowOutline = (
  nodes: readonly OutlineSourceNode[],
  edges: readonly OutlineSourceEdge[],
): FlowOutlineItem[] => {
  const nodeById = new Map(nodes.map((node) => [node.id, node]))

  const outgoing = new Map<string, OutlineSourceEdge[]>()
  for (const edge of edges) {
    if (!(nodeById.has(edge.source) && nodeById.has(edge.target))) {
      continue
    }
    const list = outgoing.get(edge.source)
    if (list) {
      list.push(edge)
    } else {
      outgoing.set(edge.source, [edge])
    }
  }

  const items: FlowOutlineItem[] = []
  const visited = new Set<string>()
  const start = nodes.find((node) => Boolean(node.data.isStartNode))

  // Depth-first pre-order: a branch is listed to its end before the next
  // button's branch starts, which reads like the conversation itself.
  const stack: string[] = start ? [start.id] : []
  while (stack.length > 0) {
    const id = stack.pop() as string
    const node = nodeById.get(id)
    if (!node || visited.has(id)) {
      continue
    }
    visited.add(id)
    items.push(toItem(node, true))

    const children = (outgoing.get(id) ?? [])
      .map((edge, order) => ({
        target: edge.target,
        rank: handleRank(node, edge.sourceHandle ?? null),
        order,
      }))
      .sort((a, b) => a.rank - b.rank || a.order - b.order)

    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index]
      if (child && !visited.has(child.target)) {
        stack.push(child.target)
      }
    }
  }

  const unreachable = nodes
    .filter((node) => !visited.has(node.id))
    .sort(byPosition)
    .map((node) => toItem(node, false))

  return [...items, ...unreachable]
}

/** Case-insensitive substring match on the block name. */
export const filterFlowOutline = (
  items: readonly FlowOutlineItem[],
  query: string,
): FlowOutlineItem[] => {
  const needle = query.trim().toLocaleLowerCase()
  if (!needle) {
    return [...items]
  }
  return items.filter((item) => item.name.toLocaleLowerCase().includes(needle))
}

import { describe, expect, test } from "vitest"
import {
  AUTO_LAYOUT_HORIZONTAL_GAP,
  type AutoLayoutEdge,
  type AutoLayoutNode,
  type AutoLayoutPositions,
  computeAutoLayout,
} from "../auto-layout"

const box = (id: string, height: number, isStartNode = false) =>
  ({
    id,
    // deliberately piled up at one spot, as a messy hand-built canvas would be
    position: { x: 40, y: 40 },
    width: 360,
    height,
    isStartNode,
  }) satisfies AutoLayoutNode

const overlaps = (
  nodes: AutoLayoutNode[],
  positions: AutoLayoutPositions,
): [string, string] | null => {
  for (let i = 0; i < nodes.length; i += 1) {
    for (let j = i + 1; j < nodes.length; j += 1) {
      const a = nodes[i]
      const b = nodes[j]
      const pa = positions[a.id]
      const pb = positions[b.id]
      const separated =
        pa.x + (a.width ?? 0) <= pb.x ||
        pb.x + (b.width ?? 0) <= pa.x ||
        pa.y + (a.height ?? 0) <= pb.y ||
        pb.y + (b.height ?? 0) <= pa.y
      if (!separated) {
        return [a.id, b.id]
      }
    }
  }
  return null
}

describe("computeAutoLayout", () => {
  test("returns nothing for an empty canvas", async () => {
    await expect(computeAutoLayout([], [])).resolves.toEqual({})
  })

  test("lays a branching flow out left-to-right without overlaps", async () => {
    const nodes = [
      box("start", 200, true),
      box("a", 140),
      box("b", 320),
      box("c", 90),
      box("d", 180),
      box("orphan", 120),
    ]
    const edges: AutoLayoutEdge[] = [
      { source: "start", target: "a" },
      { source: "start", target: "b" },
      { source: "start", target: "c" },
      { source: "a", target: "d" },
      { source: "b", target: "d" },
      // loop back to the entry point must not move it out of the first column
      { source: "d", target: "start" },
      // edges to unknown nodes and self-loops are ignored
      { source: "a", target: "missing" },
      { source: "c", target: "c" },
    ]

    const positions = await computeAutoLayout(nodes, edges)

    expect(Object.keys(positions).sort()).toEqual(
      nodes.map((node) => node.id).sort(),
    )
    expect(overlaps(nodes, positions)).toBeNull()

    const startX = positions.start.x
    for (const node of nodes) {
      expect(positions[node.id].x).toBeGreaterThanOrEqual(startX)
    }

    // children sit a full card plus the horizontal gap to the right
    expect(positions.a.x - startX).toBeGreaterThanOrEqual(
      360 + AUTO_LAYOUT_HORIZONTAL_GAP,
    )
    expect(positions.d.x).toBeGreaterThan(positions.a.x)
  })

  test("keeps the start node leftmost even when it is not a graph source", async () => {
    const nodes = [box("x", 100), box("y", 100), box("start", 100, true)]
    const edges: AutoLayoutEdge[] = [
      { source: "x", target: "start" },
      { source: "start", target: "y" },
    ]

    const positions = await computeAutoLayout(nodes, edges)

    expect(overlaps(nodes, positions)).toBeNull()
    expect(positions.start.x).toBeLessThanOrEqual(positions.x.x)
    expect(positions.start.x).toBeLessThan(positions.y.x)
  })
})

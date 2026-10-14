import { describe, expect, test } from "vitest"
import {
  AUTO_LAYOUT_HORIZONTAL_GAP,
  AUTO_LAYOUT_ROW_GAP,
  type AutoLayoutEdge,
  type AutoLayoutNode,
  type AutoLayoutPositions,
  computeAutoLayout,
  parseSectionNumber,
} from "../auto-layout"

const box = (id: string, height: number, isStartNode = false, name?: string) =>
  ({
    id,
    // deliberately piled up at one spot, as a messy hand-built canvas would be
    position: { x: 40, y: 40 },
    width: 360,
    height,
    isStartNode,
    name,
  }) satisfies AutoLayoutNode

const boundingBox = (
  nodes: AutoLayoutNode[],
  positions: AutoLayoutPositions,
) => {
  const xs = nodes.map((node) => positions[node.id].x)
  const ys = nodes.map((node) => positions[node.id].y)
  const right = nodes.map((node) => positions[node.id].x + (node.width ?? 0))
  const bottom = nodes.map((node) => positions[node.id].y + (node.height ?? 0))
  const width = Math.max(...right) - Math.min(...xs)
  const height = Math.max(...bottom) - Math.min(...ys)
  return { width, height, minX: Math.min(...xs), minY: Math.min(...ys) }
}

/** A straight chain n0 -> n1 -> ... with n0 as the start node. */
const chain = (count: number, name: (index: number) => string | undefined) => {
  const nodes = Array.from({ length: count }, (_, index) =>
    box(`n${index}`, 100 + (index % 3) * 40, index === 0, name(index)),
  )
  const edges: AutoLayoutEdge[] = nodes.slice(1).map((node, index) => ({
    source: `n${index}`,
    target: node.id,
  }))
  return { nodes, edges }
}

/** Bounds of the target 16:9 ratio a big flow should land within. */
const MIN_ASPECT = 1
const MAX_ASPECT = 3

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

  test("stacks numbered sections as rows, start section first", async () => {
    // 70 blocks: sections 1..7 of ten blocks each, chained in name order
    const sectionOf = (index: number) => Math.floor(index / 10) + 1
    const { nodes, edges } = chain(
      70,
      (index) => `${sectionOf(index)}.${(index % 10) + 1} Step`,
    )

    const positions = await computeAutoLayout(nodes, edges)

    expect(overlaps(nodes, positions)).toBeNull()

    const bySection = new Map<number, AutoLayoutNode[]>()
    nodes.forEach((node, index) => {
      const list = bySection.get(sectionOf(index)) ?? []
      list.push(node)
      bySection.set(sectionOf(index), list)
    })
    // every section sits entirely below the previous one, with the row gap
    for (let section = 2; section <= 7; section += 1) {
      const above = boundingBox(
        bySection.get(section - 1) as AutoLayoutNode[],
        positions,
      )
      const below = boundingBox(
        bySection.get(section) as AutoLayoutNode[],
        positions,
      )
      expect(below.minY).toBeGreaterThanOrEqual(
        above.minY + above.height + AUTO_LAYOUT_ROW_GAP,
      )
    }

    // start node top-left
    const all = boundingBox(nodes, positions)
    expect(positions.n0.x).toBe(all.minX)
    expect(positions.n0.y).toBeLessThan(
      boundingBox(bySection.get(2) as AutoLayoutNode[], positions).minY,
    )
  })

  test("unnumbered blocks join the section they are reached from", async () => {
    const nodes = [
      box("start", 100, true, "Welcome"),
      box("a", 100, false, "1.1 Intro"),
      box("b", 100, false, "2.1 Offer"),
      box("b-child", 100, false, "Reminder"),
      box("c", 100, false, "1.2 Details"),
    ]
    const edges: AutoLayoutEdge[] = [
      { source: "start", target: "a" },
      { source: "a", target: "c" },
      { source: "a", target: "b" },
      { source: "b", target: "b-child" },
    ]

    const positions = await computeAutoLayout(nodes, edges)

    expect(overlaps(nodes, positions)).toBeNull()
    // section 1 (start, a, c) is one row; section 2 (b, b-child) below it
    const row1 = boundingBox([nodes[0], nodes[1], nodes[4]], positions)
    expect(positions.b.y).toBeGreaterThanOrEqual(row1.minY + row1.height)
    expect(positions["b-child"].y).toBe(positions.b.y)
    expect(positions["b-child"].x).toBeGreaterThan(positions.b.x)
    expect(positions.start.x).toBe(boundingBox(nodes, positions).minX)
  })

  test("wraps a long chain without section numbers into rows near 16:9", async () => {
    const { nodes, edges } = chain(70, () => undefined)

    const positions = await computeAutoLayout(nodes, edges)

    expect(overlaps(nodes, positions)).toBeNull()
    const { width, height, minX } = boundingBox(nodes, positions)
    expect(width / height).toBeGreaterThanOrEqual(MIN_ASPECT)
    expect(width / height).toBeLessThanOrEqual(MAX_ASPECT)
    // more than one row, and the start node opens the first one
    const rowTops = new Set(nodes.map((node) => positions[node.id].y))
    expect(rowTops.size).toBeGreaterThan(1)
    expect(positions.n0.x).toBe(minX)
    expect(positions.n0.y).toBe(Math.min(...rowTops))
    // consistent gap between consecutive blocks within a row
    expect(positions.n1.x - positions.n0.x).toBe(
      360 + AUTO_LAYOUT_HORIZONTAL_GAP,
    )
  })

  test("keeps a short flow on one row", async () => {
    const { nodes, edges } = chain(3, () => undefined)

    const positions = await computeAutoLayout(nodes, edges)

    expect(new Set(nodes.map((node) => positions[node.id].y)).size).toBe(1)
  })

  test("reads the section number from a block name", () => {
    expect(parseSectionNumber("2.7 Follow-up")).toBe(2)
    expect(parseSectionNumber("  12. Done")).toBe(12)
    expect(parseSectionNumber("Step 2.7")).toBeNull()
    expect(parseSectionNumber(undefined)).toBeNull()
  })
})

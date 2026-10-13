import { describe, expect, test } from "vitest"
import {
  buildFlowOutline,
  filterFlowOutline,
  type OutlineSourceEdge,
  type OutlineSourceNode,
} from "../flow-outline"

const node = (
  id: string,
  name: string,
  options: {
    start?: boolean
    x?: number
    y?: number
    buttons?: string[]
  } = {},
): OutlineSourceNode => ({
  id,
  type: "sendMessage",
  position: { x: options.x ?? 0, y: options.y ?? 0 },
  data: {
    name,
    isStartNode: options.start ?? false,
    details: {
      steps: [
        {
          id: `${id}0`,
          buttons: (options.buttons ?? []).map((buttonId) => ({
            id: buttonId,
          })),
        },
      ],
    },
  },
})

const edge = (
  source: string,
  target: string,
  sourceHandle: string = source,
): OutlineSourceEdge => ({ source, target, sourceHandle })

const ids = (items: { id: string }[]) => items.map((item) => item.id)

describe("buildFlowOutline", () => {
  test("walks depth-first from the start block, buttons in block order", () => {
    const nodes = [
      node("10", "Leaf A", { x: 900 }),
      node("1", "Start", { start: true, buttons: ["101", "102"] }),
      node("20", "Branch B", { x: 400, y: 300 }),
      node("11", "Branch A", { x: 400 }),
      node("30", "After", { x: 1200 }),
    ]
    const edges = [
      // continue handle listed first, but it must come after the buttons
      edge("1", "30"),
      edge("1", "20", "102"),
      edge("1", "11", "101"),
      edge("11", "10"),
    ]

    const outline = buildFlowOutline(nodes, edges)
    expect(ids(outline)).toEqual(["1", "11", "10", "20", "30"])
    expect(outline.every((item) => item.reachable)).toBe(true)
    expect(outline[0]?.isStartNode).toBe(true)
  })

  test("puts unreachable blocks last, ordered by position, flagged", () => {
    const nodes = [
      node("5", "Orphan right", { x: 800 }),
      node("1", "Start", { start: true }),
      node("4", "Orphan left", { x: 100 }),
      node("2", "Next", { x: 400 }),
    ]
    const outline = buildFlowOutline(nodes, [edge("1", "2")])

    expect(ids(outline)).toEqual(["1", "2", "4", "5"])
    expect(outline.map((item) => item.reachable)).toEqual([
      true,
      true,
      false,
      false,
    ])
  })

  test("survives cycles and edges to missing nodes", () => {
    const nodes = [node("1", "Start", { start: true }), node("2", "Loop")]
    const edges = [edge("1", "2"), edge("2", "1"), edge("2", "404")]

    expect(ids(buildFlowOutline(nodes, edges))).toEqual(["1", "2"])
  })

  test("without a start block every block is unreachable", () => {
    const outline = buildFlowOutline(
      [node("2", "B", { x: 10 }), node("1", "A", { x: 0 })],
      [],
    )
    expect(ids(outline)).toEqual(["1", "2"])
    expect(outline.some((item) => item.reachable)).toBe(false)
  })
})

describe("filterFlowOutline", () => {
  const outline = buildFlowOutline(
    [
      node("1", "1. Приветствие", { start: true }),
      node("2", "2.3 Оффер", { x: 1 }),
      node("3", "2.30 Напоминание", { x: 2 }),
    ],
    [],
  )

  test("matches a substring of the name, case-insensitively", () => {
    expect(ids(filterFlowOutline(outline, "2.3"))).toEqual(["2", "3"])
    expect(ids(filterFlowOutline(outline, "  оФФер "))).toEqual(["2"])
  })

  test("an empty query keeps everything", () => {
    expect(filterFlowOutline(outline, "  ")).toHaveLength(3)
  })
})

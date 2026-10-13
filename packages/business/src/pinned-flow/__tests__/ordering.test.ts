import { describe, expect, test } from "vitest"
import {
  canPinMoreFlows,
  MAX_PINNED_FLOWS,
  orderPinnedFlows,
} from "../ordering"

const entry = (flowId: string, minute: number) => ({
  flowId,
  name: `Flow ${flowId}`,
  pinnedAt: new Date(Date.UTC(2026, 0, 1, 0, minute)),
})

describe("orderPinnedFlows", () => {
  test("puts the oldest pin first", () => {
    const ordered = orderPinnedFlows([
      entry("3", 30),
      entry("1", 10),
      entry("2", 20),
    ])
    expect(ordered.map((e) => e.flowId)).toEqual(["1", "2", "3"])
  })

  test("breaks ties by flow id", () => {
    const ordered = orderPinnedFlows([entry("b", 5), entry("a", 5)])
    expect(ordered.map((e) => e.flowId)).toEqual(["a", "b"])
  })

  test("caps the list and does not mutate the input", () => {
    const input = Array.from({ length: 12 }, (_, i) => entry(String(i), 12 - i))
    const snapshot = [...input]
    const ordered = orderPinnedFlows(input)
    expect(ordered).toHaveLength(MAX_PINNED_FLOWS)
    expect(ordered[0]?.flowId).toBe("11")
    expect(input).toEqual(snapshot)
  })
})

describe("canPinMoreFlows", () => {
  test("allows pins below the limit only", () => {
    expect(canPinMoreFlows(0)).toBe(true)
    expect(canPinMoreFlows(MAX_PINNED_FLOWS - 1)).toBe(true)
    expect(canPinMoreFlows(MAX_PINNED_FLOWS)).toBe(false)
  })
})

import { describe, expect, it } from "vitest"
import {
  getAdjacentContactId,
  isInteractiveClickTarget,
  isTypingTarget,
  uniqueInOrder,
} from "../peek-navigation"

describe("getAdjacentContactId", () => {
  const ids = ["a", "b", "c"]

  it("steps to the previous and next contact in display order", () => {
    expect(getAdjacentContactId(ids, "b", "previous")).toBe("a")
    expect(getAdjacentContactId(ids, "b", "next")).toBe("c")
  })

  it("stops at both ends of the list", () => {
    expect(getAdjacentContactId(ids, "a", "previous")).toBeNull()
    expect(getAdjacentContactId(ids, "c", "next")).toBeNull()
  })

  it("does nothing for a contact outside the list or no contact", () => {
    expect(getAdjacentContactId(ids, "z", "next")).toBeNull()
    expect(getAdjacentContactId(ids, null, "next")).toBeNull()
    expect(getAdjacentContactId([], "a", "previous")).toBeNull()
  })
})

describe("uniqueInOrder", () => {
  it("keeps the first appearance of a contact shown in several groups", () => {
    expect(uniqueInOrder(["a", "b", "a", "c", "b"])).toEqual(["a", "b", "c"])
  })

  it("flattens kanban columns top to bottom, column by column", () => {
    const columns = [{ cards: ["x", "y"] }, { cards: [] }, { cards: ["z"] }]
    expect(uniqueInOrder(columns.flatMap((column) => column.cards))).toEqual([
      "x",
      "y",
      "z",
    ])
  })
})

/** Minimal Element stand-in: `closest` matched against a fixed chain. */
const fakeElement = (
  matches: (selector: string) => boolean,
  parent: FakeElement | null = null,
): FakeElement => {
  const element: FakeElement = {
    parent,
    isContentEditable: false,
    closest(selector: string): FakeElement | null {
      let current: FakeElement | null = element
      while (current) {
        if (current.matchesSelector(selector)) {
          return current
        }
        current = current.parent
      }
      return null
    },
    contains(other: FakeElement | null): boolean {
      let current = other
      while (current) {
        if (current === element) {
          return true
        }
        current = current.parent
      }
      return false
    },
    matchesSelector: matches,
  }
  return element
}

type FakeElement = {
  parent: FakeElement | null
  isContentEditable: boolean
  closest: (selector: string) => FakeElement | null
  contains: (other: FakeElement | null) => boolean
  matchesSelector: (selector: string) => boolean
}

const asElement = (value: FakeElement) => value as unknown as Element

describe("isInteractiveClickTarget", () => {
  it("ignores clicks on a checkbox inside the row", () => {
    const row = fakeElement(() => false)
    const checkbox = fakeElement(
      (selector) => selector.includes("checkbox"),
      row,
    )
    expect(isInteractiveClickTarget(asElement(checkbox), asElement(row))).toBe(
      true,
    )
  })

  it("opens on a plain cell, even when the row itself has a button role", () => {
    const card = fakeElement((selector) => selector.includes('role="button"'))
    const text = fakeElement(() => false, card)
    expect(isInteractiveClickTarget(asElement(text), asElement(card))).toBe(
      false,
    )
  })
})

describe("isTypingTarget", () => {
  it("treats text fields as typing targets and plain nodes as not", () => {
    const input = fakeElement((selector) => selector.includes("input"))
    const plain = fakeElement(() => false)
    expect(isTypingTarget(asElement(input))).toBe(true)
    expect(isTypingTarget(asElement(plain))).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

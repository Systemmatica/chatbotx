import { describe, expect, test } from "vitest"
import { mergeFreshHead, reconcileList, reuseUnchanged } from "../merge-fresh"

type Item = { id: string; text: string; at?: number }

const item = (id: string, text = id, at?: number): Item => ({ id, text, at })
const ids = (items: Item[]) => items.map((entry) => entry.id)
const getId = (entry: Item) => entry.id

describe("reuseUnchanged", () => {
  test("returns the current object when nothing changed", () => {
    const current = { id: "1", tags: [{ id: "t" }], notes: [] }
    const fresh = { id: "1", tags: [{ id: "t" }], notes: [] }
    expect(reuseUnchanged(current, fresh)).toBe(current)
  })

  test("keeps the identity of unchanged fields only", () => {
    const current = { id: "1", tags: [{ id: "t" }], notes: [{ id: "n" }] }
    const fresh = { id: "1", tags: [{ id: "t" }], notes: [{ id: "m" }] }
    const result = reuseUnchanged(current, fresh)
    expect(result).not.toBe(current)
    expect(result.tags).toBe(current.tags)
    expect(result.notes).toBe(fresh.notes)
  })

  test("treats Dates and their ISO strings as equal", () => {
    const at = new Date("2026-01-01T00:00:00Z")
    const current = { at }
    expect(reuseUnchanged(current, { at: new Date(at.getTime()) })).toBe(
      current,
    )
  })
})

describe("reconcileList", () => {
  test("returns the current list when nothing changed", () => {
    const current = [item("a"), item("b")]
    expect(reconcileList(current, [item("a"), item("b")], getId)).toBe(current)
  })

  test("follows the fresh order and reuses unchanged rows", () => {
    const current = [item("a"), item("b"), item("c")]
    const result = reconcileList(
      current,
      [item("b"), item("a", "edited"), item("d")],
      getId,
    )
    expect(ids(result)).toEqual(["b", "a", "d"])
    expect(result[0]).toBe(current[1])
    expect(result[1].text).toBe("edited")
  })
})

describe("mergeFreshHead", () => {
  test("returns the current list when the first page did not change", () => {
    const current = [item("a"), item("b"), item("c")]
    expect(mergeFreshHead(current, [item("a"), item("b")], getId)).toBe(current)
  })

  test("puts new and moved items on top and keeps later pages", () => {
    const current = [item("a"), item("b"), item("c"), item("d")]
    const result = mergeFreshHead(
      current,
      [item("new"), item("c", "updated"), item("a")],
      getId,
    )
    expect(ids(result)).toEqual(["new", "c", "a", "b", "d"])
    expect(result[1].text).toBe("updated")
    expect(result[2]).toBe(current[0])
  })

  test("keeps items pinned above the first shared item in place", () => {
    // "x" was deep-linked and prepended although it is not on page one.
    const current = [item("x"), item("a"), item("b")]
    const result = mergeFreshHead(current, [item("n"), item("a")], getId)
    expect(ids(result)).toEqual(["x", "n", "a", "b"])
  })

  test("appends everything after the fresh page when nothing is shared", () => {
    const current = [item("a"), item("b")]
    expect(ids(mergeFreshHead(current, [item("n")], getId))).toEqual([
      "n",
      "a",
      "b",
    ])
  })

  test("pick can keep a copy newer than the refetch", () => {
    const current = [item("a", "realtime", 20), item("b", "b", 5)]
    const result = mergeFreshHead(
      current,
      [item("a", "stale", 10), item("b", "b2", 6)],
      getId,
      (previous, fresh) =>
        (previous.at ?? 0) > (fresh.at ?? 0) ? previous : fresh,
    )
    expect(result[0]).toBe(current[0])
    expect(result[1].text).toBe("b2")
  })

  test("an empty first page keeps the current list", () => {
    const current = [item("a")]
    expect(mergeFreshHead(current, [], getId)).toBe(current)
  })
})

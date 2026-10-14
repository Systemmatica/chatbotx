import { describe, expect, test } from "vitest"
import {
  appendColumnCards,
  mergeRefreshedColumns,
  moveCardBetweenColumns,
} from "../lib/columns"
import type {
  KanbanCardResource,
  KanbanColumnResource,
} from "../schemas/resource"

const card = (contactId: string): KanbanCardResource => ({
  contactId,
  fullName: contactId,
  avatar: null,
  channel: null,
  lastMessageAt: null,
  conversationId: null,
})

const column = (
  id: string,
  cards: KanbanCardResource[],
  total = cards.length,
): KanbanColumnResource => ({
  id,
  name: id,
  color: null,
  isNoStatus: false,
  total,
  cards,
})

describe("moveCardBetweenColumns", () => {
  test("moves the card to the top of the target column and fixes totals", () => {
    const columns = [
      column("a", [card("1"), card("2")], 10),
      column("b", [card("3")], 1),
    ]

    const next = moveCardBetweenColumns(columns, "2", "b")

    expect(next[0].cards.map((c) => c.contactId)).toEqual(["1"])
    expect(next[0].total).toBe(9)
    expect(next[1].cards.map((c) => c.contactId)).toEqual(["2", "3"])
    expect(next[1].total).toBe(2)
  })

  test("returns the same array for a no-op or unknown target", () => {
    const columns = [column("a", [card("1")]), column("b", [])]

    expect(moveCardBetweenColumns(columns, "1", "a")).toBe(columns)
    expect(moveCardBetweenColumns(columns, "1", "missing")).toBe(columns)
    expect(moveCardBetweenColumns(columns, "404", "b")).toBe(columns)
  })
})

describe("appendColumnCards", () => {
  test("appends a page without duplicating cards", () => {
    const columns = [column("a", [card("1"), card("2")], 4)]

    const next = appendColumnCards(
      columns,
      column("a", [card("2"), card("3")], 4),
    )

    expect(next[0].cards.map((c) => c.contactId)).toEqual(["1", "2", "3"])
  })
})

describe("mergeRefreshedColumns", () => {
  const ids = (columns: KanbanColumnResource[]) =>
    columns.map((item) => [item.id, item.cards.map((c) => c.contactId)])

  test("returns the current board when nothing changed", () => {
    const current = [column("a", [card("1")]), column("b", [card("2")])]
    const fresh = [column("a", [card("1")]), column("b", [card("2")])]

    expect(mergeRefreshedColumns(current, fresh, 2)).toBe(current)
  })

  test("moves cards between stages and keeps unchanged columns", () => {
    const current = [
      column("a", [card("1"), card("2")]),
      column("b", [card("3")]),
      column("c", [card("4")]),
    ]
    const fresh = [
      column("a", [card("1")]),
      column("b", [card("2"), card("3")]),
      column("c", [card("4")]),
    ]

    const next = mergeRefreshedColumns(current, fresh, 2)

    expect(ids(next)).toEqual([
      ["a", ["1"]],
      ["b", ["2", "3"]],
      ["c", ["4"]],
    ])
    expect(next[2]).toBe(current[2])
    expect(next[1].cards[1]).toBe(current[1].cards[0])
  })

  test("keeps cards loaded past the first page unless they moved", () => {
    const current = [
      column("a", [card("1"), card("2"), card("3"), card("4")], 4),
      column("b", [], 0),
    ]
    const fresh = [
      column("a", [card("new"), card("1")], 5),
      column("b", [card("4")], 1),
    ]

    const next = mergeRefreshedColumns(current, fresh, 2)

    // "2" fell off the refetched first page: it moved or left the board.
    expect(ids(next)).toEqual([
      ["a", ["new", "1", "3"]],
      ["b", ["4"]],
    ])
    expect(next[0].total).toBe(5)
  })

  test("follows added, removed and reordered stages", () => {
    const current = [column("a", [card("1")]), column("b", [card("2")])]
    const fresh = [column("c", []), column("b", [card("2")])]

    const next = mergeRefreshedColumns(current, fresh, 50)

    expect(ids(next)).toEqual([
      ["c", []],
      ["b", ["2"]],
    ])
    expect(next[1]).toBe(current[1])
  })
})

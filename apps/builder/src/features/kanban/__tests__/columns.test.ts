import { describe, expect, test } from "vitest"
import { appendColumnCards, moveCardBetweenColumns } from "../lib/columns"
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

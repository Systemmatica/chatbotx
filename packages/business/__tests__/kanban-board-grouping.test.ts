import {
  KANBAN_NO_STATUS_STAGE_ID,
  type KanbanStage,
} from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  buildKanbanColumns,
  type KanbanCardInput,
  resolveKanbanStageValue,
} from "../src/kanban-board/grouping"

const stages: KanbanStage[] = [
  { id: "new", name: "New", color: "#3b82f6" },
  { id: "won", name: "Won" },
]

const card = (contactId: string, bucket: string | null): KanbanCardInput => ({
  contactId,
  fullName: `Contact ${contactId}`,
  avatar: null,
  bucket,
  channel: "telegram",
  lastMessageAt: null,
  conversationId: null,
})

describe("buildKanbanColumns", () => {
  test("puts the virtual no-status column first, then stages in board order", () => {
    const columns = buildKanbanColumns({ stages, cards: [], counts: [] })

    expect(columns.map((column) => column.id)).toEqual([
      KANBAN_NO_STATUS_STAGE_ID,
      "new",
      "won",
    ])
    expect(columns[0]).toMatchObject({
      isNoStatus: true,
      name: null,
      total: 0,
    })
    expect(columns[1]).toMatchObject({ name: "New", color: "#3b82f6" })
    expect(columns[2]).toMatchObject({ name: "Won", color: null })
  })

  test("groups cards by exact stage value", () => {
    const columns = buildKanbanColumns({
      stages,
      cards: [card("1", "New"), card("2", "Won"), card("3", "New")],
      counts: [
        { bucket: "New", count: 2 },
        { bucket: "Won", count: 1 },
      ],
    })

    expect(columns[1].cards.map((c) => c.contactId)).toEqual(["1", "3"])
    expect(columns[1].total).toBe(2)
    expect(columns[2].cards.map((c) => c.contactId)).toEqual(["2"])
    expect(columns[0].cards).toEqual([])
  })

  test("sends empty and unknown values to the no-status column", () => {
    const columns = buildKanbanColumns({
      stages,
      cards: [card("1", null), card("2", "Lost"), card("3", "new")],
      counts: [
        { bucket: null, count: 5 },
        { bucket: "Lost", count: 1 },
      ],
    })

    expect(columns[0].cards.map((c) => c.contactId)).toEqual(["1", "2", "3"])
    expect(columns[0].total).toBe(6)
    expect(columns[1].cards).toEqual([])
  })

  test("never reports fewer than the rendered cards and strips the bucket", () => {
    const columns = buildKanbanColumns({
      stages,
      cards: [card("1", "Won"), card("2", "Won")],
      counts: [{ bucket: "Won", count: 1 }],
    })

    expect(columns[2].total).toBe(2)
    expect(columns[2].cards[0]).not.toHaveProperty("bucket")
  })
})

describe("resolveKanbanStageValue", () => {
  test("returns the stage name as the field value", () => {
    expect(resolveKanbanStageValue(stages, "won")).toBe("Won")
  })

  test("returns null for the no-status column", () => {
    expect(resolveKanbanStageValue(stages, KANBAN_NO_STATUS_STAGE_ID)).toBe(
      null,
    )
  })

  test("throws on an unknown stage id", () => {
    expect(() => resolveKanbanStageValue(stages, "missing")).toThrow()
  })
})

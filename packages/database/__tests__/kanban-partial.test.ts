import { describe, expect, test } from "vitest"
import {
  KANBAN_MAX_STAGES,
  KANBAN_NO_STATUS_STAGE_ID,
  kanbanStagesSchema,
} from "../src/partials/kanban"

describe("kanbanStagesSchema", () => {
  test("accepts ordered stages and trims names", () => {
    const parsed = kanbanStagesSchema.parse([
      { id: "a", name: "  New lead ", color: "#22c55e" },
      { id: "b", name: "Won" },
    ])

    expect(parsed).toEqual([
      { id: "a", name: "New lead", color: "#22c55e" },
      { id: "b", name: "Won" },
    ])
  })

  test("rejects duplicate stage ids", () => {
    const result = kanbanStagesSchema.safeParse([
      { id: "a", name: "New" },
      { id: "a", name: "Won" },
    ])

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual([1, "id"])
  })

  test("rejects duplicate stage names", () => {
    const result = kanbanStagesSchema.safeParse([
      { id: "a", name: "New" },
      { id: "b", name: " New " },
    ])

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual([1, "name"])
  })

  test("rejects empty or blank names", () => {
    expect(kanbanStagesSchema.safeParse([{ id: "a", name: "" }]).success).toBe(
      false,
    )
    expect(
      kanbanStagesSchema.safeParse([{ id: "a", name: "   " }]).success,
    ).toBe(false)
  })

  test("rejects an empty list, too many stages and the reserved id", () => {
    expect(kanbanStagesSchema.safeParse([]).success).toBe(false)
    expect(
      kanbanStagesSchema.safeParse(
        Array.from({ length: KANBAN_MAX_STAGES + 1 }, (_, index) => ({
          id: `s${index}`,
          name: `Stage ${index}`,
        })),
      ).success,
    ).toBe(false)
    expect(
      kanbanStagesSchema.safeParse([
        { id: KANBAN_NO_STATUS_STAGE_ID, name: "New" },
      ]).success,
    ).toBe(false)
  })

  test("rejects colors that are not 6-digit hex", () => {
    expect(
      kanbanStagesSchema.safeParse([{ id: "a", name: "New", color: "red" }])
        .success,
    ).toBe(false)
  })

  test("keeps final outcome and blocked markers", () => {
    const parsed = kanbanStagesSchema.parse([
      { id: "a", name: "Won", outcome: "won" },
      { id: "b", name: "Blocked", outcome: "lost", matchBlocked: true },
    ])

    expect(parsed[0]?.outcome).toBe("won")
    expect(parsed[1]).toMatchObject({ outcome: "lost", matchBlocked: true })
  })

  test("allows only one stage that collects blocked contacts", () => {
    const result = kanbanStagesSchema.safeParse([
      { id: "a", name: "Blocked", matchBlocked: true },
      { id: "b", name: "Also blocked", matchBlocked: true },
    ])

    expect(result.success).toBe(false)
    expect(result.error?.issues[0]?.path).toEqual([1, "matchBlocked"])
  })
})

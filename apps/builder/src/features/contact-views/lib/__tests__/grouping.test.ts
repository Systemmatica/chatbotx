import { describe, expect, it } from "vitest"
import {
  countsByGroupKey,
  EMPTY_GROUP_KEY,
  type GroupingRow,
  groupBySignature,
  groupKeysForRow,
  groupRows,
  visibleRowIds,
} from "../grouping"

const row = (
  id: string,
  extra: Partial<Omit<GroupingRow, "id">> = {},
): GroupingRow => ({ id, ...extra })
const field = (customFieldId: string, value: string) => ({
  customFieldId,
  value,
})

describe("custom field grouping", () => {
  const groupBy = { kind: "customField" as const, customFieldId: "5" }

  it("groups by value with blanks in the empty group, sorted naturally", () => {
    const rows = [
      row("1", { contactCustomFields: [field("5", "10")] }),
      row("2", { contactCustomFields: [field("5", "9")] }),
      row("3", { contactCustomFields: [field("5", "  ")] }),
      row("4"),
      row("5", { contactCustomFields: [field("5", "9")] }),
    ]
    const groups = groupRows(rows, groupBy, {})
    expect(groups.map((group) => group.key)).toEqual([
      "9",
      "10",
      EMPTY_GROUP_KEY,
    ])
    expect(groups[0]?.rows.map((r) => r.id)).toEqual(["2", "5"])
    expect(groups[2]?.rows.map((r) => r.id)).toEqual(["3", "4"])
  })
})

describe("stage grouping", () => {
  const groupBy = { kind: "stage" as const, boardId: "1" }
  const context = {
    board: {
      customFieldId: "7",
      stages: [
        { name: "New" },
        { name: "Won" },
        { name: "Blocked", matchBlocked: true },
      ],
    },
  }

  it("maps values like the board: unknown → no status, blocked → blocked", () => {
    expect(
      groupKeysForRow(
        row("1", { contactCustomFields: [field("7", "Won")] }),
        groupBy,
        context,
      ),
    ).toEqual(["Won"])
    expect(
      groupKeysForRow(
        row("2", { contactCustomFields: [field("7", "Old stage")] }),
        groupBy,
        context,
      ),
    ).toEqual([EMPTY_GROUP_KEY])
    expect(
      groupKeysForRow(
        row("3", {
          blockedAt: new Date(),
          contactCustomFields: [field("7", "Won")],
        }),
        groupBy,
        context,
      ),
    ).toEqual(["Blocked"])
  })

  it("orders groups like the board columns, no status first", () => {
    const rows = [
      row("1", { contactCustomFields: [field("7", "Won")] }),
      row("2"),
      row("3", { contactCustomFields: [field("7", "New")] }),
    ]
    expect(groupRows(rows, groupBy, context).map((g) => g.key)).toEqual([
      EMPTY_GROUP_KEY,
      "New",
      "Won",
    ])
  })

  it("puts everyone in the empty group when the board is gone", () => {
    expect(groupKeysForRow(row("1"), groupBy, {})).toEqual([EMPTY_GROUP_KEY])
  })
})

describe("lead magnet grouping", () => {
  const groupBy = { kind: "leadMagnet" as const }
  const context = {
    leadMagnets: [
      { id: "lm1", tagId: "t1" },
      { id: "lm2", tagId: "t2" },
      { id: "lm3", tagId: null },
    ],
  }

  it("lists a contact under each lead magnet it received", () => {
    const rows = [
      row("1", { tags: [{ id: "t2" }, { id: "t1" }, { id: "other" }] }),
      row("2", { tags: [{ id: "other" }] }),
      row("3", { tags: [{ id: "t2" }] }),
    ]
    const groups = groupRows(rows, groupBy, context)
    expect(groups.map((g) => [g.key, g.rows.map((r) => r.id)])).toEqual([
      ["lm1", ["1"]],
      ["lm2", ["1", "3"]],
      [EMPTY_GROUP_KEY, ["2"]],
    ])
    // ↑/↓ in the peek visits a contact once, skipping collapsed groups.
    expect(visibleRowIds(groups, new Set())).toEqual(["1", "3", "2"])
    expect(visibleRowIds(groups, new Set(["lm1"]))).toEqual(["1", "3", "2"])
    expect(visibleRowIds(groups, new Set(["lm2", "lm1"]))).toEqual(["2"])
  })
})

describe("countsByGroupKey", () => {
  it("folds the server's null and blank keys into the empty group", () => {
    const counts = countsByGroupKey([
      { key: null, count: 3 },
      { key: "", count: 2 },
      { key: "A", count: 5 },
    ])
    expect(counts.get(EMPTY_GROUP_KEY)).toBe(5)
    expect(counts.get("A")).toBe(5)
  })
})

describe("groupBySignature", () => {
  it("differs per field and board", () => {
    expect(
      groupBySignature({ kind: "customField", customFieldId: "1" }),
    ).not.toBe(groupBySignature({ kind: "customField", customFieldId: "2" }))
    expect(groupBySignature({ kind: "stage", boardId: "1" })).toBe("stage:1")
    expect(groupBySignature({ kind: "leadMagnet" })).toBe("leadMagnet")
  })
})

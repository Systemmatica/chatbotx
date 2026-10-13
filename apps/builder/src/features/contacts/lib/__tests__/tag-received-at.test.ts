import { describe, expect, test } from "vitest"
import {
  getSingleTagFilterId,
  isSortedByTagReceivedAt,
} from "../tag-received-at"

const tags = (operator: string, value: unknown) => ({
  field: "tags",
  operator,
  value,
})

describe("getSingleTagFilterId", () => {
  test("returns the tag of a single `tags in [one]` condition", () => {
    expect(
      getSingleTagFilterId({
        operator: "and",
        conditions: [tags("in", ["42"])],
      }),
    ).toBe("42")
  })

  test("accepts eq and a scalar value", () => {
    expect(getSingleTagFilterId({ conditions: [tags("eq", "7")] })).toBe("7")
  })

  test("unwraps a single condition inside a group", () => {
    expect(
      getSingleTagFilterId({
        conditions: [
          { type: "group", operator: "or", conditions: [tags("in", ["9"])] },
        ],
      }),
    ).toBe("9")
  })

  test.each([
    ["no filter", undefined],
    ["empty filter", { conditions: [] }],
    ["several tags", { conditions: [tags("in", ["1", "2"])] }],
    ["negated tag", { conditions: [tags("notIn", ["1"])] }],
    ["is empty", { conditions: [tags("isEmpty", undefined)] }],
    [
      "other field",
      { conditions: [{ field: "source", operator: "in", value: ["x"] }] },
    ],
    [
      "tag plus another condition",
      {
        conditions: [
          tags("in", ["1"]),
          { field: "source", operator: "in", value: ["x"] },
        ],
      },
    ],
    ["empty tag id", { conditions: [tags("in", [""])] }],
  ])("returns null for %s", (_, filter) => {
    expect(getSingleTagFilterId(filter)).toBeNull()
  })
})

describe("isSortedByTagReceivedAt", () => {
  test("detects the received-date sort as the primary key", () => {
    expect(
      isSortedByTagReceivedAt([{ id: "tagReceivedAt", desc: true }]),
    ).toEqual({ desc: true })
  })

  test("ignores other or secondary sorts", () => {
    expect(isSortedByTagReceivedAt(undefined)).toBeNull()
    expect(
      isSortedByTagReceivedAt([
        { id: "createdAt", desc: true },
        { id: "tagReceivedAt", desc: false },
      ]),
    ).toBeNull()
  })
})

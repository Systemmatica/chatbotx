// @vitest-environment node

import {
  contactFilterFields,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { pruneExcludedConditions } from "@/features/contact-filter/lib/prune-conditions"
import {
  type ContactFilterItem,
  contactFilterCriteriaSchema,
  countContactFilterLeafConditions,
  getContactFilterLeafConditions,
  isContactFilterGroupItem,
} from "@/features/contact-filter/schemas"

const nameContains = {
  field: "fullName",
  operator: operatorTypes.enum.contains,
  value: "Ada",
}
const emailContains = {
  field: "email",
  operator: operatorTypes.enum.contains,
  value: "ada@",
}
const inboxIn = {
  field: "inbox",
  operator: operatorTypes.enum.in,
  value: ["inbox-1"],
}

describe("contactFilterCriteriaSchema — groups", () => {
  test("legacy flat filters stay valid and unchanged", () => {
    const legacy = {
      operator: "or",
      conditions: [nameContains, emailContains],
      timezone: "Asia/Ho_Chi_Minh",
    }

    const parsed = contactFilterCriteriaSchema.safeParse(legacy)
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual(legacy)
  })

  test("accepts groups mixed with top-level conditions", () => {
    const filter = {
      operator: "and",
      conditions: [
        {
          type: "group",
          operator: "or",
          conditions: [nameContains, emailContains],
        },
        inboxIn,
        { type: "group", operator: "and", conditions: [] },
      ],
    }

    const parsed = contactFilterCriteriaSchema.safeParse(filter)
    expect(parsed.success).toBe(true)
    expect(parsed.data).toEqual(filter)
  })

  test("rejects groups nested inside a group (one level only)", () => {
    expect(
      contactFilterCriteriaSchema.safeParse({
        operator: "and",
        conditions: [
          {
            type: "group",
            operator: "or",
            conditions: [
              nameContains,
              { type: "group", operator: "and", conditions: [emailContains] },
            ],
          },
        ],
      }).success,
    ).toBe(false)
  })

  test("rejects invalid conditions and operators inside a group", () => {
    expect(
      contactFilterCriteriaSchema.safeParse({
        operator: "and",
        conditions: [
          {
            type: "group",
            operator: "xor",
            conditions: [nameContains],
          },
        ],
      }).success,
    ).toBe(false)

    expect(
      contactFilterCriteriaSchema.safeParse({
        operator: "and",
        conditions: [
          {
            type: "group",
            operator: "or",
            conditions: [{ field: "fullName", operator: "nope", value: "x" }],
          },
        ],
      }).success,
    ).toBe(false)
  })
})

describe("contact filter group helpers", () => {
  const items = [
    nameContains,
    { type: "group", operator: "or", conditions: [emailContains, inboxIn] },
    { type: "group", operator: "and", conditions: [] },
  ] as ContactFilterItem[]

  test("isContactFilterGroupItem / leaf conditions / count", () => {
    expect(items.map(isContactFilterGroupItem)).toEqual([false, true, true])
    expect(getContactFilterLeafConditions({ conditions: items })).toEqual([
      nameContains,
      emailContains,
      inboxIn,
    ])
    expect(countContactFilterLeafConditions({ conditions: items })).toBe(3)
    expect(countContactFilterLeafConditions(null)).toBe(0)
  })

  test("pruneExcludedConditions prunes inside groups and keeps reference when unchanged", () => {
    expect(
      pruneExcludedConditions(items, [contactFilterFields.enum.phone]),
    ).toBe(items)

    expect(
      pruneExcludedConditions(
        [
          ...items,
          { type: "group", operator: "or", conditions: [inboxIn] },
        ] as ContactFilterItem[],
        [contactFilterFields.enum.inbox],
      ),
    ).toEqual([
      nameContains,
      { type: "group", operator: "or", conditions: [emailContains] },
      // An already-empty group is kept; one emptied by pruning is dropped.
      { type: "group", operator: "and", conditions: [] },
    ])
  })
})

import { relationsFilterToSQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { operatorTypes } from "../src/partials"
import {
  applyContactFilter,
  buildContactInboxContactFilterSQL,
  contactFilterHasPredicate,
} from "../src/queries/contact-filter"
import { parseFlowNodeValue } from "../src/queries/contact-filter/flow-position"
import { contactInboxModel, contactModel } from "../src/schema"

const render = (
  condition: Record<string, unknown>,
  operator: "and" | "or" = "and",
) => {
  const where = applyContactFilter({ operator, conditions: [condition] })
  const sqlWhere = relationsFilterToSQL(contactModel, where as never)
  if (!sqlWhere) {
    throw new Error("Expected contact filter to render SQL")
  }
  return new PgDialect().sqlToQuery(sqlWhere)
}

const squash = (text: string) => text.replace(/\s+/g, " ").trim()

const LATEST_POSITION_SUBQUERY =
  squash(`SELECT "ContactInbox"."currentFlowId" AS "flowId", "ContactInbox"."currentNodeId" AS "nodeId"
  FROM "ContactInbox"
  WHERE "ContactInbox"."contactId" = "Contact"."id"
    AND "ContactInbox"."currentNodeAt" IS NOT NULL
  ORDER BY "ContactInbox"."currentNodeAt" DESC
  LIMIT 1`)

describe("currentFlow filter", () => {
  test("is: EXISTS over the contact's latest recorded position", () => {
    const query = render({
      field: "currentFlow",
      operator: operatorTypes.enum.eq,
      value: "42",
    })

    const sqlText = squash(query.sql)
    expect(sqlText.startsWith("EXISTS (SELECT 1 FROM (")).toBe(true)
    expect(sqlText).toContain(LATEST_POSITION_SUBQUERY)
    expect(sqlText).toContain(
      `AS "currentPosition" WHERE "currentPosition"."flowId" = $1::int8`,
    )
    expect(query.params).toEqual(["42"])
  })

  test("is not: NOT EXISTS, so contacts with no position also match", () => {
    const query = render({
      field: "currentFlow",
      operator: operatorTypes.enum.ne,
      value: "42",
    })

    const sqlText = squash(query.sql)
    expect(sqlText.startsWith("NOT EXISTS (SELECT 1 FROM (")).toBe(true)
    expect(sqlText).toContain(`"currentPosition"."flowId" = $1::int8`)
    expect(query.params).toEqual(["42"])
  })

  test.each([
    ["non-numeric id", "abc"],
    ["array value", ["42"]],
    ["empty value", ""],
    ["missing value", undefined],
  ])("fails closed on %s", (_label, value) => {
    for (const operator of [operatorTypes.enum.eq, operatorTypes.enum.ne]) {
      const query = render({ field: "currentFlow", operator, value })
      expect(query.sql).toBe("FALSE")
      expect(query.params).toEqual([])
    }
  })

  test.each([
    operatorTypes.enum.in,
    operatorTypes.enum.gt,
    operatorTypes.enum.contains,
    operatorTypes.enum.isEmpty,
  ])("ignores unsupported operator %s", (operator) => {
    const criteria = {
      operator: "and" as const,
      conditions: [{ field: "currentFlow", operator, value: "42" }],
    }
    expect(applyContactFilter(criteria)).toEqual({})
    expect(contactFilterHasPredicate(criteria)).toBe(false)
  })
})

describe("currentFlowNode filter", () => {
  test("is: flow and node of the latest position", () => {
    const query = render({
      field: "currentFlowNode",
      operator: operatorTypes.enum.eq,
      value: ["42", "node-abc"],
    })

    const sqlText = squash(query.sql)
    expect(sqlText.startsWith("EXISTS (SELECT 1 FROM (")).toBe(true)
    expect(sqlText).toContain(LATEST_POSITION_SUBQUERY)
    expect(sqlText).toContain(
      `WHERE "currentPosition"."flowId" = $1::int8 AND "currentPosition"."nodeId" = $2`,
    )
    expect(query.params).toEqual(["42", "node-abc"])
  })

  test("is not: NOT EXISTS of the same predicate", () => {
    const query = render({
      field: "currentFlowNode",
      operator: operatorTypes.enum.ne,
      value: ["42", "node-abc"],
    })

    expect(squash(query.sql).startsWith("NOT EXISTS (SELECT 1 FROM (")).toBe(
      true,
    )
    expect(query.params).toEqual(["42", "node-abc"])
  })

  test.each([
    ["plain string", "42:node-abc"],
    ["one element", ["42"]],
    ["three elements", ["42", "node-abc", "x"]],
    ["non-numeric flow id", ["flow", "node-abc"]],
    ["blank node id", ["42", " "]],
  ])("fails closed on %s", (_label, value) => {
    const query = render({
      field: "currentFlowNode",
      operator: operatorTypes.enum.eq,
      value,
    })
    expect(query.sql).toBe("FALSE")
  })

  test("ignores unsupported operators", () => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "currentFlowNode",
            operator: operatorTypes.enum.in,
            value: ["42", "node-abc"],
          },
        ],
      }),
    ).toEqual({})
  })

  test("parseFlowNodeValue", () => {
    expect(parseFlowNodeValue(["7", "a:b"])).toEqual({
      flowId: "7",
      nodeId: "a:b",
    })
    expect(parseFlowNodeValue(["7"])).toBeUndefined()
    expect(parseFlowNodeValue("7:a")).toBeUndefined()
  })
})

describe("currentNodeMinutesAgo filter", () => {
  test("gt: latest currentNodeAt older than N minutes", () => {
    const query = render({
      field: "currentNodeMinutesAgo",
      operator: operatorTypes.enum.gt,
      value: "120",
    })

    const sqlText = squash(query.sql)
    expect(sqlText).toContain(
      `SELECT MAX("ContactInbox"."currentNodeAt") AS "latest" FROM "ContactInbox" WHERE "ContactInbox"."contactId" = "Contact"."id"`,
    )
    expect(sqlText).toContain(
      `WHERE "latestInteraction"."latest" < NOW() - make_interval(mins => $1)`,
    )
    expect(query.params).toEqual([120])
  })

  test("lt / eq / between / isEmpty", () => {
    expect(
      squash(
        render({
          field: "currentNodeMinutesAgo",
          operator: operatorTypes.enum.lt,
          value: "30",
        }).sql,
      ),
    ).toContain(`"latestInteraction"."latest" > NOW() - make_interval(mins =>`)

    const eq = render({
      field: "currentNodeMinutesAgo",
      operator: operatorTypes.enum.eq,
      value: "5",
    })
    expect(eq.params).toEqual([5, 6])

    const between = render({
      field: "currentNodeMinutesAgo",
      operator: operatorTypes.enum.isBetween,
      value: ["60", "180"],
    })
    expect(between.params).toEqual([180, 60])

    expect(
      squash(
        render({
          field: "currentNodeMinutesAgo",
          operator: operatorTypes.enum.isEmpty,
        }).sql,
      ),
    ).toContain(`WHERE "latestInteraction"."latest" IS NULL`)
  })

  test("drops non-integer values like the other *MinutesAgo fields", () => {
    expect(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            field: "currentNodeMinutesAgo",
            operator: operatorTypes.enum.gt,
            value: "1.5",
          },
        ],
      }),
    ).toEqual({})
  })
})

describe("flow position in a contact-inbox audience (broadcasts)", () => {
  test("stuck on a node for more than N minutes renders both predicates", () => {
    const query = new PgDialect().sqlToQuery(
      buildContactInboxContactFilterSQL({
        contactIdColumn: contactInboxModel.contactId,
        workspaceId: "9",
        contactFilter: {
          operator: "and",
          conditions: [
            {
              field: "currentFlowNode",
              operator: operatorTypes.enum.eq,
              value: ["42", "node-abc"],
            },
            {
              field: "currentNodeMinutesAgo",
              operator: operatorTypes.enum.gt,
              value: "180",
            },
          ],
        },
      }),
    )

    const sqlText = squash(query.sql)
    expect(sqlText).toContain(
      `"ContactInbox"."contactId" IN (SELECT "Contact"."id" FROM "Contact" WHERE`,
    )
    expect(sqlText).toContain(`"currentPosition"."nodeId" = $`)
    expect(sqlText).toContain(`MAX("ContactInbox"."currentNodeAt")`)
    expect(query.params).toEqual(["9", "42", "node-abc", 180])
  })

  test("a malformed flow id in an audience yields an empty audience", () => {
    const query = new PgDialect().sqlToQuery(
      buildContactInboxContactFilterSQL({
        contactIdColumn: contactInboxModel.contactId,
        workspaceId: "9",
        contactFilter: {
          operator: "and",
          conditions: [
            {
              field: "currentFlow",
              operator: operatorTypes.enum.eq,
              value: "drop table",
            },
          ],
        },
      }),
    )

    expect(squash(query.sql)).toContain("and (FALSE)")
  })
})

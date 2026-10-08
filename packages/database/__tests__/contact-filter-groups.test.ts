import { relationsFilterToSQL, sql } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { operatorTypes } from "../src/partials"
import {
  applyContactFilter,
  buildContactInboxContactFilterSQL,
  type ContactFilterCriteriaInput,
  contactFilterHasPredicate,
  countContactFilterConditions,
  flattenContactFilterConditions,
  isContactFilterGroup,
  pruneContactFilterFields,
} from "../src/queries/contact-filter"
import { contactInboxModel, contactModel } from "../src/schema"

const dialect = new PgDialect()
const GROUPED_OR_THEN_AND =
  /\(\(.*"contact"\."fullname" ilike.*\) or \(.*"contact"\."email" ilike.*\)\) and \(.*"contact"\."country" =/
const TWO_GROUPS_OR = /\)\) or \(\(/

const render = (where: Record<string, unknown>) => {
  const sqlWhere = relationsFilterToSQL(contactModel, where as never)
  if (!sqlWhere) {
    throw new Error("Expected contact filter to render SQL")
  }
  return dialect.sqlToQuery(sqlWhere)
}

const nameIs = (value: string) => ({
  field: "fullName",
  operator: operatorTypes.enum.eq,
  value,
})
const emailIs = (value: string) => ({
  field: "email",
  operator: operatorTypes.enum.eq,
  value,
})
const countryIs = (value: string) => ({
  field: "country",
  operator: operatorTypes.enum.eq,
  value,
})

const single = (condition: Record<string, unknown>) =>
  (
    applyContactFilter({ operator: "and", conditions: [condition] }) as {
      AND: unknown[]
    }
  ).AND[0] as Record<string, unknown>

// Fields like fullName compile to RAW closures, so compare rendered SQL rather
// than object identity.
const expectSameSql = (
  actual: Record<string, unknown>,
  expected: Record<string, unknown>,
) => {
  expect(render(actual)).toEqual(render(expected))
}

describe("contact filter groups — backward compatibility", () => {
  test("a legacy flat filter compiles exactly as before (no group wrapping)", () => {
    const where = applyContactFilter({
      operator: "or",
      conditions: [nameIs("Ada"), emailIs("a@b.co")],
    })
    expect(Object.keys(where)).toEqual(["OR"])
    expectSameSql(where, {
      OR: [single(nameIs("Ada")), single(emailIs("a@b.co"))],
    })
  })

  test("a single group equivalent to a flat filter renders the same params", () => {
    const flat = render(
      applyContactFilter({
        operator: "and",
        conditions: [nameIs("Ada"), emailIs("a@b.co")],
      }),
    )
    const grouped = render(
      applyContactFilter({
        operator: "and",
        conditions: [
          {
            type: "group",
            operator: "and",
            conditions: [nameIs("Ada"), emailIs("a@b.co")],
          },
        ],
      }),
    )

    expect(grouped.params).toEqual(flat.params)
  })
})

describe("contact filter groups — SQL", () => {
  test("(A OR B) AND C renders the group in parentheses", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          type: "group",
          operator: "or",
          conditions: [nameIs("Ada"), emailIs("a@b.co")],
        },
        countryIs("VN"),
      ],
    })

    expectSameSql(where, {
      AND: [
        { OR: [single(nameIs("Ada")), single(emailIs("a@b.co"))] },
        single(countryIs("VN")),
      ],
    })

    const query = render(where)
    const text = query.sql.toLowerCase()
    expect(query.params).toEqual(["Ada", "a@b.co", "VN"])
    // The group's OR is wrapped in its own parentheses and AND-ed with C.
    expect(text).toMatch(GROUPED_OR_THEN_AND)
  })

  test("(A AND B) OR (C AND D) keeps each group's operator", () => {
    const where = applyContactFilter({
      operator: "or",
      conditions: [
        {
          type: "group",
          operator: "and",
          conditions: [nameIs("Ada"), emailIs("a@b.co")],
        },
        {
          type: "group",
          operator: "and",
          conditions: [countryIs("VN"), nameIs("Bob")],
        },
      ],
    })

    expectSameSql(where, {
      OR: [
        { AND: [single(nameIs("Ada")), single(emailIs("a@b.co"))] },
        { AND: [single(countryIs("VN")), single(nameIs("Bob"))] },
      ],
    })
    const query = render(where)
    expect(query.sql.toLowerCase()).toMatch(TWO_GROUPS_OR)
    expect(query.params).toEqual(["Ada", "a@b.co", "VN", "Bob"])
  })

  test("empty groups and groups of unknown fields are dropped", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        { type: "group", operator: "or", conditions: [] },
        {
          type: "group",
          operator: "or",
          conditions: [{ field: "nope", operator: "eq", value: "x" }],
        },
        nameIs("Ada"),
      ],
    })
    expect((where as { AND: unknown[] }).AND).toHaveLength(1)
    expectSameSql(where, { AND: [single(nameIs("Ada"))] })
  })

  test("groups nested inside a group are ignored (one level only)", () => {
    const where = applyContactFilter({
      operator: "and",
      conditions: [
        {
          type: "group",
          operator: "or",
          conditions: [
            nameIs("Ada"),
            { type: "group", operator: "and", conditions: [emailIs("x@y.z")] },
          ],
        },
      ],
    })

    expect(render(where).params).toEqual(["Ada"])
  })

  test("a filter with only empty groups is a no-op (TRUE) for ContactInbox SQL", () => {
    const onlyEmptyGroup: ContactFilterCriteriaInput = {
      operator: "and",
      conditions: [{ type: "group", operator: "and", conditions: [] }],
    }

    expect(applyContactFilter(onlyEmptyGroup)).toEqual({})
    expect(contactFilterHasPredicate(onlyEmptyGroup)).toBe(false)
    expect(
      dialect.sqlToQuery(
        buildContactInboxContactFilterSQL({
          contactIdColumn: contactInboxModel.contactId,
          workspaceId: "ws-1",
          contactFilter: onlyEmptyGroup,
        }),
      ),
    ).toEqual(dialect.sqlToQuery(sql`TRUE`))
  })

  test("buildContactInboxContactFilterSQL embeds grouped predicates", () => {
    const rendered = dialect.sqlToQuery(
      buildContactInboxContactFilterSQL({
        contactIdColumn: contactInboxModel.contactId,
        workspaceId: "ws-1",
        contactFilter: {
          operator: "and",
          conditions: [
            {
              type: "group",
              operator: "or",
              conditions: [nameIs("Ada"), emailIs("a@b.co")],
            },
          ],
        },
      }),
    )

    expect(rendered.sql.toLowerCase()).toContain(" or ")
    expect(rendered.params).toEqual(
      expect.arrayContaining(["ws-1", "Ada", "a@b.co"]),
    )
  })
})

describe("contact filter groups — helpers", () => {
  const filter: ContactFilterCriteriaInput = {
    operator: "and",
    conditions: [
      nameIs("Ada"),
      {
        type: "group",
        operator: "or",
        conditions: [emailIs("e"), nameIs("B")],
      },
      { type: "group", operator: "or", conditions: [] },
    ],
  }

  test("isContactFilterGroup", () => {
    expect(isContactFilterGroup(filter.conditions[1])).toBe(true)
    expect(isContactFilterGroup(filter.conditions[0])).toBe(false)
    expect(isContactFilterGroup(null)).toBe(false)
    expect(isContactFilterGroup({ type: "group" })).toBe(false)
  })

  test("flatten / count leaf conditions", () => {
    expect(flattenContactFilterConditions(filter)).toEqual([
      nameIs("Ada"),
      emailIs("e"),
      nameIs("B"),
    ])
    expect(countContactFilterConditions(filter)).toBe(3)
    expect(countContactFilterConditions(undefined)).toBe(0)
  })

  test("pruneContactFilterFields prunes inside groups and drops emptied groups", () => {
    expect(
      pruneContactFilterFields(
        {
          operator: "or",
          timezone: "Asia/Ho_Chi_Minh",
          conditions: [
            emailIs("top"),
            { type: "group", operator: "and", conditions: [emailIs("e")] },
            {
              type: "group",
              operator: "and",
              conditions: [emailIs("e"), nameIs("Ada")],
            },
            { type: "group", operator: "and", conditions: [] },
          ],
        },
        ["email"],
      ),
    ).toEqual({
      operator: "or",
      timezone: "Asia/Ho_Chi_Minh",
      conditions: [
        { type: "group", operator: "and", conditions: [nameIs("Ada")] },
        { type: "group", operator: "and", conditions: [] },
      ],
    })
  })
})

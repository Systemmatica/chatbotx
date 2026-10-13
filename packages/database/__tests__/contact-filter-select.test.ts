import type { SQL } from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, test } from "vitest"
import { operatorTypes } from "../src/partials"
import { applyContactFilter } from "../src/queries/contact-filter"
import { contactModel } from "../src/schema"

const renderSelectCondition = (condition: Record<string, unknown>) => {
  const where = applyContactFilter({
    operator: "and",
    conditions: [{ field: "customField", customFieldId: "cf-1", ...condition }],
  })
  const raw = (where as { AND?: Array<{ RAW?: unknown }> }).AND?.[0]?.RAW
  if (typeof raw !== "function") {
    return
  }
  return new PgDialect().sqlToQuery(
    (raw as (table: typeof contactModel) => SQL)(contactModel),
  )
}

describe("select custom field filter", () => {
  test("eq on a select field compares the stored label exactly", () => {
    const query = renderSelectCondition({
      customFieldType: "select",
      valueType: "select",
      operator: operatorTypes.enum.eq,
      value: "Hot",
    })
    expect(query?.sql).toContain('"ContactCustomField"."value" = ANY(ARRAY[')
    expect(query?.sql).not.toContain("NOT EXISTS")
    expect(query?.params).toContain("Hot")
  })

  test("ne negates the EXISTS so contacts without a value match too", () => {
    const query = renderSelectCondition({
      customFieldType: "select",
      valueType: "select",
      operator: operatorTypes.enum.ne,
      value: "Hot",
    })
    expect(query?.sql).toContain("NOT EXISTS")
  })

  test("in matches any of the selected labels", () => {
    const query = renderSelectCondition({
      customFieldType: "select",
      valueType: "multiSelect",
      operator: operatorTypes.enum.in,
      value: ["Hot", "Cold"],
    })
    expect(query?.params).toEqual(expect.arrayContaining(["Hot", "Cold"]))
    expect(query?.sql).not.toContain("NOT EXISTS")
  })

  test("notIn negates the any-of match", () => {
    const query = renderSelectCondition({
      customFieldType: "select",
      valueType: "multiSelect",
      operator: operatorTypes.enum.notIn,
      value: ["Hot"],
    })
    expect(query?.sql).toContain("NOT EXISTS")
  })

  test("multiSelect matches individual comma-separated labels", () => {
    const query = renderSelectCondition({
      customFieldType: "multiSelect",
      valueType: "multiSelect",
      operator: operatorTypes.enum.in,
      value: ["Hot"],
    })
    expect(query?.sql).toContain("string_to_array")
    expect(query?.sql).toContain("btrim(part)")
  })

  test("an empty value list produces no predicate", () => {
    expect(
      renderSelectCondition({
        customFieldType: "select",
        valueType: "multiSelect",
        operator: operatorTypes.enum.in,
        value: [],
      }),
    ).toBeUndefined()
  })

  test("text operators are not applied to select fields", () => {
    expect(
      renderSelectCondition({
        customFieldType: "select",
        valueType: "select",
        operator: operatorTypes.enum.contains,
        value: "Ho",
      }),
    ).toBeUndefined()
  })
})

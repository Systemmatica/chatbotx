// @vitest-environment node

import { operatorTypes } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  type FieldConfig,
  getFieldConfigs,
} from "@/features/contact-filter/components/contact-filter-config"
import {
  customFieldOperatorRequiresArrayValue,
  getCustomFieldConditionOptions,
  getCustomFieldValueInputConfig,
} from "@/features/contact-filter/components/custom-field-filter-config"
import { customFieldConditionSchema } from "@/features/contact-filter/schemas"

const options = [
  { id: "1", label: "Hot", color: "red" as const },
  { id: "2", label: "Cold", color: "blue" as const },
]

const selectConfig = (type: "select" | "multiSelect"): FieldConfig => {
  const config = getFieldConfigs({
    t: (key: string) => key,
    tagOptions: [],
    inboxOptions: [],
    flowVersionOptions: [],
    customFields: [{ id: "cf-1", name: "Temperature", type, options }],
  }).find((item) => item.customFieldId === "cf-1")
  if (!config) {
    throw new Error("custom field config missing")
  }
  return config
}

describe("select custom field filter config", () => {
  test("exposes options as label values with colors", () => {
    const config = selectConfig("select")
    expect(config.options?.map((option) => option.value)).toEqual([
      "Hot",
      "Cold",
    ])
    expect(config.options?.[0]?.style?.badgeColor).toBe("var(--label-red-bg)")
  })

  test.each([
    "select",
    "multiSelect",
  ] as const)("%s enables is / is not / any of / none of", (type) => {
    const enabled = getCustomFieldConditionOptions(
      selectConfig(type),
      [],
    ).filter((option) => !option.disabled)
    expect(enabled.map((option) => option.value)).toEqual([
      operatorTypes.enum.eq,
      operatorTypes.enum.ne,
      operatorTypes.enum.in,
      operatorTypes.enum.notIn,
      operatorTypes.enum.isNotEmpty,
      operatorTypes.enum.isEmpty,
    ])
  })

  test("uses a single select for eq and a multi select for in", () => {
    const config = selectConfig("select")
    expect(getCustomFieldValueInputConfig(config, "eq")).toEqual({
      kind: "select",
      defaultValue: "",
    })
    expect(getCustomFieldValueInputConfig(config, "in")).toEqual({
      kind: "multiSelect",
      defaultValue: [],
    })
    expect(customFieldOperatorRequiresArrayValue("notIn")).toBe(true)
  })
})

describe("select custom field condition schema", () => {
  const base = {
    field: "customField" as const,
    customFieldId: "cf-1",
    customFieldType: "select" as const,
    valueType: "select" as const,
  }

  test("accepts eq with one label and in with several", () => {
    expect(
      customFieldConditionSchema.safeParse({
        ...base,
        operator: "eq",
        value: "Hot",
      }).success,
    ).toBe(true)
    expect(
      customFieldConditionSchema.safeParse({
        ...base,
        operator: "in",
        value: ["Hot", "Cold", "Warm"],
      }).success,
    ).toBe(true)
  })

  test("rejects an empty any-of list and text operators", () => {
    expect(
      customFieldConditionSchema.safeParse({
        ...base,
        operator: "notIn",
        value: [],
      }).success,
    ).toBe(false)
    expect(
      customFieldConditionSchema.safeParse({
        ...base,
        operator: "contains",
        value: "Ho",
      }).success,
    ).toBe(false)
  })
})

// @vitest-environment node

import { formFieldTypes, operatorTypes } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import {
  type FieldConfig,
  formatFieldConditionValue,
  getConditionOptions,
  getFieldConfigs,
} from "@/features/contact-filter/components/contact-filter-config"
import {
  getDefaultStaticFieldValue,
  getStaticFieldConditionOptions,
  getStaticFieldValueInputConfig,
  staticFieldOperatorRequiresArrayValue,
} from "@/features/contact-filter/components/static-field-filter-config"
import {
  buildFlowNodeOptionTree,
  pickPositionFlowVersion,
} from "@/features/contact-filter/lib/flow-node-options"
import { singleContactFilterConditionSchema } from "@/features/contact-filter/schemas"
import { staticFieldFilter } from "@/features/contact-filter/schemas/static-field-filter"

const t = ((key: string) => key) as Parameters<
  typeof buildFlowNodeOptionTree
>[1]
const conditionOptions = getConditionOptions((key) => key)

const ALL_OPERATORS = operatorTypes.options

const enabledOperators = (config: FieldConfig) =>
  getStaticFieldConditionOptions(config, conditionOptions)
    .filter((option) => !option.disabled)
    .map((option) => option.value)
    .sort()

const zodAcceptedOperators = (
  field: string,
  valueFor: (operator: string) => unknown,
) =>
  ALL_OPERATORS.filter(
    (operator) =>
      staticFieldFilter(field).safeParse({
        field,
        operator,
        value: valueFor(operator),
      }).success,
  ).sort()

const flows = [
  {
    id: "10",
    name: "Onboarding",
    currentVersionId: "101",
    draftVersionId: "102",
    flowVersions: [
      {
        id: "102",
        isDraft: true,
        isLatest: false,
        nodes: [{ id: "draft-only", type: "sendMessage", data: { name: "X" } }],
      },
      {
        id: "101",
        isDraft: false,
        isLatest: true,
        nodes: [
          { id: "n1", type: "sendMessage", data: { name: "Welcome" } },
          { id: "n2", type: "sendMessage", data: { name: "Welcome" } },
          { id: "note", type: "addNotes", data: { name: "Sticky" } },
          { id: "n3", type: "wait", data: {} },
        ],
      },
    ],
  },
  {
    id: "20",
    name: "Never published",
    currentVersionId: null,
    draftVersionId: "201",
    flowVersions: [
      {
        id: "201",
        isDraft: true,
        isLatest: false,
        nodes: [{ id: "d1", type: "condition", data: { name: "Branch" } }],
      },
    ],
  },
]

describe("flow position fields — operator rules stay in sync", () => {
  const configs = getFieldConfigs({
    t: (key) => key,
    tagOptions: [],
    inboxOptions: [],
    customFields: [],
    flowVersionOptions: [{ label: "Onboarding", value: "10" }],
    flowNodeOptions: buildFlowNodeOptionTree(flows, t),
  })
  const config = (name: string) => {
    const found = configs.find((item) => item.name === name)
    if (!found) {
      throw new Error(`missing config ${name}`)
    }
    return found
  }

  test("registered in the flowPosition group with their option sources", () => {
    expect(config("currentFlow")).toMatchObject({
      group: "flowPosition",
      formField: formFieldTypes.enum.select,
      options: [{ label: "Onboarding", value: "10" }],
    })
    expect(config("currentFlowNode").group).toBe("flowPosition")
    expect(config("currentFlowNode").options?.[0]?.children).toHaveLength(3)
    expect(config("currentNodeMinutesAgo")).toMatchObject({
      group: "flowPosition",
      formField: formFieldTypes.enum.number,
    })
  })

  test("currentFlow: UI and Zod both allow only is / is not", () => {
    expect(enabledOperators(config("currentFlow"))).toEqual(["eq", "ne"])
    expect(zodAcceptedOperators("currentFlow", () => "10")).toEqual([
      "eq",
      "ne",
    ])
  })

  test("currentFlowNode: UI and Zod both allow only is / is not", () => {
    expect(enabledOperators(config("currentFlowNode"))).toEqual(["eq", "ne"])
    expect(zodAcceptedOperators("currentFlowNode", () => ["10", "n1"])).toEqual(
      ["eq", "ne"],
    )
  })

  test("currentNodeMinutesAgo: UI and Zod allow the same number operators", () => {
    const ui = enabledOperators(config("currentNodeMinutesAgo"))
    expect(ui).toEqual(
      [
        "eq",
        "ne",
        "isEmpty",
        "gt",
        "lt",
        "gte",
        "lte",
        "isBetween",
        "notBetween",
      ].sort(),
    )
    expect(
      zodAcceptedOperators("currentNodeMinutesAgo", (operator) =>
        operator === "isBetween" || operator === "notBetween"
          ? ["60", "120"]
          : "60",
      ),
    ).toEqual(ui)
  })
})

describe("flow position fields — value validation", () => {
  test.each([
    ["10", true],
    ["abc", false],
    [["10"], false],
  ])("currentFlow value %j → %s", (value, ok) => {
    expect(
      singleContactFilterConditionSchema.safeParse({
        field: "currentFlow",
        operator: operatorTypes.enum.eq,
        value,
      }).success,
    ).toBe(ok)
  })

  test.each([
    [["10", "n1"], true],
    [["10", ""], false],
    [["", "n1"], false],
    [["x", "n1"], false],
    ["10:n1", false],
    [["10", "n1", "n2"], false],
  ])("currentFlowNode value %j → %s", (value, ok) => {
    expect(
      singleContactFilterConditionSchema.safeParse({
        field: "currentFlowNode",
        operator: operatorTypes.enum.ne,
        value,
      }).success,
    ).toBe(ok)
  })

  test("currentFlowNode uses the two-step flowNode input with an array value", () => {
    const config: FieldConfig = {
      name: "currentFlowNode",
      formField: formFieldTypes.enum.select,
      group: "flowPosition",
    }
    expect(getStaticFieldValueInputConfig(config, "eq")).toEqual({
      kind: "flowNode",
      defaultValue: ["", ""],
    })
    expect(getDefaultStaticFieldValue(config, "ne")).toEqual(["", ""])
    expect(staticFieldOperatorRequiresArrayValue(config, "eq")).toBe(true)
  })
})

describe("flow node options", () => {
  test("published version wins, draft is the fallback", () => {
    expect(pickPositionFlowVersion(flows[0])?.id).toBe("101")
    expect(pickPositionFlowVersion(flows[1])?.id).toBe("201")
  })

  test("labels like the current-step line, skips notes, dedupes labels", () => {
    const [onboarding, draft] = buildFlowNodeOptionTree(flows, t)
    expect(onboarding).toMatchObject({ label: "Onboarding", value: "10" })
    expect(onboarding.children).toEqual([
      { label: "Welcome", value: "n1" },
      { label: "Welcome (2)", value: "n2" },
      { label: "actions.wait", value: "n3" },
    ])
    expect(draft.children).toEqual([{ label: "Branch", value: "d1" }])
  })

  test("chip shows Flow › Step, raw ids when the flow is not loaded", () => {
    const config: FieldConfig = {
      name: "currentFlowNode",
      formField: formFieldTypes.enum.select,
      group: "flowPosition",
      options: buildFlowNodeOptionTree(flows, t),
    }
    expect(formatFieldConditionValue(config, ["10", "n2"])).toBe(
      "Onboarding › Welcome (2)",
    )
    expect(
      formatFieldConditionValue({ ...config, options: [] }, ["10", "n2"]),
    ).toBe("10 › n2")
  })
})

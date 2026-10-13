import {
  type OperatorType,
  operatorTypes,
} from "@chatbotx.io/database/partials"
import type { ConditionOption, FieldConfig } from "./contact-filter-config"

export type CustomFieldValueInputKind =
  | "none"
  | "text"
  | "number"
  | "date"
  | "datetime"
  | "boolean"
  | "numberInterval"
  | "datetimeInterval"
  /** `[flowId, nodeId]` picked flow-then-node; static `currentFlowNode` only. */
  | "flowNode"
  /** One option of a select / multiSelect custom field. */
  | "select"
  /** Several options (`in` / `notIn`) of a select / multiSelect field. */
  | "multiSelect"

export type CustomFieldValueInputConfig = {
  kind: CustomFieldValueInputKind
  defaultValue: string | string[]
}

type CustomFieldTypeRule = {
  singleInput: CustomFieldValueInputKind
  intervalInput?: CustomFieldValueInputKind
  equalityInput?: CustomFieldValueInputKind
  /** Input for the any-of operators (`in` / `notIn`). */
  listInput?: CustomFieldValueInputKind
  enabledOperators: readonly OperatorType[]
}

const CUSTOM_FIELD_OPERATOR_ORDER = [
  operatorTypes.enum.eq,
  operatorTypes.enum.ne,
  operatorTypes.enum.in,
  operatorTypes.enum.notIn,
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.isEmpty,
  operatorTypes.enum.gt,
  operatorTypes.enum.lt,
  operatorTypes.enum.gte,
  operatorTypes.enum.lte,
  operatorTypes.enum.contains,
  operatorTypes.enum.notContains,
  operatorTypes.enum.startsWith,
  operatorTypes.enum.endsWith,
  operatorTypes.enum.isBetween,
  operatorTypes.enum.notBetween,
] as const satisfies readonly OperatorType[]

const VALUELESS_OPERATORS = [
  operatorTypes.enum.isNotEmpty,
  operatorTypes.enum.isEmpty,
] as const satisfies readonly OperatorType[]

const BASE_OPERATORS = [
  operatorTypes.enum.eq,
  operatorTypes.enum.ne,
  ...VALUELESS_OPERATORS,
] as const satisfies readonly OperatorType[]

const TEXT_SEARCH_OPERATORS = [
  operatorTypes.enum.contains,
  operatorTypes.enum.notContains,
  operatorTypes.enum.startsWith,
  operatorTypes.enum.endsWith,
] as const satisfies readonly OperatorType[]

const RANGE_OPERATORS = [
  operatorTypes.enum.gt,
  operatorTypes.enum.lt,
  operatorTypes.enum.gte,
  operatorTypes.enum.lte,
  operatorTypes.enum.isBetween,
  operatorTypes.enum.notBetween,
] as const satisfies readonly OperatorType[]

const textRule = {
  singleInput: "text",
  enabledOperators: [...BASE_OPERATORS, ...TEXT_SEARCH_OPERATORS],
} as const satisfies CustomFieldTypeRule

// Select fields compare whole option labels: is / is not / any of / none of.
const selectRule = {
  singleInput: "select",
  listInput: "multiSelect",
  enabledOperators: [
    ...BASE_OPERATORS,
    operatorTypes.enum.in,
    operatorTypes.enum.notIn,
  ],
} as const satisfies CustomFieldTypeRule

const CUSTOM_FIELD_TYPE_RULES: Record<string, CustomFieldTypeRule> = {
  select: selectRule,
  multiSelect: selectRule,
  shortText: textRule,
  email: textRule,
  phoneNumber: textRule,
  longText: {
    singleInput: "text",
    enabledOperators: BASE_OPERATORS,
  },
  number: {
    singleInput: "number",
    intervalInput: "numberInterval",
    enabledOperators: [
      ...BASE_OPERATORS,
      ...RANGE_OPERATORS,
      ...TEXT_SEARCH_OPERATORS,
    ],
  },
  date: {
    singleInput: "datetime",
    intervalInput: "datetimeInterval",
    equalityInput: "date",
    enabledOperators: [...BASE_OPERATORS, ...RANGE_OPERATORS],
  },
  datetime: {
    singleInput: "datetime",
    intervalInput: "datetimeInterval",
    enabledOperators: [...BASE_OPERATORS, ...RANGE_OPERATORS],
  },
  boolean: {
    singleInput: "boolean",
    enabledOperators: [
      operatorTypes.enum.eq,
      operatorTypes.enum.isNotEmpty,
      operatorTypes.enum.isEmpty,
    ],
  },
}

const DEFAULT_CUSTOM_FIELD_TYPE = "shortText"

const getCustomFieldTypeRule = (
  customFieldType: string | undefined,
): CustomFieldTypeRule =>
  CUSTOM_FIELD_TYPE_RULES[customFieldType ?? DEFAULT_CUSTOM_FIELD_TYPE] ??
  CUSTOM_FIELD_TYPE_RULES[DEFAULT_CUSTOM_FIELD_TYPE]

const isIntervalOperator = (operator?: string): operator is OperatorType =>
  operator === operatorTypes.enum.isBetween ||
  operator === operatorTypes.enum.notBetween

const isListOperator = (operator?: string): operator is OperatorType =>
  operator === operatorTypes.enum.in || operator === operatorTypes.enum.notIn

const isEqualityOperator = (operator?: string): operator is OperatorType =>
  operator === operatorTypes.enum.eq || operator === operatorTypes.enum.ne

const isValuelessOperator = (operator?: string): operator is OperatorType =>
  operator === operatorTypes.enum.isNotEmpty ||
  operator === operatorTypes.enum.isEmpty

const resolveInputKind = (
  rule: CustomFieldTypeRule,
  operator?: string,
): CustomFieldValueInputKind => {
  if (isIntervalOperator(operator) && rule.intervalInput) {
    return rule.intervalInput
  }
  if (isListOperator(operator) && rule.listInput) {
    return rule.listInput
  }
  if (isEqualityOperator(operator) && rule.equalityInput) {
    return rule.equalityInput
  }
  return rule.singleInput
}

const getDefaultValueForInputKind = (
  kind: CustomFieldValueInputKind,
): string | string[] => {
  switch (kind) {
    case "numberInterval":
      return ["0", "0"]
    case "date":
      return ""
    case "datetimeInterval":
      return ["", ""]
    case "multiSelect":
      return []
    default:
      return ""
  }
}

export const getCustomFieldConditionOptions = (
  config: FieldConfig,
  conditionOptions: ConditionOption[],
): ConditionOption[] => {
  const rule = getCustomFieldTypeRule(config.customFieldType)
  const enabledOperators = new Set(rule.enabledOperators)
  const optionByOperator = new Map(
    conditionOptions.map((option) => [option.value, option]),
  )

  // The any-of operators only exist for select fields; listing them disabled
  // on every other field type would just add noise.
  return CUSTOM_FIELD_OPERATOR_ORDER.filter(
    (operator) => !isListOperator(operator) || enabledOperators.has(operator),
  ).map((operator) => {
    const option = optionByOperator.get(operator)
    return {
      value: operator,
      label: option?.label ?? operator,
      disabled: !enabledOperators.has(operator),
    }
  })
}

export const getCustomFieldValueInputConfig = (
  config: FieldConfig | undefined,
  operator: string | undefined,
): CustomFieldValueInputConfig | undefined => {
  if (!config?.customFieldId) {
    return
  }
  if (isValuelessOperator(operator)) {
    return { kind: "none", defaultValue: "" }
  }

  const rule = getCustomFieldTypeRule(config.customFieldType)
  const kind = resolveInputKind(rule, operator)

  return {
    kind,
    defaultValue: getDefaultValueForInputKind(kind),
  }
}

export const getDefaultCustomFieldValue = (
  config: FieldConfig | undefined,
  operator: string | undefined,
): string | string[] =>
  getCustomFieldValueInputConfig(config, operator)?.defaultValue ?? ""

export const customFieldOperatorRequiresArrayValue = (
  operator: string | undefined,
): boolean => isIntervalOperator(operator) || isListOperator(operator)

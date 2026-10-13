import z from "zod"
import { labelColors } from "./label-color"

/**
 * `customFieldTypes` is defined in `@chatbotx.io/utils/custom-field` so
 * packages that cannot depend on the database layer (notably
 * `@chatbotx.io/flow-config`) can still use the enum. Re-exported here
 * because this has long been the import site for the rest of the repo; both
 * paths resolve to the same enum. Mirrors the `channelTypes` precedent.
 */
export {
  type CustomFieldType,
  customFieldTypes,
} from "@chatbotx.io/utils/custom-field"

export const operatorTypes = z.enum([
  "in",
  "notIn",
  "isEmpty",
  "isNotEmpty",
  "eq",
  "ne",
  "startsWith",
  "endsWith",
  "contains",
  "notContains",
  "lt",
  "lte",
  "gt",
  "gte",
  "isBetween",
  "notBetween",
  "used",
])
export type OperatorType = z.infer<typeof operatorTypes>

export const formFieldTypes = z.enum([
  "multiSelect",
  "select",
  "text",
  "boolean",
  "datetime",
  "number",
])
export type FormFieldType = z.infer<typeof formFieldTypes>

export const dateTimeTriggerTypes = z.enum(["atTheDayOf", "before", "after"])
export type DateTimeTriggerType = z.infer<typeof dateTimeTriggerTypes>

export const selectCustomFieldTypes = ["select", "multiSelect"] as const
export type SelectCustomFieldType = (typeof selectCustomFieldTypes)[number]

export const isSelectCustomFieldType = (
  type: string | null | undefined,
): type is SelectCustomFieldType =>
  (selectCustomFieldTypes as readonly string[]).includes(type ?? "")

export const MAX_CUSTOM_FIELD_OPTIONS = 100
export const MAX_CUSTOM_FIELD_OPTION_LABEL_LENGTH = 100

/**
 * Multi-select values are stored in the existing text `value` column as
 * comma-separated option labels ("A, B"). That keeps them readable in
 * variables, exports and text filters; it is why option labels may not
 * contain a comma (same rule as Notion).
 */
export const MULTI_SELECT_SEPARATOR = ","
const MULTI_SELECT_JOINER = `${MULTI_SELECT_SEPARATOR} `

const optionKey = (label: string) => label.trim().toLowerCase()

export const customFieldOptionSchema = z.object({
  /** Stable id: survives renames, so stored values can be migrated. */
  id: z.string().trim().min(1).max(64),
  label: z
    .string()
    .trim()
    .min(1)
    .max(MAX_CUSTOM_FIELD_OPTION_LABEL_LENGTH)
    .refine((label) => !label.includes(MULTI_SELECT_SEPARATOR), {
      message: "Option label cannot contain a comma",
    }),
  color: labelColors,
})
export type CustomFieldOption = z.infer<typeof customFieldOptionSchema>

export const customFieldOptionsSchema = z
  .array(customFieldOptionSchema)
  .max(MAX_CUSTOM_FIELD_OPTIONS)
  .superRefine((options, ctx) => {
    const ids = new Set<string>()
    const labels = new Set<string>()
    options.forEach((option, index) => {
      if (ids.has(option.id)) {
        ctx.addIssue({
          code: "custom",
          message: "Duplicate option id",
          path: [index, "id"],
        })
      }
      ids.add(option.id)

      const key = optionKey(option.label)
      if (labels.has(key)) {
        ctx.addIssue({
          code: "custom",
          message: "Option labels must be unique",
          path: [index, "label"],
        })
      }
      labels.add(key)
    })
  })

/** Splits a stored multi-select value into trimmed, de-duplicated labels. */
export const parseMultiSelectValue = (
  value: string | null | undefined,
): string[] => {
  if (!value) {
    return []
  }
  const seen = new Set<string>()
  const labels: string[] = []
  for (const part of value.split(MULTI_SELECT_SEPARATOR)) {
    const label = part.trim()
    const key = optionKey(label)
    if (label && !seen.has(key)) {
      seen.add(key)
      labels.push(label)
    }
  }
  return labels
}

export const serializeMultiSelectValue = (labels: readonly string[]): string =>
  labels.join(MULTI_SELECT_JOINER)

/** Case- and whitespace-insensitive lookup of an option by its label. */
export const findCustomFieldOption = (
  options: readonly CustomFieldOption[] | null | undefined,
  label: string,
): CustomFieldOption | undefined => {
  const key = optionKey(label)
  return options?.find((option) => optionKey(option.label) === key)
}

/**
 * Canonicalizes a value written to a select / multi-select field.
 *
 * - blank -> "" (clears the value, same as other field types)
 * - select -> the matching option's canonical label, or `null` when the value
 *   is not one of the options
 * - multiSelect -> canonical labels joined with ", "; `null` when ANY part is
 *   not an option (a partial write would silently drop user data)
 *
 * `null` means "reject": callers skip the write instead of persisting a value
 * the field cannot represent.
 */
export const normalizeSelectFieldValue = (input: {
  type: SelectCustomFieldType
  options: readonly CustomFieldOption[] | null | undefined
  value: string
}): string | null => {
  const { type, options, value } = input
  if (value.trim() === "") {
    return ""
  }

  if (type === "select") {
    return findCustomFieldOption(options, value)?.label ?? null
  }

  const labels: string[] = []
  for (const part of parseMultiSelectValue(value)) {
    const option = findCustomFieldOption(options, part)
    if (!option) {
      return null
    }
    if (!labels.includes(option.label)) {
      labels.push(option.label)
    }
  }
  return serializeMultiSelectValue(labels)
}

/**
 * Options whose label changed between two versions of a field (matched by the
 * stable option id). Used to migrate stored contact values on rename.
 */
export const diffCustomFieldOptionRenames = (
  previous: readonly CustomFieldOption[] | null | undefined,
  next: readonly CustomFieldOption[] | null | undefined,
): { from: string; to: string }[] => {
  const nextById = new Map((next ?? []).map((option) => [option.id, option]))
  return (previous ?? []).flatMap((option) => {
    const renamed = nextById.get(option.id)
    return renamed && renamed.label !== option.label
      ? [{ from: option.label, to: renamed.label }]
      : []
  })
}

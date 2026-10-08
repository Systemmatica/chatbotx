import {
  type FormFieldType,
  formFieldTypes,
  type OperatorType,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { booleanOperators } from "./boolean-filter"
import {
  type CouponTopicCondition,
  couponTopicConditionSchema,
} from "./coupon-topic-filter"
import {
  type CtwaRetargetCondition,
  ctwaRetargetConditionSchema,
} from "./ctwa-retarget-filter"
import {
  type CustomFieldCondition,
  customFieldConditionSchema,
} from "./custom-field-filter"
import { datetimeOperators } from "./datetime-filter"
import { contactFilterConditionSchemas } from "./definitions"
import { multiSelectOperators } from "./multi-select-filter"
import { numberOperators } from "./number"
import { selectOperators } from "./select-filter"
import { textOperators } from "./text-filter"

export {
  type CouponTopicCondition,
  couponTopicConditionSchema,
} from "./coupon-topic-filter"
export {
  type CtwaRetargetCondition,
  type CtwaRetargetSegment,
  ctwaRetargetConditionSchema,
  ctwaRetargetSegments,
} from "./ctwa-retarget-filter"
export {
  type CustomFieldCondition,
  customFieldConditionSchema,
} from "./custom-field-filter"
export {
  CONTACT_FILTER_FIELD_DEFINITIONS,
  type ContactFilterFieldDefinition,
  type ContactFilterOptionSource,
  type ContactFilterSchemaKind,
  contactFilterConditionSchemas,
} from "./definitions"

export const mappingConditions: Record<FormFieldType, OperatorType[]> = {
  [formFieldTypes.enum.multiSelect]: multiSelectOperators,
  [formFieldTypes.enum.select]: selectOperators,
  [formFieldTypes.enum.text]: textOperators,
  [formFieldTypes.enum.boolean]: booleanOperators,
  [formFieldTypes.enum.datetime]: datetimeOperators,
  [formFieldTypes.enum.number]: numberOperators,
}

export type ContactFilterCondition =
  | z.infer<(typeof contactFilterConditionSchemas)[number]>
  | CustomFieldCondition
  | CouponTopicCondition
  | CtwaRetargetCondition

/** One validated condition row (matches `conditions` elements in {@link contactFilterCriteriaSchema}). */
// Static fields are a discriminated union on `field`; dynamic custom fields and
// coupon-topic fields each go through their own single-branch schema (`field`
// literal "customField" / "couponTopic" + a runtime id). The trailing cast keeps
// `z.infer` aligned with the value the resolver derives — without it, Zod v4
// widens the dynamic-array discriminated union output to `unknown`, diverging
// from react-hook-form's inferred field type.
export const singleContactFilterConditionSchema = z.union([
  z.discriminatedUnion(
    "field",
    // Zod v4 narrows discriminatedUnion options tighter than inferred schema tuples.
    // @ts-expect-error Expected readonly [$ZodTypeDiscriminable, ...]; runtime union is correct.
    contactFilterConditionSchemas,
  ),
  customFieldConditionSchema,
  couponTopicConditionSchema,
  ctwaRetargetConditionSchema,
]) as unknown as z.ZodType<ContactFilterCondition>

export const contactFilterOperatorSchema = z.enum(["and", "or"])
export type ContactFilterOperator = z.infer<typeof contactFilterOperatorSchema>

/**
 * Notion-style condition group: its leaf conditions are combined with the
 * group's own operator, and the group is one entry of the root `conditions`.
 * Nesting is one level only — a group holds conditions, never other groups.
 * An empty group is valid (fresh in the UI) and compiles to no predicate.
 */
export const contactFilterGroupSchema = z.object({
  type: z.literal("group"),
  operator: contactFilterOperatorSchema,
  conditions: z.array(singleContactFilterConditionSchema),
})
export type ContactFilterGroup = {
  type: "group"
  operator: ContactFilterOperator
  conditions: ContactFilterCondition[]
}

/** One entry of the root `conditions`: a leaf condition or a group of them. */
export type ContactFilterItem = ContactFilterCondition | ContactFilterGroup

export const contactFilterItemSchema = z.union([
  contactFilterGroupSchema,
  singleContactFilterConditionSchema,
]) as unknown as z.ZodType<ContactFilterItem>

export const isContactFilterGroupItem = (
  item: ContactFilterItem,
): item is ContactFilterGroup =>
  (item as { type?: unknown }).type === "group" &&
  Array.isArray((item as { conditions?: unknown }).conditions)

/** Leaf conditions of a filter with groups expanded (for counts / emptiness). */
export const getContactFilterLeafConditions = (
  filter: { conditions: ContactFilterItem[] } | null | undefined,
): ContactFilterCondition[] =>
  (filter?.conditions ?? []).flatMap((item) =>
    isContactFilterGroupItem(item) ? item.conditions : [item],
  )

export const countContactFilterLeafConditions = (
  filter: { conditions: ContactFilterItem[] } | null | undefined,
): number => getContactFilterLeafConditions(filter).length

export const contactFilterCriteriaSchema = z.object({
  operator: contactFilterOperatorSchema,
  /**
   * Leaf conditions and/or groups. Legacy filters (flat list of conditions,
   * no groups) remain valid unchanged and compile to the same SQL.
   */
  conditions: z.array(contactFilterItemSchema),
  /**
   * IANA timezone (the browser's local zone, captured at build/save time) used
   * to interpret naive date/datetime condition values. The backend defaults to
   * UTC when this is absent or unrecognized.
   */
  timezone: z.string().max(64).optional(),
})

export type ContactFilterCriteria = z.infer<typeof contactFilterCriteriaSchema>

export const contactFilterRequest = z.object({
  contactFilter: contactFilterCriteriaSchema,
})
export type ContactFilterRequest = z.infer<typeof contactFilterRequest>

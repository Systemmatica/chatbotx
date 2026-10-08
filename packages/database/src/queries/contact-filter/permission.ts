import { type ContactFilterField, contactFilterFields } from "../../partials"
import { countContactFilterConditions, isContactFilterGroup } from "./groups"
import type { ContactFilterCriteriaInput } from "./types"

export const EMAIL_PHONE_FILTER_FIELDS = [
  contactFilterFields.enum.email,
  contactFilterFields.enum.phone,
  contactFilterFields.enum.hasContactInfo,
  contactFilterFields.enum.emailWasVerified,
  contactFilterFields.enum.optedInForEmail,
  contactFilterFields.enum.existingContact,
] as const satisfies readonly ContactFilterField[]

const toConditionWithField = (
  condition: unknown,
): { field?: unknown } | undefined =>
  typeof condition === "object" && condition !== null
    ? (condition as { field?: unknown })
    : undefined

export function pruneContactFilterFields(
  contactFilter: ContactFilterCriteriaInput | null | undefined,
  excludedFields: readonly ContactFilterField[],
): ContactFilterCriteriaInput | undefined {
  if (!contactFilter) {
    return
  }
  if (
    excludedFields.length === 0 ||
    countContactFilterConditions(contactFilter) === 0
  ) {
    return contactFilter
  }

  const excludedFieldSet = new Set<string>(excludedFields)
  const isAllowed = (condition: unknown) => {
    const field = toConditionWithField(condition)?.field
    return typeof field !== "string" || !excludedFieldSet.has(field)
  }
  // Prune inside groups too; a group emptied by pruning is dropped (an empty
  // group compiles to no predicate, but keeping it would still count as an
  // entry in `conditions`).
  const conditions = contactFilter.conditions.flatMap((item) => {
    if (!isContactFilterGroup(item)) {
      return isAllowed(item) ? [item] : []
    }
    const groupConditions = item.conditions.filter(isAllowed)
    if (groupConditions.length === 0 && item.conditions.length > 0) {
      return []
    }
    return [{ ...item, conditions: groupConditions }]
  })

  // Spread the original so boundary-only fields (notably `timezone`, which the
  // date-range WHERE resolves against) survive pruning — listing fields by hand
  // silently drops any not enumerated here.
  return {
    ...contactFilter,
    operator: conditions.length > 0 ? contactFilter.operator : "and",
    conditions,
  }
}

export function pruneEmailPhoneFilterConditions(
  contactFilter: ContactFilterCriteriaInput | null | undefined,
  canViewEmailAndPhone: boolean,
): ContactFilterCriteriaInput | undefined {
  return canViewEmailAndPhone
    ? (contactFilter ?? undefined)
    : pruneContactFilterFields(contactFilter, EMAIL_PHONE_FILTER_FIELDS)
}

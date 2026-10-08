import type {
  ContactFilterCriteriaInput,
  ContactFilterGroupInput,
} from "./types"

/** True when a `conditions` entry is a nested group rather than a leaf condition. */
export const isContactFilterGroup = (
  item: unknown,
): item is ContactFilterGroupInput =>
  typeof item === "object" &&
  item !== null &&
  (item as { type?: unknown }).type === "group" &&
  Array.isArray((item as { conditions?: unknown }).conditions)

/**
 * Every leaf condition of a filter, with groups expanded in place. Use it for
 * "is this filter empty?" / count checks — `conditions.length` counts a group
 * (possibly empty) as one entry.
 */
export const flattenContactFilterConditions = (
  criteria: Pick<ContactFilterCriteriaInput, "conditions"> | null | undefined,
): unknown[] =>
  (criteria?.conditions ?? []).flatMap((item) =>
    isContactFilterGroup(item) ? item.conditions : [item],
  )

export const countContactFilterConditions = (
  criteria: Pick<ContactFilterCriteriaInput, "conditions"> | null | undefined,
): number => flattenContactFilterConditions(criteria).length

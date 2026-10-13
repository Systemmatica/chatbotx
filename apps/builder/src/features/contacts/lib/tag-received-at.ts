/**
 * "Received" column of the contacts table: when the contact got the tag the
 * table is filtered by. Shown only while the filter is exactly one positive
 * condition on one tag (what the lead magnet catalog's "show contacts" link
 * builds), so the date is unambiguous and the extra lookup is only paid then.
 */
export const TAG_RECEIVED_AT_COLUMN_ID = "tagReceivedAt"

type FilterLike = {
  operator?: string
  conditions?: readonly unknown[]
}

const POSITIVE_OPERATORS = new Set(["in", "eq"])

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value)

/** Leaf conditions of a filter, unwrapping one level of groups. */
const leafConditions = (filter: FilterLike): Record<string, unknown>[] =>
  (filter.conditions ?? []).flatMap((condition) => {
    if (!isRecord(condition)) {
      return []
    }
    if (condition.type === "group") {
      const nested = Array.isArray(condition.conditions)
        ? condition.conditions
        : []
      return nested.filter(isRecord)
    }
    return [condition]
  })

/**
 * The tag id when the filter is exactly one `tags in/eq <one tag>` condition,
 * otherwise `null` (no filter, several conditions, several tags, negation).
 */
export function getSingleTagFilterId(
  filter: FilterLike | null | undefined,
): string | null {
  if (!filter) {
    return null
  }
  const leaves = leafConditions(filter)
  if (leaves.length !== 1) {
    return null
  }
  const [condition] = leaves
  if (
    condition.field !== "tags" ||
    typeof condition.operator !== "string" ||
    !POSITIVE_OPERATORS.has(condition.operator)
  ) {
    return null
  }
  const values = Array.isArray(condition.value)
    ? condition.value
    : [condition.value]
  if (values.length !== 1) {
    return null
  }
  const [tagId] = values
  return typeof tagId === "string" && tagId.length > 0 ? tagId : null
}

/** Whether the requested sort asks for the received date (first sort key). */
export function isSortedByTagReceivedAt(
  sort: readonly { id: string; desc: boolean }[] | null | undefined,
): { desc: boolean } | null {
  const first = sort?.[0]
  return first?.id === TAG_RECEIVED_AT_COLUMN_ID ? { desc: first.desc } : null
}

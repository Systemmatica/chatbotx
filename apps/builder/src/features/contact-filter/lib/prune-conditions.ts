import type { ContactFilterField } from "@chatbotx.io/database/partials"
import {
  type ContactFilterCondition,
  type ContactFilterItem,
  isContactFilterGroupItem,
} from "../schemas"

const isExcluded = (
  condition: ContactFilterCondition,
  excludeFields: ContactFilterField[],
) => excludeFields.includes(condition.field as ContactFilterField)

/**
 * Drops conditions whose field is excluded, including inside groups. A group
 * emptied by pruning is dropped; a group that was already empty (freshly added
 * in the UI) is kept. Returns the input array itself when nothing changed, so
 * callers can detect a change by reference.
 */
export const pruneExcludedConditions = <T extends ContactFilterItem>(
  conditions: T[],
  excludeFields: ContactFilterField[],
): T[] => {
  if (excludeFields.length === 0) {
    return conditions
  }

  let changed = false
  const pruned = conditions.flatMap((item): T[] => {
    if (!isContactFilterGroupItem(item)) {
      if (isExcluded(item, excludeFields)) {
        changed = true
        return []
      }
      return [item]
    }

    const groupConditions = item.conditions.filter(
      (condition) => !isExcluded(condition, excludeFields),
    )
    if (groupConditions.length === item.conditions.length) {
      return [item]
    }
    changed = true
    return groupConditions.length === 0
      ? []
      : [{ ...item, conditions: groupConditions }]
  })

  return changed ? pruned : conditions
}

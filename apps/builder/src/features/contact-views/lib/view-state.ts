import {
  type ContactFilterCriteria,
  countContactFilterLeafConditions,
} from "@/features/contact-filter/schemas"
import { DEFAULT_VISIBLE_COLUMNS } from "@/features/contacts/lib/custom-field-columns"
import type {
  ContactViewConfigInput,
  ContactViewGroupBy,
  ContactViewSort,
  ResolvedContactViewConfig,
} from "../schemas/config"

/** Search param of the active saved view (absent = "All"). */
export const CONTACT_VIEW_PARAM = "view"

/** The contacts table's default order (see `contacts-table.tsx`). */
export const DEFAULT_CONTACT_SORT: ContactViewSort[] = [
  { id: "createdAt", desc: true },
]

const EMPTY_FILTER: ContactFilterCriteria = { operator: "and", conditions: [] }

/** The table state a view (or "All" when `null`) puts the table in. */
export type ContactTableViewState = {
  filter: ContactFilterCriteria
  sort: ContactViewSort[]
  visibleColumns: readonly string[]
  groupBy: ContactViewGroupBy | null
}

/** Fills a stored view's missing parts with the table defaults. */
export function toTableViewState(
  config: ResolvedContactViewConfig | null,
): ContactTableViewState {
  return {
    filter: config?.filter ?? EMPTY_FILTER,
    sort:
      config?.sort && config.sort.length > 0
        ? config.sort
        : DEFAULT_CONTACT_SORT,
    visibleColumns: config?.visibleColumns ?? DEFAULT_VISIBLE_COLUMNS,
    groupBy: config?.groupBy ?? null,
  }
}

/** What gets stored for the current table state. */
export function toSavedViewConfig(
  state: ContactTableViewState,
): ContactViewConfigInput {
  const hasFilter = countContactFilterLeafConditions(state.filter) > 0
  return {
    ...(hasFilter ? { filter: state.filter } : {}),
    sort: state.sort.length > 0 ? state.sort : DEFAULT_CONTACT_SORT,
    visibleColumns: [...state.visibleColumns],
    groupBy: state.groupBy,
  }
}

const comparable = (state: ContactTableViewState) => ({
  filter:
    countContactFilterLeafConditions(state.filter) > 0 ? state.filter : null,
  sort: state.sort.length > 0 ? state.sort : DEFAULT_CONTACT_SORT,
  visibleColumns: [...state.visibleColumns],
  groupBy: state.groupBy,
})

/** Whether the table differs from the state of the active view / "All". */
export function isViewStateDirty(
  expected: ContactTableViewState,
  current: ContactTableViewState,
): boolean {
  return (
    JSON.stringify(comparable(expected)) !== JSON.stringify(comparable(current))
  )
}

/**
 * Tab order after moving `id` one step left/right; the same array when it
 * cannot move (already first/last, or unknown).
 */
export function moveViewId(
  ids: readonly string[],
  id: string,
  direction: "left" | "right",
): readonly string[] {
  const index = ids.indexOf(id)
  const target = direction === "left" ? index - 1 : index + 1
  if (index === -1 || target < 0 || target >= ids.length) {
    return ids
  }
  const next = [...ids]
  next[index] = ids[target] as string
  next[target] = id
  return next
}

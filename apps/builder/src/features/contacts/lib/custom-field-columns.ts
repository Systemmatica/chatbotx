/**
 * Custom field columns of the contacts table and their inline editing.
 * Column ids are `cf:<customFieldId>` so they can be stored in a saved view
 * next to the built-in column ids.
 */

export const CUSTOM_FIELD_COLUMN_PREFIX = "cf:"

export const customFieldColumnId = (customFieldId: string): string =>
  `${CUSTOM_FIELD_COLUMN_PREFIX}${customFieldId}`

/** The custom field id of a `cf:<id>` column, `null` for other columns. */
export const parseCustomFieldColumnId = (columnId: string): string | null =>
  columnId.startsWith(CUSTOM_FIELD_COLUMN_PREFIX)
    ? columnId.slice(CUSTOM_FIELD_COLUMN_PREFIX.length) || null
    : null

/**
 * Field types typed into a text box: saved on Enter or when focus leaves.
 * Every other type (date/time pickers, yes/no, and choice types added later)
 * picks a value from a control and is saved as soon as it changes.
 */
const TEXT_ENTRY_TYPES = new Set([
  "shortText",
  "longText",
  "email",
  "phoneNumber",
  "number",
])

export type InlineCommitMode = "onEnterOrBlur" | "onChange"

export const resolveInlineCommitMode = (type: string): InlineCommitMode =>
  TEXT_ENTRY_TYPES.has(type) ? "onEnterOrBlur" : "onChange"

type RowWithCustomFields = {
  id: string
  contactCustomFields?:
    | { customFieldId: string; value: string; [key: string]: unknown }[]
    | null
}

/** The raw stored value of a custom field on a row (`null` when unset). */
export function getRowCustomFieldValue(
  row: RowWithCustomFields,
  customFieldId: string,
): string | null {
  return (
    row.contactCustomFields?.find(
      (field) => field.customFieldId === customFieldId,
    )?.value ?? null
  )
}

/**
 * Returns rows with one contact's custom field set to `value` (`null` clears
 * it) — the optimistic update of an inline edit, and its rollback. Other rows
 * keep their identity so only the edited row re-renders.
 */
export function patchRowCustomField<T extends RowWithCustomFields>(
  rows: T[],
  contactId: string,
  customFieldId: string,
  value: string | null,
): T[] {
  return rows.map((row) => {
    if (row.id !== contactId) {
      return row
    }
    const current = row.contactCustomFields ?? []
    const others = current.filter(
      (field) => field.customFieldId !== customFieldId,
    )
    if (value === null) {
      return { ...row, contactCustomFields: others }
    }
    const existing = current.find(
      (field) => field.customFieldId === customFieldId,
    )
    return {
      ...row,
      contactCustomFields: [
        ...others,
        existing
          ? { ...existing, value }
          : {
              id: `optimistic:${customFieldId}`,
              contactId,
              customFieldId,
              value,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
      ],
    }
  })
}

/** Normalizes an edited value: blank text clears the field. */
export const normalizeInlineValue = (value: unknown): string | null => {
  if (value === null || value === undefined) {
    return null
  }
  const text = String(value)
  return text.trim() === "" ? null : text
}

/** Built-in columns the user may hide (name and selection always show). */
export const BASE_HIDEABLE_COLUMNS = [
  "source",
  "assignee",
  "lastReadAt",
  "createdAt",
] as const

/** Columns shown when no saved view says otherwise: today's table. */
export const DEFAULT_VISIBLE_COLUMNS: readonly string[] = BASE_HIDEABLE_COLUMNS

/**
 * TanStack visibility map: every hideable column is listed explicitly, so a
 * custom field column loaded later starts hidden instead of visible.
 */
export function buildColumnVisibility(
  hideableColumnIds: readonly string[],
  visibleColumnIds: readonly string[],
): Record<string, boolean> {
  const visible = new Set(visibleColumnIds)
  return Object.fromEntries(
    hideableColumnIds.map((columnId) => [columnId, visible.has(columnId)]),
  )
}

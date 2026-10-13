import type { ContactViewGroupBy } from "../schemas/config"

/**
 * Grouping of the contacts table. The server sorts and pages the list as
 * usual; the shown page is grouped here, while header counts come from one
 * grouped-count query over the whole filtered list. So pages stay cheap and
 * stable (no per-group paging), and headers still tell the real totals.
 */

/** Key of the "no value" group (no value / no stage / no lead magnet). */
export const EMPTY_GROUP_KEY = "__empty__"

export type GroupingRow = {
  id: string
  blockedAt?: Date | string | null
  tags?: { id: string }[] | null
  contactCustomFields?: { customFieldId: string; value: string }[] | null
}

export type GroupingStage = { name: string; matchBlocked?: boolean | null }

export type GroupingContext = {
  /** Board of a `stage` grouping: its status field and ordered stages. */
  board?: { customFieldId: string; stages: GroupingStage[] } | null
  /** Lead magnets (ordered) with the tag that marks "received". */
  leadMagnets?: { id: string; tagId: string | null }[]
}

const normalizeKey = (value: string | null | undefined): string =>
  value === null || value === undefined || value.trim() === ""
    ? EMPTY_GROUP_KEY
    : value

const customFieldValue = (row: GroupingRow, customFieldId: string) =>
  row.contactCustomFields?.find(
    (field) => field.customFieldId === customFieldId,
  )?.value ?? null

/**
 * Group keys of one contact. A contact sits in one group, except for lead
 * magnets: it appears under each lead magnet it received.
 */
export function groupKeysForRow(
  row: GroupingRow,
  groupBy: ContactViewGroupBy,
  context: GroupingContext,
): string[] {
  switch (groupBy.kind) {
    case "customField":
      return [normalizeKey(customFieldValue(row, groupBy.customFieldId))]
    case "stage": {
      const board = context.board
      if (!board) {
        return [EMPTY_GROUP_KEY]
      }
      // Same mapping as the Kanban board: blocked contacts go to the
      // "blocked" stage, values matching no stage to "no status".
      const blockedStage = board.stages.find((stage) => stage.matchBlocked)
      if (row.blockedAt && blockedStage) {
        return [blockedStage.name]
      }
      const value = customFieldValue(row, board.customFieldId)
      return board.stages.some((stage) => stage.name === value)
        ? [value as string]
        : [EMPTY_GROUP_KEY]
    }
    case "leadMagnet": {
      const tagIds = new Set((row.tags ?? []).map((tag) => tag.id))
      const received = (context.leadMagnets ?? []).filter(
        (leadMagnet) => leadMagnet.tagId && tagIds.has(leadMagnet.tagId),
      )
      return received.length > 0
        ? received.map((leadMagnet) => leadMagnet.id)
        : [EMPTY_GROUP_KEY]
    }
    default: {
      const exhaustive: never = groupBy
      return exhaustive
    }
  }
}

export type RowGroup<T extends GroupingRow> = {
  key: string
  rows: T[]
}

const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: "base",
})

/**
 * Groups the page in a stable order: board stages / lead magnets in their
 * own order, field values alphabetically (numbers numerically). The empty
 * group comes first for stages (like the board's "no status" column) and
 * last otherwise. Rows keep their server order inside a group.
 */
export function groupRows<T extends GroupingRow>(
  rows: T[],
  groupBy: ContactViewGroupBy,
  context: GroupingContext,
): RowGroup<T>[] {
  const byKey = new Map<string, T[]>()
  for (const row of rows) {
    for (const key of groupKeysForRow(row, groupBy, context)) {
      const bucket = byKey.get(key)
      if (bucket) {
        bucket.push(row)
      } else {
        byKey.set(key, [row])
      }
    }
  }

  const order = groupOrder(groupBy, context)
  return [...byKey.entries()]
    .map(([key, groupRowsList]) => ({ key, rows: groupRowsList }))
    .sort((a, b) => order(a.key, b.key))
}

function groupOrder(
  groupBy: ContactViewGroupBy,
  context: GroupingContext,
): (a: string, b: string) => number {
  const ranked = (keys: string[], emptyFirst: boolean) => {
    const rank = new Map(keys.map((key, index) => [key, index]))
    const emptyRank = emptyFirst ? -1 : keys.length
    const rankOf = (key: string) =>
      key === EMPTY_GROUP_KEY ? emptyRank : (rank.get(key) ?? keys.length - 0.5)
    return (a: string, b: string) => rankOf(a) - rankOf(b)
  }

  if (groupBy.kind === "stage") {
    return ranked(
      (context.board?.stages ?? []).map((stage) => stage.name),
      true,
    )
  }
  if (groupBy.kind === "leadMagnet") {
    return ranked(
      (context.leadMagnets ?? []).map((leadMagnet) => leadMagnet.id),
      false,
    )
  }
  return (a, b) => {
    if (a === EMPTY_GROUP_KEY || b === EMPTY_GROUP_KEY) {
      return Number(a === EMPTY_GROUP_KEY) - Number(b === EMPTY_GROUP_KEY)
    }
    return collator.compare(a, b)
  }
}

/** Server counts by group key (`null` from the server = the empty group). */
export function countsByGroupKey(
  counts: { key: string | null; count: number }[],
): Map<string, number> {
  const map = new Map<string, number>()
  for (const { key, count } of counts) {
    const normalized = normalizeKey(key)
    map.set(normalized, (map.get(normalized) ?? 0) + count)
  }
  return map
}

/** Stable id of a grouping, so collapsed groups are remembered per field. */
export function groupBySignature(groupBy: ContactViewGroupBy): string {
  switch (groupBy.kind) {
    case "customField":
      return `customField:${groupBy.customFieldId}`
    case "stage":
      return `stage:${groupBy.boardId}`
    default:
      return groupBy.kind
  }
}

/** Ids in display order, skipping collapsed groups (peek ↑/↓ order). */
export function visibleRowIds<T extends GroupingRow>(
  groups: RowGroup<T>[],
  collapsed: ReadonlySet<string>,
): string[] {
  return [
    ...new Set(
      groups.flatMap((group) =>
        collapsed.has(group.key) ? [] : group.rows.map((row) => row.id),
      ),
    ),
  ]
}

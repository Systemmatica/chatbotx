import {
  KANBAN_NO_STATUS_STAGE_ID,
  type KanbanStage,
} from "@chatbotx.io/database/partials"

export type KanbanCardInput = {
  contactId: string
  fullName: string | null
  avatar: string | null
  /** Raw status value of the contact (stage name), `null` when unset. */
  bucket: string | null
  channel: string | null
  lastMessageAt: Date | null
  conversationId: string | null
}

export type KanbanCard = Omit<KanbanCardInput, "bucket">

export type KanbanColumn = {
  /** Stage id, or `KANBAN_NO_STATUS_STAGE_ID` for the virtual first column. */
  id: string
  /** Stage name; `null` for the "no status" column (label comes from i18n). */
  name: string | null
  color: string | null
  isNoStatus: boolean
  total: number
  cards: KanbanCard[]
}

/**
 * Groups contacts into board columns. The first column is always the virtual
 * "no status" column; it receives contacts whose value is empty or matches no
 * stage name. Stage columns follow in board order. Values are matched exactly
 * (case-sensitive), mirroring how the bot writes the custom field.
 */
export function buildKanbanColumns(input: {
  stages: KanbanStage[]
  cards: KanbanCardInput[]
  counts: { bucket: string | null; count: number }[]
}): KanbanColumn[] {
  const { stages, cards, counts } = input

  const noStatus: KanbanColumn = {
    id: KANBAN_NO_STATUS_STAGE_ID,
    name: null,
    color: null,
    isNoStatus: true,
    total: 0,
    cards: [],
  }
  const stageColumns: KanbanColumn[] = stages.map((stage) => ({
    id: stage.id,
    name: stage.name,
    color: stage.color ?? null,
    isNoStatus: false,
    total: 0,
    cards: [],
  }))
  const columnByValue = new Map(
    stageColumns.map((column) => [column.name as string, column] as const),
  )
  const resolveColumn = (bucket: string | null): KanbanColumn =>
    (bucket ? columnByValue.get(bucket) : undefined) ?? noStatus

  for (const { bucket, count } of counts) {
    resolveColumn(bucket).total += count
  }

  for (const { bucket, ...card } of cards) {
    resolveColumn(bucket).cards.push(card)
  }

  // A count query racing a concurrent move can under-report; never show fewer
  // than the cards actually rendered.
  for (const column of [noStatus, ...stageColumns]) {
    column.total = Math.max(column.total, column.cards.length)
  }

  return [noStatus, ...stageColumns]
}

/**
 * Resolves the custom field value a card must get when dropped on `stageId`.
 * Returns `null` for the "no status" column (the value is cleared) and throws
 * on an unknown stage id.
 */
export function resolveKanbanStageValue(
  stages: KanbanStage[],
  stageId: string,
): string | null {
  if (stageId === KANBAN_NO_STATUS_STAGE_ID) {
    return null
  }
  const stage = stages.find((item) => item.id === stageId)
  if (!stage) {
    throw new Error(`Unknown Kanban stage: ${stageId}`)
  }
  return stage.name
}

import type { KanbanColumnResource } from "../schemas/resource"

/**
 * Optimistically moves a card to another column: removes it from its current
 * column, prepends it to the target and adjusts both totals. Returns the same
 * array when the card is missing or already in the target column.
 */
export function moveCardBetweenColumns(
  columns: KanbanColumnResource[],
  contactId: string,
  targetColumnId: string,
): KanbanColumnResource[] {
  const source = columns.find((column) =>
    column.cards.some((card) => card.contactId === contactId),
  )
  if (!source || source.id === targetColumnId) {
    return columns
  }
  const card = source.cards.find((item) => item.contactId === contactId)
  if (!(card && columns.some((column) => column.id === targetColumnId))) {
    return columns
  }

  return columns.map((column) => {
    if (column.id === source.id) {
      return {
        ...column,
        total: Math.max(column.total - 1, 0),
        cards: column.cards.filter((item) => item.contactId !== contactId),
      }
    }
    if (column.id === targetColumnId) {
      return {
        ...column,
        total: column.total + 1,
        cards: [card, ...column.cards],
      }
    }
    return column
  })
}

/** Appends a "load more" page to a column, skipping cards already shown. */
export function appendColumnCards(
  columns: KanbanColumnResource[],
  page: KanbanColumnResource,
): KanbanColumnResource[] {
  return columns.map((column) => {
    if (column.id !== page.id) {
      return column
    }
    const seen = new Set(column.cards.map((card) => card.contactId))
    return {
      ...column,
      total: page.total,
      cards: [
        ...column.cards,
        ...page.cards.filter((card) => !seen.has(card.contactId)),
      ],
    }
  })
}

/** Generates a stable id for a new stage. */
export function createStageId(): string {
  return `stage_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Search param that holds the contact open in the side peek. */
export const CONTACT_PEEK_PARAM = "contact"

export type PeekDirection = "previous" | "next"

/**
 * Ids in display order without repeats: a contact shown in several groups
 * (e.g. two lead magnets) is visited once, where it first appears.
 */
export function uniqueInOrder(ids: Iterable<string>): string[] {
  return [...new Set(ids)]
}

/**
 * The contact before/after `currentId` in the list the user sees. `null` at
 * either end or when the current contact is not in the list (opened from a
 * shared link to a contact on another page): there is nothing to step to.
 */
export function getAdjacentContactId(
  ids: readonly string[],
  currentId: string | null,
  direction: PeekDirection,
): string | null {
  if (!currentId) {
    return null
  }
  const index = ids.indexOf(currentId)
  if (index === -1) {
    return null
  }
  const nextIndex = direction === "next" ? index + 1 : index - 1
  return ids[nextIndex] ?? null
}

/**
 * Whether a keyboard event comes from a control that uses the arrow keys
 * itself (text fields, selects, menus), so the peek must not navigate.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target && typeof (target as Element).closest === "function")) {
    return false
  }
  const element = target as HTMLElement
  if (element.isContentEditable) {
    return true
  }
  return Boolean(
    element.closest(
      'input, textarea, select, [contenteditable="true"], [role="combobox"], [role="listbox"], [role="menu"], [role="option"]',
    ),
  )
}

/**
 * Whether a click on a table row/card landed on an interactive element of
 * its own (checkbox, link, button, inline editor), which keeps its behavior
 * instead of opening the peek.
 */
export function isInteractiveClickTarget(
  target: EventTarget | null,
  container: Element,
): boolean {
  if (!(target && typeof (target as Element).closest === "function")) {
    return false
  }
  // React bubbles clicks from portals (a date picker of an inline editor)
  // through the row: anything outside the row's DOM is not a row click.
  if (!container.contains(target as Node)) {
    return true
  }
  const interactive = (target as Element).closest(
    'a, button, input, textarea, select, label, [role="checkbox"], [role="button"], [role="combobox"], [data-peek-ignore]',
  )
  // The container itself may carry a role (a draggable card is a "button").
  return Boolean(
    interactive && interactive !== container && container.contains(interactive),
  )
}

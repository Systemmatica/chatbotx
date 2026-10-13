import { toast } from "sonner"

/** One toast slot: a newer deletion replaces the previous offer to undo. */
export const DELETED_UNDO_TOAST_ID = "flow-deleted-undo"

/**
 * Remembers which undo entry a deletion produced. The undo is only offered
 * while that entry is still the latest one; once anything else was recorded
 * (or the user already undid it) undoing would revert the wrong change.
 */
export const createUndoGuard = <Token>(readLatest: () => Token) => {
  const token = readLatest()
  return {
    token,
    isLatest: () => token !== undefined && readLatest() === token,
  }
}

type ShowUndoToastInput = {
  message: string
  actionLabel: string
  /** Whether undoing still reverts exactly this deletion. */
  canUndo: () => boolean
  undo: () => void
}

/**
 * "Deleted · Undo" toast. Clicking the action undoes only when the guard still
 * holds; otherwise the click just dismisses the toast (sonner closes it after
 * the action handler runs).
 */
export const showUndoToast = ({
  message,
  actionLabel,
  canUndo,
  undo,
}: ShowUndoToastInput) =>
  toast(message, {
    id: DELETED_UNDO_TOAST_ID,
    action: {
      label: actionLabel,
      onClick: () => {
        if (canUndo()) {
          undo()
        }
      },
    },
  })

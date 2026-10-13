import { isEditableTarget } from "../flow-edit-toolbar-keyboard"

/**
 * Whether a copy / cut / paste event belongs to something other than the
 * canvas: a text field or rich-text editor, or anything inside a dialog or an
 * open menu (the node editor sheet is a dialog too).
 */
export const isForeignClipboardTarget = (target: EventTarget | null) => {
  if (isEditableTarget(target)) {
    return true
  }
  if (!(target instanceof Element)) {
    return false
  }
  return Boolean(
    target.closest(
      'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="dialog"], [role="alertdialog"], [role="menu"]',
    ),
  )
}

/** A real text selection is the user copying text, not blocks. */
export const hasTextSelection = (selection: Selection | null) =>
  Boolean(selection && !selection.isCollapsed && selection.toString() !== "")

const APPLE_PLATFORM = /Mac|iPhone|iPad|iPod/

const isApplePlatform = () =>
  typeof navigator !== "undefined" &&
  APPLE_PLATFORM.test(navigator.platform || navigator.userAgent)

/** Shortcut hint for a menu, e.g. `⌘C` on Apple platforms, `Ctrl+C` elsewhere. */
export const formatModShortcut = (key: string, isApple = isApplePlatform()) =>
  isApple ? `⌘${key.toUpperCase()}` : `Ctrl+${key.toUpperCase()}`

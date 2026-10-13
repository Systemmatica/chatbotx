import type { EditorState } from "@tiptap/pm/state"

const WHITESPACE_REGEX = /\s/
const BLOCKED_MARKS = new Set(["code", "link"])

/**
 * Whether a `/` at document position `from` may open the slash menu.
 *
 * Allowed only at the start of a line (textblock start or right after a
 * hard break) or after whitespace, so `/` inside a word (`and/or`), a URL
 * (`https://…`) or glued to a variable chip/emoji never opens it. A `/`
 * typed inside inline code or a link is literal text and never triggers.
 *
 * This deliberately replaces `@tiptap/suggestion`'s `allowedPrefixes`
 * check: that one only looks inside the current text node, so a `/` in a
 * differently-marked text node right after a letter (`abc` + bold `/`)
 * would slip through.
 */
export const isSlashTriggerAllowed = (
  state: EditorState,
  from: number,
): boolean => {
  const slashNode = state.doc.nodeAt(from)
  if (slashNode?.marks.some((mark) => BLOCKED_MARKS.has(mark.type.name))) {
    return false
  }

  const $from = state.doc.resolve(from)
  if ($from.parentOffset === 0) {
    return true
  }

  const nodeBefore = $from.nodeBefore
  if (!nodeBefore) {
    return true
  }
  if (nodeBefore.type.name === "hardBreak") {
    return true
  }
  if (!nodeBefore.isText) {
    return false
  }

  const text = nodeBefore.text ?? ""
  return WHITESPACE_REGEX.test(text.at(-1) ?? "")
}

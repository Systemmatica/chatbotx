import {
  escapeHtmlText,
  parseRichText,
  type RichTextNode,
} from "@chatbotx.io/flow-config"
import type { PromptVariableOption } from "./definition"
import { toVariableMentionAttrs } from "./mention"

const LINE_BREAK_REGEX = /\r\n?|\n/
const VARIABLE_TOKEN_REGEX = /\{\{([^{}\n]+)\}\}/g

const escapeHtmlAttribute = (value: string) =>
  escapeHtmlText(value).replace(/"/g, "&quot;")

const mentionHtml = (
  attrs: ReturnType<typeof toVariableMentionAttrs>,
): string =>
  `<span data-type="mention" data-id="${escapeHtmlAttribute(attrs.id ?? "")}" data-label="${escapeHtmlAttribute(attrs.label ?? "")}" data-mention-suggestion-char="{{"></span>`

/**
 * Same token substitution as `lineToHtml` in `./mention.ts`, but operating
 * on a single already-escaped-at-the-source rich-text text run rather than a
 * whole raw line — the parent walker supplies the mark tags around this.
 */
const textRunToHtml = (
  value: string,
  optionsByValue: Map<string, PromptVariableOption>,
): string => {
  let cursor = 0
  let html = ""

  for (const match of value.matchAll(VARIABLE_TOKEN_REGEX)) {
    const rawToken = match[0]
    const token = match[1]?.trim() ?? ""
    const start = match.index ?? 0
    const option = optionsByValue.get(token)

    html += escapeHtmlText(value.slice(cursor, start))
    html += option
      ? mentionHtml(toVariableMentionAttrs(option))
      : escapeHtmlText(rawToken)
    cursor = start + rawToken.length
  }

  html += escapeHtmlText(value.slice(cursor))
  return html
}

const nodesToTiptapHtml = (
  nodes: RichTextNode[],
  optionsByValue: Map<string, PromptVariableOption>,
): string =>
  nodes
    .map((node) => {
      if (node.type === "text") {
        return textRunToHtml(node.value, optionsByValue)
      }
      const inner = nodesToTiptapHtml(node.children, optionsByValue)
      if (node.tag === "a") {
        return `<a href="${escapeHtmlAttribute(node.href ?? "")}">${inner}</a>`
      }
      return `<${node.tag}>${inner}</${node.tag}>`
    })
    .join("")

/**
 * Converts a stored `version: "v2"` string (rich-text HTML subset, `\n`
 * between paragraphs) into tiptap-parseable HTML, one `<p>` per line, with
 * `{{variable}}` tokens turned back into mention nodes exactly as
 * `plainTextToParagraphHtmlWithVariableMentions` does for plain text.
 *
 * A line that fails to parse as rich text (shouldn't happen for schema-valid
 * `v2` data, but this runs on whatever `initValue` the form hands it) falls
 * back to plain escaped text for that line rather than throwing, so a bad
 * value degrades to "shows as plain text" instead of crashing the editor.
 */
export const richTextValueToParagraphHtml = (
  value: string,
  variableOptions: PromptVariableOption[],
): string => {
  const optionsByValue = new Map(
    variableOptions.map((option) => [String(option.value), option]),
  )

  return value
    .replace(/\xA0/g, " ")
    .split(LINE_BREAK_REGEX)
    .map((line) => {
      const nodes = parseRichText(line)
      const html = nodes
        ? nodesToTiptapHtml(nodes, optionsByValue)
        : textRunToHtml(line, optionsByValue)
      return `<p>${html}</p>`
    })
    .join("")
}

import { escapeHtmlText, parseRichText, type RichTextNode } from "./parser"

const RICH_TEXT_VERSIONS = ["v1", "v2"] as const
export type SendTextStepVersion = (typeof RICH_TEXT_VERSIONS)[number]

/**
 * Absence of `version` is the complete, correct legacy value — see
 * `docs/rich-text-design.md` § Migration mechanism. Mirrors
 * `toSpreadsheetStepVersion`'s `.catch(v1)` shape without needing zod here.
 */
export const toSendTextStepVersion = (value: unknown): SendTextStepVersion =>
  value === "v2" ? "v2" : "v1"

const isRichText = (version: SendTextStepVersion | undefined): boolean =>
  toSendTextStepVersion(version) === "v2"

// ---------------------------------------------------------------------------
// Plain text (api, instagram, instagram-facebook, messenger, tiktok, zalo)
// ---------------------------------------------------------------------------

const renderPlainTextNodes = (nodes: RichTextNode[]): string =>
  nodes
    .map((node) => {
      if (node.type === "text") {
        return node.value
      }
      const inner = renderPlainTextNodes(node.children)
      if (node.tag === "a" && node.href) {
        return inner ? `${inner} (${node.href})` : node.href
      }
      return inner
    })
    .join("")

/**
 * Renders the stored `text` to plain text for channels with no formatting
 * support at all: tags dropped, links expanded to `label (url)`. `v1`
 * (legacy/absent version) passes through unchanged — it's already plain.
 */
export const richTextToPlainText = (
  text: string,
  version: SendTextStepVersion | undefined,
): string => {
  if (!isRichText(version)) {
    return text
  }
  const nodes = parseRichText(text)
  return nodes ? renderPlainTextNodes(nodes) : text
}

// ---------------------------------------------------------------------------
// Telegram (parse_mode: "HTML")
// ---------------------------------------------------------------------------

/**
 * Telegram supports exactly this tag set for `parse_mode: "HTML"`, so the
 * stored subset already *is* Telegram HTML — this re-serializes from the
 * parsed AST (rather than passing the raw string through) so a value that
 * merely looks valid but fails strict parsing never reaches Telegram as
 * trusted markup; failure falls back to plain text with entities escaped.
 */
export const richTextToTelegramHtml = (
  text: string,
  version: SendTextStepVersion | undefined,
): string => {
  if (!isRichText(version)) {
    return text
  }
  const nodes = parseRichText(text)
  if (!nodes) {
    return escapeHtmlText(text)
  }
  return renderTelegramHtmlNodes(nodes)
}

const renderTelegramHtmlNodes = (nodes: RichTextNode[]): string =>
  nodes
    .map((node) => {
      if (node.type === "text") {
        return escapeHtmlText(node.value)
      }
      const inner = renderTelegramHtmlNodes(node.children)
      if (node.tag === "a") {
        return `<a href="${escapeHtmlText(node.href ?? "")}">${inner}</a>`
      }
      return `<${node.tag}>${inner}</${node.tag}>`
    })
    .join("")

// ---------------------------------------------------------------------------
// WhatsApp markdown
// ---------------------------------------------------------------------------

const WHATSAPP_WRAP: Partial<Record<string, [string, string]>> = {
  b: ["*", "*"],
  i: ["_", "_"],
  s: ["~", "~"],
  code: ["```", "```"],
}

/**
 * Converts to WhatsApp's four-symbol markdown. WhatsApp has no link
 * syntax, so a link renders as `label (url)`, same as the plain-text
 * channels. `v1` passes through unchanged.
 */
export const richTextToWhatsappMarkdown = (
  text: string,
  version: SendTextStepVersion | undefined,
): string => {
  if (!isRichText(version)) {
    return text
  }
  const nodes = parseRichText(text)
  return nodes ? renderWhatsappNodes(nodes) : text
}

const renderWhatsappNodes = (nodes: RichTextNode[]): string =>
  nodes
    .map((node) => {
      if (node.type === "text") {
        return node.value
      }
      const inner = renderWhatsappNodes(node.children)
      if (node.tag === "a" && node.href) {
        return inner ? `${inner} (${node.href})` : node.href
      }
      const wrap = WHATSAPP_WRAP[node.tag]
      return wrap ? `${wrap[0]}${inner}${wrap[1]}` : inner
    })
    .join("")

// ---------------------------------------------------------------------------
// Length limit — visible text only
// ---------------------------------------------------------------------------

const sumVisibleLength = (nodes: RichTextNode[]): number =>
  nodes.reduce((total, node) => {
    if (node.type === "text") {
      return total + Array.from(node.value).length
    }
    return total + sumVisibleLength(node.children)
  }, 0)

/**
 * The character count that should be checked against `SEND_TEXT_MAX` /
 * `TIKTOK_CARD_TITLE_MAX` — markup itself never counts. For `v1` this is
 * just the string's own length (unchanged legacy behavior). For `v2`, an
 * unparseable string (should not happen past schema validation, but this
 * helper is also used pre-validation by UI notices) falls back to raw
 * length so the limit stays conservative rather than silently permissive.
 */
export const getVisibleTextLength = (
  text: string,
  version: SendTextStepVersion | undefined,
): number => {
  if (!isRichText(version)) {
    return Array.from(text).length
  }
  const nodes = parseRichText(text)
  return nodes ? sumVisibleLength(nodes) : Array.from(text).length
}

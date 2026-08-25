import { escapeHtmlText, RICH_TEXT_TAGS, type RichTextTag } from "./parser"

/**
 * Minimal shape of a tiptap `editor.getJSON()` document — only the parts
 * this module reads. Kept local (not imported from `@tiptap/core`) so this
 * package doesn't gain a tiptap dependency just to describe the shape.
 */
export type TiptapMark = { type: string; attrs?: Record<string, unknown> }
export type TiptapNode = {
  type: string
  text?: string
  marks?: TiptapMark[]
  content?: TiptapNode[]
  // Only read by atom-node flattening (mention/emoji, in the builder's
  // rich-text-doc.ts) — opaque here since this module has no opinion on
  // any particular node type's attrs shape.
  attrs?: Record<string, unknown>
}

const MARK_TAG: Record<string, RichTextTag> = {
  bold: "b",
  italic: "i",
  strike: "s",
  code: "code",
  link: "a",
}

// Render order when multiple marks apply to the same run — outermost first.
// Fixed order keeps output deterministic regardless of the order marks were
// applied in the editor.
const TAG_ORDER: RichTextTag[] = ["a", "b", "i", "s", "code"]

type Run = { text: string; tags: RichTextTag[]; href?: string }

const collectRuns = (nodes: TiptapNode[] | undefined, runs: Run[]): void => {
  if (!nodes) {
    return
  }
  for (const node of nodes) {
    if (node.type === "text" && typeof node.text === "string") {
      const tags: RichTextTag[] = []
      let href: string | undefined
      for (const mark of node.marks ?? []) {
        const tag = MARK_TAG[mark.type]
        if (!(tag && RICH_TEXT_TAGS.includes(tag))) {
          continue
        }
        tags.push(tag)
        if (tag === "a") {
          const rawHref = mark.attrs?.href
          href = typeof rawHref === "string" ? rawHref : undefined
        }
      }
      if (node.text.length > 0) {
        runs.push({ text: node.text, tags, href })
      }
      continue
    }
    if (node.type === "hardBreak") {
      runs.push({ text: "\n", tags: [] })
      continue
    }
    // Any other inline node type (mentions render through their own
    // renderText, handled by the caller before this runs) — recurse into
    // children defensively so nothing is silently dropped.
    collectRuns(node.content, runs)
  }
}

const renderRun = (run: Run): string => {
  const body = escapeHtmlText(run.text)
  const ordered = TAG_ORDER.filter((tag) => run.tags.includes(tag))
  return ordered.reduce((acc, tag) => {
    if (tag === "a") {
      const href = run.href ? escapeHtmlText(run.href) : ""
      return href ? `<a href="${href}">${acc}</a>` : acc
    }
    return `<${tag}>${acc}</${tag}>`
  }, body)
}

/**
 * Converts a tiptap document (`editor.getJSON()`) into the canonical
 * `version: "v2"` string: paragraphs joined by `\n` (block breaks and
 * `hardBreak` nodes are both flattened to a single `\n`, matching the old
 * `getText({ blockSeparator: "\n" })` layout so switching to rich text
 * doesn't also change line spacing), inline runs wrapped in the allowed
 * tags, text escaped. Only marks configured on the editor
 * (`bold/italic/strike/code/link`) are ever consulted, so this cannot
 * produce a tag outside the subset even if tiptap's schema grows later.
 */
export const tiptapDocToRichText = (doc: TiptapNode): string => {
  const paragraphs = doc.content ?? []
  const lines = paragraphs.map((paragraph) => {
    const runs: Run[] = []
    collectRuns(paragraph.content, runs)
    return runs.map(renderRun).join("")
  })
  return lines.join("\n")
}

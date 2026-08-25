/**
 * A hand-rolled parser for the small, closed HTML subset a `sendText` step's
 * `text` can hold once `version: "v2"`. Deliberately not a general HTML
 * parser (no `jsdom`/DOMParser) so it works identically in the browser
 * (builder) and in Node (channel integrations, worker import validation)
 * without adding a DOM dependency to backend packages.
 *
 * Grammar: a sequence of text runs and inline elements. Elements may nest
 * (e.g. bold text inside a link, or a link inside bold text) but only among
 * the five allowed tags, each with at most the one attribute `a` needs.
 * Anything else — an unknown tag, an unexpected attribute, an unterminated
 * tag, a malformed `href` — makes parsing fail (`null`), which is the hook
 * `sendTextStepSchema` uses to reject input that didn't come from the
 * editor's own serializer.
 */

export const RICH_TEXT_TAGS = ["b", "i", "s", "code", "a"] as const
export type RichTextTag = (typeof RICH_TEXT_TAGS)[number]

export type RichTextNode =
  | { type: "text"; value: string }
  | {
      type: "element"
      tag: RichTextTag
      href?: string
      children: RichTextNode[]
    }

const TAG_SET: ReadonlySet<string> = new Set(RICH_TEXT_TAGS)

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  "#39": "'",
  apos: "'",
}

export const escapeHtmlText = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

const decodeEntities = (value: string): string =>
  value.replace(/&(#39|amp|lt|gt|quot|apos);/g, (_match, name: string) => {
    const mapped = ENTITY_MAP[name]
    return mapped ?? _match
  })

const SAFE_HREF_SCHEME_REGEX = /^(https?:|mailto:|tel:)/i

const isSafeHref = (href: string): boolean => {
  if (href.length === 0 || href.length > 2048) {
    return false
  }
  // Reject the classic HTML-injection vector for anchors: a scheme other
  // than http(s)/mailto/tel, or a relative/protocol-relative value passed
  // straight through. The editor only ever writes http(s) links, but
  // `text` can also arrive via direct API/import writes.
  return SAFE_HREF_SCHEME_REGEX.test(href)
}

type Token =
  | { kind: "text"; value: string }
  | { kind: "open"; tag: string; href?: string }
  | { kind: "close"; tag: string }

const OPEN_TAG_REGEX = /^<(b|i|s|code|a)((?:\s+[a-z]+="[^"]*")*)\s*>/i
const CLOSE_TAG_REGEX = /^<\/(b|i|s|code|a)\s*>/i
const HREF_ATTR_REGEX = /\shref="([^"]*)"/i
const UNESCAPED_AMPERSAND_REGEX = /&(?!(#39|amp|lt|gt|quot|apos);)/

const tokenize = (html: string): Token[] | null => {
  const tokens: Token[] = []
  let index = 0

  while (index < html.length) {
    const rest = html.slice(index)

    if (rest[0] === "<") {
      const openMatch = OPEN_TAG_REGEX.exec(rest)
      if (openMatch) {
        const tag = openMatch[1]?.toLowerCase() as string
        const attrs = openMatch[2] ?? ""

        if (tag === "a") {
          const hrefMatch = HREF_ATTR_REGEX.exec(attrs)
          if (!hrefMatch) {
            return null
          }
          const href = decodeEntities(hrefMatch[1] ?? "")
          if (!isSafeHref(href)) {
            return null
          }
          // No attributes other than href are allowed on <a>, and no
          // attributes at all on the other tags.
          const remaining = attrs.replace(HREF_ATTR_REGEX, "").trim()
          if (remaining.length > 0) {
            return null
          }
          tokens.push({ kind: "open", tag, href })
        } else {
          if (attrs.trim().length > 0) {
            return null
          }
          tokens.push({ kind: "open", tag })
        }

        index += openMatch[0].length
        continue
      }

      const closeMatch = CLOSE_TAG_REGEX.exec(rest)
      if (closeMatch) {
        tokens.push({ kind: "close", tag: (closeMatch[1] ?? "").toLowerCase() })
        index += closeMatch[0].length
        continue
      }

      // A bare "<" that isn't one of our known tags — not valid input.
      return null
    }

    const nextTagIndex = rest.indexOf("<")
    const rawText = nextTagIndex === -1 ? rest : rest.slice(0, nextTagIndex)
    // Any unescaped "&" not starting a known entity is invalid — protects
    // against a raw ampersand smuggled in outside the editor's serializer.
    if (UNESCAPED_AMPERSAND_REGEX.test(rawText)) {
      return null
    }
    tokens.push({ kind: "text", value: decodeEntities(rawText) })
    index += rawText.length || 1
  }

  return tokens
}

/**
 * Parses the stored `text` for a `version: "v2"` step into an AST, or
 * returns `null` if the string is not valid rich-text markup (outside the
 * five-tag subset, malformed attributes, mismatched tags, unsafe `href`).
 */
export const parseRichText = (html: string): RichTextNode[] | null => {
  const tokens = tokenize(html)
  if (!tokens) {
    return null
  }

  type Frame = {
    tag: RichTextTag | null
    href?: string
    children: RichTextNode[]
  }
  const stack: Frame[] = [{ tag: null, children: [] }]

  for (const token of tokens) {
    if (token.kind === "text") {
      if (token.value.length > 0) {
        const top = stack.at(-1)
        top?.children.push({ type: "text", value: token.value })
      }
      continue
    }

    if (token.kind === "open") {
      if (!TAG_SET.has(token.tag)) {
        return null
      }
      stack.push({
        tag: token.tag as RichTextTag,
        href: token.href,
        children: [],
      })
      continue
    }

    // close
    const top = stack.pop()
    if (!top || top.tag !== token.tag) {
      return null
    }
    const parent = stack.at(-1)
    if (!parent) {
      return null
    }
    parent.children.push({
      type: "element",
      tag: top.tag as RichTextTag,
      href: top.href,
      children: top.children,
    })
  }

  if (stack.length !== 1) {
    // Unclosed tag.
    return null
  }

  return stack[0]?.children ?? []
}

/** True when `text` parses cleanly as the rich-text subset. */
export const isValidRichText = (html: string): boolean =>
  parseRichText(html) !== null

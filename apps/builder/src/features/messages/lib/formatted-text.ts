/**
 * Strict allow-list parser for the HTML formatting bots send to chat channels
 * (Telegram `parse_mode: "HTML"` and the flow editor's rich-text subset, which
 * is stored verbatim as the message text).
 *
 * It never produces HTML: the result is a small AST that the inbox renders as
 * React elements, or flattens to plain text for previews. Anything outside the
 * allow-list is dropped — unknown tags lose their markup but keep their text,
 * and the content of executable/embedded elements (`script`, `style`, …) is
 * dropped entirely. Attributes are ignored except a link's `href`, which must
 * use a safe scheme. Parsing never fails, so arbitrary input is always shown
 * as something readable.
 */

export const FORMATTED_TAGS = [
  "b",
  "i",
  "u",
  "s",
  "code",
  "pre",
  "a",
  "blockquote",
  "spoiler",
] as const
export type FormattedTag = (typeof FORMATTED_TAGS)[number]

export type FormattedNode =
  | { type: "text"; value: string }
  | { type: "break" }
  | {
      type: "element"
      tag: FormattedTag
      /** Only on `a`, and only when the URL uses a safe scheme. */
      href?: string
      children: FormattedNode[]
    }

const TAG_ALIASES: Record<string, FormattedTag> = {
  b: "b",
  strong: "b",
  i: "i",
  em: "i",
  u: "u",
  ins: "u",
  s: "s",
  strike: "s",
  del: "s",
  code: "code",
  pre: "pre",
  a: "a",
  blockquote: "blockquote",
  "tg-spoiler": "spoiler",
}

/** Elements whose whole content is dropped, not just their markup. */
const DROP_CONTENT_TAGS: ReadonlySet<string> = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "noscript",
  "template",
  "textarea",
  "title",
  "svg",
  "math",
])

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
}

const ENTITY_REGEX = /&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z]{2,8});/gi
const MAX_CODE_POINT = 0x10_ff_ff

export const decodeHtmlEntities = (value: string): string =>
  value.replace(ENTITY_REGEX, (match, body: string) => {
    if (body[0] === "#") {
      const isHex = body[1] === "x" || body[1] === "X"
      const codePoint = Number.parseInt(
        body.slice(isHex ? 2 : 1),
        isHex ? 16 : 10,
      )
      const isValid =
        Number.isFinite(codePoint) &&
        codePoint > 0 &&
        codePoint <= MAX_CODE_POINT &&
        !(codePoint >= 0xd8_00 && codePoint <= 0xdf_ff)
      return isValid ? String.fromCodePoint(codePoint) : match
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match
  })

const SAFE_HREF_REGEX = /^(https?:\/\/|mailto:|tel:)/i
const MAX_HREF_LENGTH = 2048

const toSafeHref = (raw: string | undefined): string | undefined => {
  if (!raw) {
    return
  }
  const href = decodeHtmlEntities(raw).trim()
  if (href.length > MAX_HREF_LENGTH || !SAFE_HREF_REGEX.test(href)) {
    return
  }
  return href
}

// `<tag attr="v" attr2='v' attr3=v flag>` or `</tag>`; attributes are only
// captured so a `>` inside a quoted value does not end the tag early.
const TAG_REGEX =
  /^<(\/?)([a-z][a-z0-9-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'<>`]+))?)*)\s*(\/?)>/i
const ATTR_REGEX =
  /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>`]+)))?/g
const COMMENT_REGEX = /^<!--[\s\S]*?(?:-->|$)/
const WHITESPACE_REGEX = /\s+/

const parseAttributes = (raw: string): Map<string, string> => {
  const attributes = new Map<string, string>()
  for (const match of raw.matchAll(ATTR_REGEX)) {
    const name = match[1]?.toLowerCase()
    if (name && !attributes.has(name)) {
      attributes.set(name, match[2] ?? match[3] ?? match[4] ?? "")
    }
  }
  return attributes
}

type Frame = {
  tag: FormattedTag | null
  /** Raw tag name that opened the frame, so `</span>` closes a span spoiler. */
  source: string
  href?: string
  children: FormattedNode[]
}

const pushText = (frame: Frame, value: string) => {
  if (!value) {
    return
  }
  const last = frame.children.at(-1)
  if (last?.type === "text") {
    last.value += value
    return
  }
  frame.children.push({ type: "text", value })
}

const closeFrame = (stack: Frame[]) => {
  const frame = stack.pop()
  const parent = stack.at(-1)
  if (!(frame && parent && frame.tag)) {
    return
  }
  parent.children.push({
    type: "element",
    tag: frame.tag,
    href: frame.href,
    children: frame.children,
  })
}

const findDropContentEnd = (input: string, from: number, name: string) => {
  const closing = new RegExp(`</${name}\\s*>`, "i").exec(input.slice(from))
  return closing ? from + closing.index + closing[0].length : input.length
}

const openTag = (
  stack: Frame[],
  name: string,
  attributes: Map<string, string>,
) => {
  if (name === "span") {
    const classes = (attributes.get("class") ?? "").split(WHITESPACE_REGEX)
    if (classes.includes("tg-spoiler")) {
      stack.push({ tag: "spoiler", source: name, children: [] })
    }
    return
  }
  const tag = TAG_ALIASES[name]
  if (!tag) {
    return
  }
  stack.push({
    tag,
    source: name,
    href: tag === "a" ? toSafeHref(attributes.get("href")) : undefined,
    children: [],
  })
}

const closeTag = (stack: Frame[], name: string) => {
  // Close up to the nearest frame opened by the same tag; a stray closing
  // tag with no matching opener is ignored.
  for (let index = stack.length - 1; index > 0; index--) {
    if (stack[index]?.source === name) {
      while (stack.length > index) {
        closeFrame(stack)
      }
      return
    }
  }
}

export const parseFormattedText = (input: string): FormattedNode[] => {
  const stack: Frame[] = [{ tag: null, source: "", children: [] }]
  let index = 0

  while (index < input.length) {
    const top = stack.at(-1) as Frame
    const nextTag = input.indexOf("<", index)
    if (nextTag === -1) {
      pushText(top, decodeHtmlEntities(input.slice(index)))
      break
    }
    if (nextTag > index) {
      pushText(top, decodeHtmlEntities(input.slice(index, nextTag)))
      index = nextTag
      continue
    }

    const rest = input.slice(index)
    const comment = COMMENT_REGEX.exec(rest)
    if (comment) {
      index += comment[0].length
      continue
    }

    const match = TAG_REGEX.exec(rest)
    if (!match) {
      // A literal "<" that does not start a tag.
      pushText(top, "<")
      index += 1
      continue
    }

    index += match[0].length
    const isClosing = match[1] === "/"
    const name = (match[2] ?? "").toLowerCase()
    const isSelfClosing = match[4] === "/"

    if (DROP_CONTENT_TAGS.has(name)) {
      if (!(isClosing || isSelfClosing)) {
        index = findDropContentEnd(input, index, name)
      }
      continue
    }
    if (name === "br") {
      top.children.push({ type: "break" })
      continue
    }
    if (isClosing) {
      closeTag(stack, name)
      continue
    }
    if (!isSelfClosing) {
      openTag(stack, name, parseAttributes(match[3] ?? ""))
    }
  }

  while (stack.length > 1) {
    closeFrame(stack)
  }
  return stack[0]?.children ?? []
}

const MARKUP_HINT_REGEX =
  /<\/?[a-z][a-z0-9-]*[\s/>]|<!--|&(#x?[0-9a-f]+|[a-z]+);/i

/** Cheap check: does the text carry any markup or entity worth parsing? */
export const hasFormattingMarkup = (input: string): boolean =>
  MARKUP_HINT_REGEX.test(input)

const nodesToPlainText = (nodes: FormattedNode[]): string =>
  nodes
    .map((node) => {
      if (node.type === "text") {
        return node.value
      }
      if (node.type === "break") {
        return "\n"
      }
      return nodesToPlainText(node.children)
    })
    .join("")

/** Tags stripped and entities decoded — for one-line previews. */
export const formattedTextToPlainText = (input: string): string =>
  hasFormattingMarkup(input)
    ? nodesToPlainText(parseFormattedText(input))
    : input

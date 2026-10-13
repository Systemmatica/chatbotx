import { describe, expect, it } from "vitest"
import {
  decodeHtmlEntities,
  type FormattedNode,
  formattedTextToPlainText,
  hasFormattingMarkup,
  parseFormattedText,
} from "../formatted-text"

const INJECTION_REGEX = /alert|onerror|onclick|steal/

const collect = (
  nodes: FormattedNode[],
  out: { tags: string[]; hrefs: string[] } = { tags: [], hrefs: [] },
) => {
  for (const node of nodes) {
    if (node.type === "element") {
      out.tags.push(node.tag)
      if (node.href) {
        out.hrefs.push(node.href)
      }
      collect(node.children, out)
    }
  }
  return out
}

describe("parseFormattedText", () => {
  it("parses the Telegram HTML tag set", () => {
    const nodes = parseFormattedText(
      "<b>Who</b> <i>we</i> <u>are</u> <s>x</s> <code>y</code> <pre>z</pre> <blockquote>q</blockquote> <tg-spoiler>secret</tg-spoiler>",
    )
    expect(collect(nodes).tags).toEqual([
      "b",
      "i",
      "u",
      "s",
      "code",
      "pre",
      "blockquote",
      "spoiler",
    ])
  })

  it("maps aliases and span spoilers", () => {
    const nodes = parseFormattedText(
      '<strong>a</strong><em>b</em><ins>c</ins><del>d</del><span class="tg-spoiler">e</span>',
    )
    expect(collect(nodes).tags).toEqual(["b", "i", "u", "s", "spoiler"])
  })

  it("keeps safe links and decodes entities in href", () => {
    const nodes = parseFormattedText(
      '<a href="https://example.com/?a=1&amp;b=2">Site</a>',
    )
    expect(nodes).toEqual([
      {
        type: "element",
        tag: "a",
        href: "https://example.com/?a=1&b=2",
        children: [{ type: "text", value: "Site" }],
      },
    ])
  })

  it("drops unsafe link schemes but keeps the label", () => {
    for (const href of [
      "javascript:alert(1)",
      " JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "//evil.example",
    ]) {
      const nodes = parseFormattedText(`<a href="${href}">label</a>`)
      expect(collect(nodes).hrefs).toEqual([])
      expect(formattedTextToPlainText(`<a href="${href}">label</a>`)).toBe(
        "label",
      )
    }
  })

  it("removes script content and event-handler attributes", () => {
    const input =
      '<b onclick="steal()">hi</b><script>alert("x")</script><img src=x onerror="alert(1)"><iframe src="https://evil.example"></iframe>'
    const nodes = parseFormattedText(input)
    expect(nodes).toEqual([
      {
        type: "element",
        tag: "b",
        href: undefined,
        children: [{ type: "text", value: "hi" }],
      },
    ])
    expect(JSON.stringify(nodes)).not.toMatch(INJECTION_REGEX)
  })

  it("drops unclosed script content to the end", () => {
    expect(formattedTextToPlainText("ok<script>alert(1)")).toBe("ok")
  })

  it("keeps unknown tags' text and literal angle brackets", () => {
    expect(formattedTextToPlainText("<div>a</div> 1 < 2 > 0")).toBe(
      "a 1 < 2 > 0",
    )
  })

  it("closes unclosed tags and ignores stray closing tags", () => {
    const nodes = parseFormattedText("<b>bold <i>both</b> tail</i>")
    expect(collect(nodes).tags).toEqual(["b", "i"])
    expect(formattedTextToPlainText("<b>bold <i>both</b> tail</i>")).toBe(
      "bold both tail",
    )
  })

  it("turns <br> into a line break", () => {
    expect(formattedTextToPlainText("a<br>b<br/>c")).toBe("a\nb\nc")
  })
})

describe("formattedTextToPlainText", () => {
  it("strips tags and decodes entities", () => {
    expect(
      formattedTextToPlainText(
        '<b>Who we are</b>\n<a href="https://example.com">Site</a> &amp; more &lt;3 &#128512;',
      ),
    ).toBe("Who we are\nSite & more <3 😀")
  })

  it("returns plain text unchanged", () => {
    expect(formattedTextToPlainText("just text")).toBe("just text")
  })
})

describe("hasFormattingMarkup", () => {
  it("detects tags and entities only", () => {
    expect(hasFormattingMarkup("<b>x</b>")).toBe(true)
    expect(hasFormattingMarkup("a &amp; b")).toBe(true)
    expect(hasFormattingMarkup("1 < 2 & 3 > 2")).toBe(false)
  })
})

describe("decodeHtmlEntities", () => {
  it("leaves unknown and invalid entities alone", () => {
    expect(decodeHtmlEntities("&bogus; &#0; &#xD800;")).toBe(
      "&bogus; &#0; &#xD800;",
    )
  })
})

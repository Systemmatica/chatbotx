import { describe, expect, test } from "vitest"
import { tiptapDocToRichText } from "../src/rich-text/from-doc"
import { isValidRichText, parseRichText } from "../src/rich-text/parser"
import {
  getVisibleTextLength,
  richTextToPlainText,
  richTextToTelegramHtml,
  richTextToWhatsappMarkdown,
} from "../src/rich-text/renderers"
import { sendTextStepDefaultFn } from "../src/steps/send-text"

describe("parseRichText", () => {
  test("parses plain text", () => {
    expect(parseRichText("hello world")).toEqual([
      { type: "text", value: "hello world" },
    ])
  })

  test("parses all five allowed tags", () => {
    const nodes = parseRichText(
      '<b>bold</b> <i>italic</i> <s>strike</s> <code>code</code> <a href="https://example.com">link</a>',
    )
    expect(nodes).not.toBeNull()
    expect(nodes).toMatchObject([
      { type: "element", tag: "b" },
      { type: "text", value: " " },
      { type: "element", tag: "i" },
      { type: "text", value: " " },
      { type: "element", tag: "s" },
      { type: "text", value: " " },
      { type: "element", tag: "code" },
      { type: "text", value: " " },
      { type: "element", tag: "a", href: "https://example.com" },
    ])
  })

  test("parses nested marks", () => {
    const nodes = parseRichText(
      '<a href="https://example.com"><b>bold link</b></a>',
    )
    expect(nodes).toEqual([
      {
        type: "element",
        tag: "a",
        href: "https://example.com",
        children: [
          {
            type: "element",
            tag: "b",
            href: undefined,
            children: [{ type: "text", value: "bold link" }],
          },
        ],
      },
    ])
  })

  test("decodes entities in text", () => {
    expect(parseRichText("5 &lt; 10 &amp; 10 &gt; 5")).toEqual([
      { type: "text", value: "5 < 10 & 10 > 5" },
    ])
  })

  test.each([
    ["unknown tag", "<script>alert(1)</script>"],
    ["unterminated tag", "<b>bold"],
    ["mismatched close", "<b>bold</i>"],
    ["attribute on non-link tag", '<b class="x">bold</b>'],
    ["extra attribute on link", '<a href="https://x.com" onclick="x()">x</a>'],
    ["javascript: href", '<a href="javascript:alert(1)">x</a>'],
    ["relative href", '<a href="/path">x</a>'],
    ["bare ampersand", "Tom & Jerry"],
    ["bare angle bracket", "5 < 10"],
  ])("rejects: %s", (_label, input) => {
    expect(parseRichText(input)).toBeNull()
    expect(isValidRichText(input)).toBe(false)
  })

  test.each([
    "mailto:a@example.com",
    "tel:+15551234567",
    "https://x.com",
  ])("accepts safe href scheme: %s", (href) => {
    expect(isValidRichText(`<a href="${href}">x</a>`)).toBe(true)
  })
})

describe("tiptapDocToRichText", () => {
  test("flattens paragraphs and hard breaks to \\n", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "line one" }],
        },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "line two" },
            { type: "hardBreak" },
            { type: "text", text: "still line two" },
          ],
        },
      ],
    }
    expect(tiptapDocToRichText(doc)).toBe("line one\nline two\nstill line two")
  })

  test("wraps marks in the canonical tags and escapes text", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "5 < 10 & bold",
              marks: [{ type: "bold" }],
            },
            {
              type: "text",
              text: "link",
              marks: [{ type: "link", attrs: { href: "https://example.com" } }],
            },
          ],
        },
      ],
    }
    expect(tiptapDocToRichText(doc)).toBe(
      '<b>5 &lt; 10 &amp; bold</b><a href="https://example.com">link</a>',
    )
  })

  test("drops marks outside the allowed subset (defense in depth)", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "text",
              marks: [{ type: "underline" }],
            },
          ],
        },
      ],
    }
    expect(tiptapDocToRichText(doc)).toBe("text")
  })
})

describe("channel renderers", () => {
  const richText = '<b>Hello</b> <a href="https://example.com">world</a>'

  test("v1/absent passes every renderer through unchanged, including raw < & >", () => {
    const legacy = "5 < 10 & raw text"
    expect(richTextToPlainText(legacy, undefined)).toBe(legacy)
    expect(richTextToPlainText(legacy, "v1")).toBe(legacy)
    expect(richTextToTelegramHtml(legacy, undefined)).toBe(legacy)
    expect(richTextToWhatsappMarkdown(legacy, undefined)).toBe(legacy)
    expect(getVisibleTextLength(legacy, undefined)).toBe(legacy.length)
  })

  test("richTextToPlainText strips tags and expands links", () => {
    expect(richTextToPlainText(richText, "v2")).toBe(
      "Hello world (https://example.com)",
    )
  })

  test("richTextToTelegramHtml re-serializes the safe HTML subset", () => {
    expect(richTextToTelegramHtml(richText, "v2")).toBe(richText)
  })

  test("richTextToTelegramHtml escapes text nodes containing < & >", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "5 < 10 & true" }],
        },
      ],
    }
    const stored = tiptapDocToRichText(doc)
    expect(richTextToTelegramHtml(stored, "v2")).toBe("5 &lt; 10 &amp; true")
  })

  test("richTextToWhatsappMarkdown converts to WhatsApp's four-symbol markdown", () => {
    expect(
      richTextToWhatsappMarkdown(
        "<b>bold</b> <i>italic</i> <s>strike</s> <code>code</code>",
        "v2",
      ),
    ).toBe("*bold* _italic_ ~strike~ ```code```")
  })

  test("richTextToWhatsappMarkdown expands links the same way as plain text", () => {
    expect(richTextToWhatsappMarkdown(richText, "v2")).toBe(
      "*Hello* world (https://example.com)",
    )
  })

  test("getVisibleTextLength counts only text content, not markup", () => {
    expect(getVisibleTextLength(richText, "v2")).toBe("Hello world".length)
  })

  test("unparseable v2 text falls back to raw string rather than throwing", () => {
    const broken = "<b>unterminated"
    expect(richTextToPlainText(broken, "v2")).toBe(broken)
    expect(richTextToWhatsappMarkdown(broken, "v2")).toBe(broken)
    expect(getVisibleTextLength(broken, "v2")).toBe(broken.length)
  })
})

describe("sendTextStepDefaultFn version heuristic", () => {
  test("a genuinely blank step (no text supplied) defaults to v2, ready for the rich editor", () => {
    expect(sendTextStepDefaultFn().version).toBe("v2")
    expect(sendTextStepDefaultFn({}).version).toBe("v2")
  })

  test("a step constructed with existing text (worker/business synthesis) stays legacy v1 (no version) unless the caller opts in", () => {
    expect(sendTextStepDefaultFn({ text: "Hello" }).version).toBeUndefined()
  })

  test("an explicit version always wins over the heuristic", () => {
    expect(
      sendTextStepDefaultFn({ text: "Hello", version: "v2" }).version,
    ).toBe("v2")
  })
})

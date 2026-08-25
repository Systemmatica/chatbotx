import { describe, expect, test } from "vitest"
import type { PromptVariableOption } from "../extensions/variable-injection/definition"
import { richTextValueToParagraphHtml } from "../extensions/variable-injection/rich-text-mention"

const options: PromptVariableOption[] = [
  { label: "Customer name", value: "customerName" },
]

describe("richTextValueToParagraphHtml", () => {
  test("wraps each \\n-separated line in its own <p>", () => {
    expect(richTextValueToParagraphHtml("line one\nline two", [])).toBe(
      "<p>line one</p><p>line two</p>",
    )
  })

  test("preserves mark tags around plain text", () => {
    expect(
      richTextValueToParagraphHtml(
        '<b>bold</b> <a href="https://example.com">link</a>',
        [],
      ),
    ).toBe('<p><b>bold</b> <a href="https://example.com">link</a></p>')
  })

  test("turns a known variable token into a mention span, keeping surrounding marks", () => {
    const html = richTextValueToParagraphHtml(
      "Hi <b>{{customerName}}</b>!",
      options,
    )
    expect(html).toContain(
      '<b><span data-type="mention" data-id="customerName" data-label="Customer name" data-mention-suggestion-char="{{"></span></b>',
    )
    expect(html.startsWith("<p>Hi ")).toBe(true)
    expect(html.endsWith("!</p>")).toBe(true)
  })

  test("leaves an unknown variable token as literal escaped text", () => {
    expect(richTextValueToParagraphHtml("{{unknownVar}}", [])).toBe(
      "<p>{{unknownVar}}</p>",
    )
  })

  test("falls back to escaped plain text for a line that isn't valid rich-text markup", () => {
    expect(richTextValueToParagraphHtml("5 < 10 & true", [])).toBe(
      "<p>5 &lt; 10 &amp; true</p>",
    )
  })
})

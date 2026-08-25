import type { TiptapNode } from "@chatbotx.io/flow-config"
import { describe, expect, test } from "vitest"
import { flattenAtomsToText } from "../rich-text-doc"

describe("flattenAtomsToText", () => {
  test("converts a mention node into a {{id}} text node, keeping marks", () => {
    const doc: TiptapNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "mention",
              attrs: { id: "customerName", label: "Customer name" },
              marks: [{ type: "bold" }],
            },
          ],
        },
      ],
    }

    const flattened = flattenAtomsToText(doc)
    expect(flattened.content?.[0]?.content?.[0]).toEqual({
      type: "text",
      text: "{{customerName}}",
      marks: [{ type: "bold" }],
    })
  })

  test("converts a known emoji node into its literal character", () => {
    const doc: TiptapNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "emoji",
              attrs: { name: "grinning" },
            },
          ],
        },
      ],
    }

    const flattened = flattenAtomsToText(doc)
    const textNode = flattened.content?.[0]?.content?.[0]
    expect(textNode?.type).toBe("text")
    expect(textNode?.text).toBe("😀")
  })

  test("falls back to :name: for an unknown emoji shortcode", () => {
    const doc: TiptapNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "emoji",
              attrs: { name: "not-a-real-emoji" },
            },
          ],
        },
      ],
    }

    const flattened = flattenAtomsToText(doc)
    expect(flattened.content?.[0]?.content?.[0]?.text).toBe(
      ":not-a-real-emoji:",
    )
  })

  test("leaves plain text/hardBreak nodes untouched", () => {
    const doc: TiptapNode = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "hello" }, { type: "hardBreak" }],
        },
      ],
    }

    expect(flattenAtomsToText(doc)).toEqual(doc)
  })
})

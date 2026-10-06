import { describe, expect, test } from "vitest"
import { renderMonogramSvg, renderWordmarkSvg } from "../src/platform/wordmark"

describe("platform wordmark", () => {
  test("renders the brand name as escaped SVG text", () => {
    const svg = renderWordmarkSvg('A&B <"Боты">', "dark")
    expect(svg).toContain("A&amp;B &lt;&quot;Боты&quot;&gt;")
    expect(svg).toContain('fill="#111827"')
    expect(svg.startsWith("<svg")).toBe(true)
  })

  test("light variant uses white text for dark backgrounds", () => {
    expect(renderWordmarkSvg("X", "light")).toContain('fill="#ffffff"')
  })

  test("monogram uses the first letter, upper-cased", () => {
    expect(renderMonogramSvg("systemmatica", "dark")).toContain(">S</text>")
    expect(renderMonogramSvg("ёлка", "dark")).toContain(">Ё</text>")
  })
})

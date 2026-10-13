import { describe, expect, it } from "vitest"
import { leadMagnetContactsHref, leadMagnetHref } from "../lead-magnets"

describe("leadMagnetHref", () => {
  it("keeps http(s) URLs", () => {
    expect(leadMagnetHref("https://example.com/file.pdf")).toBe(
      "https://example.com/file.pdf",
    )
    expect(leadMagnetHref("http://example.com")).toBe("http://example.com/")
  })

  it("adds https to a bare domain", () => {
    expect(leadMagnetHref("example.com/guide")).toBe(
      "https://example.com/guide",
    )
    expect(leadMagnetHref("  //example.com  ")).toBe("https://example.com/")
  })

  it("rejects empty values and unsafe schemes", () => {
    expect(leadMagnetHref(null)).toBeNull()
    expect(leadMagnetHref("   ")).toBeNull()
    expect(leadMagnetHref("javascript:alert(1)")).toBeNull()
    expect(leadMagnetHref("data:text/html,hi")).toBeNull()
    expect(leadMagnetHref("mailto:someone@example.com")).toBeNull()
  })
})

describe("leadMagnetContactsHref", () => {
  it("builds a tag-filtered contacts URL", () => {
    const href = leadMagnetContactsHref("1", "42")
    expect(href.startsWith("/space/1/contacts?contactFilter=")).toBe(true)
    const filter = JSON.parse(
      decodeURIComponent(href.split("contactFilter=")[1] ?? ""),
    )
    expect(filter.conditions[0]).toEqual({
      field: "tags",
      operator: "in",
      value: ["42"],
    })
  })
})

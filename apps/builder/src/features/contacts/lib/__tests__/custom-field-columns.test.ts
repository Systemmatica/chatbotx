import { describe, expect, it } from "vitest"
import {
  buildColumnVisibility,
  customFieldColumnId,
  getRowCustomFieldValue,
  normalizeInlineValue,
  parseCustomFieldColumnId,
  patchRowCustomField,
  resolveInlineCommitMode,
} from "../custom-field-columns"

const field = (customFieldId: string, value: string) => ({
  id: `ccf-${customFieldId}`,
  contactId: "1",
  customFieldId,
  value,
})

describe("custom field column ids", () => {
  it("round-trips the custom field id", () => {
    expect(parseCustomFieldColumnId(customFieldColumnId("42"))).toBe("42")
    expect(parseCustomFieldColumnId("createdAt")).toBeNull()
    expect(parseCustomFieldColumnId("cf:")).toBeNull()
  })
})

describe("resolveInlineCommitMode", () => {
  it("saves typed values on Enter/blur and picked values at once", () => {
    expect(resolveInlineCommitMode("shortText")).toBe("onEnterOrBlur")
    expect(resolveInlineCommitMode("number")).toBe("onEnterOrBlur")
    expect(resolveInlineCommitMode("email")).toBe("onEnterOrBlur")
    expect(resolveInlineCommitMode("date")).toBe("onChange")
    expect(resolveInlineCommitMode("boolean")).toBe("onChange")
    // Choice types added later pick a value too.
    expect(resolveInlineCommitMode("select")).toBe("onChange")
  })
})

describe("patchRowCustomField", () => {
  const rows = [
    { id: "1", contactCustomFields: [field("a", "old"), field("b", "keep")] },
    { id: "2", contactCustomFields: [] },
  ]

  it("updates an existing value and keeps other rows untouched", () => {
    const next = patchRowCustomField(rows, "1", "a", "new")
    expect(getRowCustomFieldValue(next[0], "a")).toBe("new")
    expect(getRowCustomFieldValue(next[0], "b")).toBe("keep")
    expect(next[1]).toBe(rows[1])
  })

  it("adds a value the contact did not have", () => {
    const next = patchRowCustomField(rows, "2", "a", "first")
    expect(getRowCustomFieldValue(next[1], "a")).toBe("first")
  })

  it("clears a value with null, and rolls back to the previous value", () => {
    const cleared = patchRowCustomField(rows, "1", "a", null)
    expect(getRowCustomFieldValue(cleared[0], "a")).toBeNull()
    const rolledBack = patchRowCustomField(cleared, "1", "a", "old")
    expect(getRowCustomFieldValue(rolledBack[0], "a")).toBe("old")
  })
})

describe("normalizeInlineValue", () => {
  it("treats blank input as clearing the field", () => {
    expect(normalizeInlineValue("  ")).toBeNull()
    expect(normalizeInlineValue(undefined)).toBeNull()
    expect(normalizeInlineValue("x")).toBe("x")
    expect(normalizeInlineValue(5)).toBe("5")
  })
})

describe("buildColumnVisibility", () => {
  it("lists every hideable column so late custom fields start hidden", () => {
    expect(
      buildColumnVisibility(["source", "cf:1", "cf:2"], ["source", "cf:2"]),
    ).toEqual({ source: true, "cf:1": false, "cf:2": true })
  })
})

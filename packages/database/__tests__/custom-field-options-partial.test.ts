import { describe, expect, it } from "vitest"
import {
  type CustomFieldOption,
  customFieldOptionsSchema,
  diffCustomFieldOptionRenames,
  findCustomFieldOption,
  isSelectCustomFieldType,
  normalizeSelectFieldValue,
  parseMultiSelectValue,
  serializeMultiSelectValue,
} from "../src/partials/custom-field"

const options: CustomFieldOption[] = [
  { id: "1", label: "Hot", color: "red" },
  { id: "2", label: "Warm", color: "orange" },
  { id: "3", label: "Cold", color: "blue" },
]

describe("customFieldOptionsSchema", () => {
  it("accepts a valid list", () => {
    expect(customFieldOptionsSchema.safeParse(options).success).toBe(true)
  })

  it("rejects duplicate labels case-insensitively", () => {
    const result = customFieldOptionsSchema.safeParse([
      { id: "1", label: "Hot", color: "red" },
      { id: "2", label: " hot ", color: "blue" },
    ])
    expect(result.success).toBe(false)
  })

  it("rejects duplicate ids", () => {
    const result = customFieldOptionsSchema.safeParse([
      { id: "1", label: "A", color: "red" },
      { id: "1", label: "B", color: "blue" },
    ])
    expect(result.success).toBe(false)
  })

  it("rejects commas, blank labels and unknown colors", () => {
    for (const option of [
      { id: "1", label: "a,b", color: "red" },
      { id: "1", label: "   ", color: "red" },
      { id: "1", label: "ok", color: "#fff" },
    ]) {
      expect(customFieldOptionsSchema.safeParse([option]).success).toBe(false)
    }
  })

  it("trims labels", () => {
    const parsed = customFieldOptionsSchema.parse([
      { id: "1", label: "  Hot ", color: "red" },
    ])
    expect(parsed[0]?.label).toBe("Hot")
  })
})

describe("multi-select value encoding", () => {
  it("parses, trims and de-duplicates", () => {
    expect(parseMultiSelectValue(" Hot,warm , ,HOT")).toEqual(["Hot", "warm"])
    expect(parseMultiSelectValue("")).toEqual([])
    expect(parseMultiSelectValue(null)).toEqual([])
  })

  it("round-trips", () => {
    const value = serializeMultiSelectValue(["Hot", "Cold"])
    expect(value).toBe("Hot, Cold")
    expect(parseMultiSelectValue(value)).toEqual(["Hot", "Cold"])
  })
})

describe("findCustomFieldOption", () => {
  it("matches case- and whitespace-insensitively", () => {
    expect(findCustomFieldOption(options, " warm ")?.id).toBe("2")
    expect(findCustomFieldOption(options, "lukewarm")).toBeUndefined()
    expect(findCustomFieldOption(null, "Hot")).toBeUndefined()
  })
})

describe("normalizeSelectFieldValue", () => {
  it("canonicalizes a select value to the option label", () => {
    expect(
      normalizeSelectFieldValue({ type: "select", options, value: "hot" }),
    ).toBe("Hot")
  })

  it("rejects a select value that is not an option", () => {
    expect(
      normalizeSelectFieldValue({ type: "select", options, value: "Maybe" }),
    ).toBeNull()
    expect(
      normalizeSelectFieldValue({ type: "select", options: null, value: "x" }),
    ).toBeNull()
  })

  it("allows clearing with a blank value", () => {
    expect(
      normalizeSelectFieldValue({ type: "select", options, value: "  " }),
    ).toBe("")
    expect(
      normalizeSelectFieldValue({ type: "multiSelect", options, value: "" }),
    ).toBe("")
  })

  it("canonicalizes multi-select values", () => {
    expect(
      normalizeSelectFieldValue({
        type: "multiSelect",
        options,
        value: "cold,HOT, cold",
      }),
    ).toBe("Cold, Hot")
  })

  it("rejects a multi-select value when any part is unknown", () => {
    expect(
      normalizeSelectFieldValue({
        type: "multiSelect",
        options,
        value: "Hot, Unknown",
      }),
    ).toBeNull()
  })
})

describe("diffCustomFieldOptionRenames", () => {
  it("reports label changes by option id only", () => {
    const next: CustomFieldOption[] = [
      { id: "1", label: "Very hot", color: "red" },
      { id: "3", label: "Cold", color: "green" },
      { id: "4", label: "New", color: "gray" },
    ]
    expect(diffCustomFieldOptionRenames(options, next)).toEqual([
      { from: "Hot", to: "Very hot" },
    ])
  })

  it("handles missing lists", () => {
    expect(diffCustomFieldOptionRenames(null, options)).toEqual([])
    expect(diffCustomFieldOptionRenames(options, undefined)).toEqual([])
  })
})

describe("isSelectCustomFieldType", () => {
  it("recognizes only select types", () => {
    expect(isSelectCustomFieldType("select")).toBe(true)
    expect(isSelectCustomFieldType("multiSelect")).toBe(true)
    expect(isSelectCustomFieldType("shortText")).toBe(false)
    expect(isSelectCustomFieldType(null)).toBe(false)
  })
})

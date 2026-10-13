import { HashIcon, MagnetIcon, TextIcon } from "lucide-react"
import { describe, expect, it } from "vitest"
import {
  CUSTOM_FIELD_ICON_NAMES,
  customFieldIconSchema,
} from "../custom-field-icon-names"
import {
  customFieldIconComponents,
  resolveCustomFieldIcon,
} from "../custom-field-icons"

describe("custom field icons", () => {
  it("has unique names, each with a component", () => {
    expect(new Set(CUSTOM_FIELD_ICON_NAMES).size).toBe(
      CUSTOM_FIELD_ICON_NAMES.length,
    )
    for (const name of CUSTOM_FIELD_ICON_NAMES) {
      expect(customFieldIconComponents[name]).toBeDefined()
    }
  })

  it("accepts only curated names", () => {
    expect(customFieldIconSchema.safeParse("magnet").success).toBe(true)
    expect(customFieldIconSchema.safeParse("Magnet").success).toBe(false)
    expect(customFieldIconSchema.safeParse("not-an-icon").success).toBe(false)
  })

  it("uses the picked icon", () => {
    expect(resolveCustomFieldIcon({ icon: "magnet", type: "number" })).toBe(
      MagnetIcon,
    )
  })

  it("falls back to the type icon", () => {
    expect(resolveCustomFieldIcon({ icon: null, type: "number" })).toBe(
      HashIcon,
    )
    expect(
      resolveCustomFieldIcon({ icon: "removed-icon", type: "number" }),
    ).toBe(HashIcon)
    expect(resolveCustomFieldIcon({ type: "unknownType" })).toBe(TextIcon)
  })
})

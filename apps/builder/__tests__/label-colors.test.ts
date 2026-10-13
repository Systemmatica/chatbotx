// @vitest-environment node

import { readFileSync } from "node:fs"
import { join } from "node:path"
import { labelColorForName, labelColors } from "@chatbotx.io/database/partials"
import { describe, expect, test } from "vitest"
import { getOptionLabelError } from "@/features/custom-fields/components/custom-field-options-editor"
import { selectValueLabels } from "@/features/custom-fields/components/select-value"
import { getLabelColorStyle, LABEL_COLOR_STYLES } from "@/lib/label-colors"

const globalsCss = readFileSync(
  join(import.meta.dirname, "../src/app/globals.css"),
  "utf8",
)

describe("label palette mapping", () => {
  test("maps every palette token", () => {
    expect(Object.keys(LABEL_COLOR_STYLES).sort()).toEqual(
      [...labelColors.options].sort(),
    )
  })

  test.each(
    labelColors.options,
  )("%s has light and dark CSS variables", (color) => {
    for (const part of ["bg", "fg"]) {
      const variable = `--label-${color}-${part}:`
      // Defined once in :root and once in .dark.
      expect(globalsCss.split(variable).length - 1).toBe(2)
    }
    expect(LABEL_COLOR_STYLES[color].chip).toContain(`--label-${color}-bg`)
  })

  test("falls back to the deterministic name color", () => {
    expect(getLabelColorStyle(null, "VIP")).toBe(
      LABEL_COLOR_STYLES[labelColorForName("VIP")],
    )
    expect(getLabelColorStyle("green", "VIP")).toBe(LABEL_COLOR_STYLES.green)
    expect(getLabelColorStyle("not-a-color", "VIP")).toBe(
      LABEL_COLOR_STYLES[labelColorForName("VIP")],
    )
  })
})

describe("option editor validation", () => {
  const options = [
    { id: "1", label: "Hot", color: "red" as const },
    { id: "2", label: "Cold", color: "blue" as const },
  ]

  test("flags empty, comma and duplicate labels", () => {
    expect(getOptionLabelError("  ", options)).toBe("required")
    expect(getOptionLabelError("a, b", options)).toBe("comma")
    expect(getOptionLabelError(" hot ", options)).toBe("duplicate")
    expect(getOptionLabelError("Warm", options)).toBeNull()
  })

  test("an option does not collide with itself", () => {
    expect(getOptionLabelError("HOT", options, "1")).toBeNull()
  })
})

describe("selectValueLabels", () => {
  test("reads select and multi-select values", () => {
    expect(selectValueLabels("select", " Hot ")).toEqual(["Hot"])
    expect(selectValueLabels("select", "")).toEqual([])
    expect(selectValueLabels("multiSelect", "Hot, Cold")).toEqual([
      "Hot",
      "Cold",
    ])
    expect(selectValueLabels("multiSelect", null)).toEqual([])
  })
})

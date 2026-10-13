import { describe, expect, it } from "vitest"
import {
  AUTO_LABEL_COLORS,
  labelColorForName,
  labelColors,
  resolveLabelColor,
} from "../src/partials/label-color"

describe("labelColorForName", () => {
  it("is deterministic for the same name", () => {
    expect(labelColorForName("VIP")).toBe(labelColorForName("VIP"))
  })

  it("ignores case and surrounding whitespace", () => {
    expect(labelColorForName("  Lead  ")).toBe(labelColorForName("lead"))
  })

  it("never auto-assigns the neutral default color", () => {
    const names = Array.from({ length: 500 }, (_, i) => `tag-${i}`)
    for (const name of names) {
      expect(labelColorForName(name)).not.toBe("default")
    }
  })

  it("spreads names across the whole auto palette", () => {
    const used = new Set(
      Array.from({ length: 500 }, (_, i) => labelColorForName(`tag-${i}`)),
    )
    expect(used.size).toBe(AUTO_LABEL_COLORS.length)
  })

  it("only returns palette tokens", () => {
    for (const name of ["", "a", "Новый клиент", "🔥"]) {
      expect(labelColors.options).toContain(labelColorForName(name))
    }
  })
})

describe("resolveLabelColor", () => {
  it("keeps a valid stored color", () => {
    expect(resolveLabelColor("red", "anything")).toBe("red")
    expect(resolveLabelColor("default", "anything")).toBe("default")
  })

  it("falls back to the name color for null or unknown tokens", () => {
    expect(resolveLabelColor(null, "VIP")).toBe(labelColorForName("VIP"))
    expect(resolveLabelColor("#ff0000", "VIP")).toBe(labelColorForName("VIP"))
  })
})

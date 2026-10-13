import { describe, expect, test } from "vitest"
import {
  formatModShortcut,
  hasTextSelection,
  isForeignClipboardTarget,
} from "../flow-clipboard-events"

describe("isForeignClipboardTarget", () => {
  test("ignores fields, rich-text editors and dialogs", () => {
    expect(isForeignClipboardTarget(document.createElement("input"))).toBe(true)
    expect(isForeignClipboardTarget(document.createElement("textarea"))).toBe(
      true,
    )

    const editor = document.createElement("div")
    editor.setAttribute("contenteditable", "true")
    const paragraph = document.createElement("p")
    editor.append(paragraph)
    expect(isForeignClipboardTarget(paragraph)).toBe(true)

    const dialog = document.createElement("div")
    dialog.setAttribute("role", "dialog")
    const button = document.createElement("button")
    dialog.append(button)
    expect(isForeignClipboardTarget(button)).toBe(true)
  })

  test("accepts the canvas and the page body", () => {
    const canvasNode = document.createElement("div")
    canvasNode.className = "react-flow__node"
    expect(isForeignClipboardTarget(canvasNode)).toBe(false)
    expect(isForeignClipboardTarget(document.body)).toBe(false)
    expect(isForeignClipboardTarget(null)).toBe(false)
  })
})

describe("hasTextSelection", () => {
  test("only a non-empty, non-collapsed selection counts", () => {
    expect(hasTextSelection(null)).toBe(false)
    expect(
      hasTextSelection({ isCollapsed: true, toString: () => "" } as Selection),
    ).toBe(false)
    expect(
      hasTextSelection({
        isCollapsed: false,
        toString: () => "hi",
      } as Selection),
    ).toBe(true)
  })
})

describe("formatModShortcut", () => {
  test("uses the platform's modifier", () => {
    expect(formatModShortcut("c", true)).toBe("⌘C")
    expect(formatModShortcut("v", false)).toBe("Ctrl+V")
  })
})

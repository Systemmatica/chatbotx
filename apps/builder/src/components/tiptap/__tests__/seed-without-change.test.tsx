// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest"
import { PlainTextTiptapEditor } from "../plain-text-tiptap-editor"
import { RichTextTiptapEditor } from "../rich-text-tiptap-editor"
import { TiptapEditor } from "../tiptap-editor"

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}))

vi.mock("../use-prompt-variable-options", () => ({
  usePromptVariableOptions: () => [],
}))

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  // jsdom has no layout; ProseMirror's coordinate lookups (used by the
  // Placeholder viewport tracking) need these to exist.
  document.elementFromPoint = () => null
  const emptyRects = () => [] as unknown as DOMRectList
  Range.prototype.getClientRects = emptyRects
  Range.prototype.getBoundingClientRect = () => new DOMRect()
  ;(
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const settle = async () => {
  // useEditor with immediatelyRender=false creates the editor in an effect,
  // then the seeding effect runs on the next render.
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await Promise.resolve()
    })
  }
}

/**
 * Seeding an editor with its stored value is not an edit: if it reported a
 * change, the node editor form would record an undo entry and mark the draft
 * dirty just because a block was opened.
 */
describe("tiptap editors seed their initial value silently", () => {
  test("rich-text editor", async () => {
    const onChange = vi.fn()
    act(() =>
      root.render(
        <RichTextTiptapEditor
          initValue="Hello **there**"
          onChange={onChange}
          version="v2"
        />,
      ),
    )
    await settle()

    expect(container.textContent).toContain("Hello")
    expect(onChange).not.toHaveBeenCalled()
  })

  test("rich-text editor with a legacy (v1) value", async () => {
    const onChange = vi.fn()
    act(() =>
      root.render(
        <RichTextTiptapEditor initValue="Legacy text" onChange={onChange} />,
      ),
    )
    await settle()

    expect(container.textContent).toContain("Legacy text")
    expect(onChange).not.toHaveBeenCalled()
  })

  test("plain tiptap editor", async () => {
    const onChange = vi.fn()
    act(() =>
      root.render(<TiptapEditor initValue="Plain text" onChange={onChange} />),
    )
    await settle()

    expect(container.textContent).toContain("Plain text")
    expect(onChange).not.toHaveBeenCalled()
  })

  test("plain-text (whitespace preserving) editor", async () => {
    const onChange = vi.fn()
    act(() =>
      root.render(
        <PlainTextTiptapEditor initValue="Line one" onChange={onChange} />,
      ),
    )
    await settle()

    expect(container.textContent).toContain("Line one")
    expect(onChange).not.toHaveBeenCalled()
  })
})

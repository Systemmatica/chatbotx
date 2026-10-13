import Mention from "@tiptap/extension-mention"
import { Editor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import { afterEach, describe, expect, test, vi } from "vitest"
import {
  buildSlashCommandItems,
  filterSlashCommandItems,
  runSlashCommand,
  type SlashCommandHandlers,
  type SlashCommandItem,
} from "../extensions/slash-command/items"
import {
  SlashCommand,
  SlashCommandPluginKey,
} from "../extensions/slash-command/slash-command"
import type { PromptVariableOption } from "../extensions/variable-injection/definition"
import {
  renderVariableMentionHTML,
  renderVariableMentionText,
} from "../extensions/variable-injection/mention"

const variables: PromptVariableOption[] = [
  { label: "First name", value: "first_name", group: "Contact" },
  { label: "Phone", value: "phone", group: "Contact" },
  { label: "Order number", value: "order_number", group: "Custom fields" },
]

const labels = {
  bold: "Bold",
  italic: "Italic",
  strike: "Strikethrough",
  code: "Code",
  link: "Link",
  emoji: "Emoji",
  lineBreak: "Line break",
}

const items = buildSlashCommandItems({ variables, labels })
const ids = (list: SlashCommandItem[]) => list.map((item) => item.id)

describe("filterSlashCommandItems", () => {
  test("empty query returns every item, grouped variables → formatting → insert", () => {
    const result = filterSlashCommandItems(items, "")
    expect(result).toHaveLength(items.length)
    expect([...new Set(result.map((item) => item.group))]).toEqual([
      "variables",
      "formatting",
      "insert",
    ])
  })

  test("matches labels case-insensitively", () => {
    expect(ids(filterSlashCommandItems(items, "PHO"))).toEqual([
      "variable:phone",
    ])
  })

  test("matches the raw variable token", () => {
    expect(ids(filterSlashCommandItems(items, "first_"))).toEqual([
      "variable:first_name",
    ])
    expect(ids(filterSlashCommandItems(items, "number"))).toEqual([
      "variable:order_number",
    ])
  })

  test("matches English and Russian aliases regardless of locale labels", () => {
    expect(ids(filterSlashCommandItems(items, "жир"))).toEqual(["format:bold"])
    expect(ids(filterSlashCommandItems(items, "зачерк"))).toEqual([
      "format:strike",
    ])
    expect(ids(filterSlashCommandItems(items, "зачёрк"))).toEqual([
      "format:strike",
    ])
    expect(ids(filterSlashCommandItems(items, "url"))).toEqual(["format:link"])
    expect(ids(filterSlashCommandItems(items, "эмодз"))).toEqual([
      "insert:emoji",
    ])
  })

  test("a bot command like /start matches nothing", () => {
    expect(filterSlashCommandItems(items, "start")).toEqual([])
    expect(filterSlashCommandItems(items, "help")).toEqual([])
  })
})

const handlers: SlashCommandHandlers = {
  openLink: vi.fn(),
  openEmojiPicker: vi.fn(),
}

let editor: Editor | undefined

const createEditor = () => {
  editor = new Editor({
    extensions: [
      StarterKit,
      Mention.configure({
        renderHTML: renderVariableMentionHTML,
        renderText: renderVariableMentionText,
      }),
      SlashCommand.configure({
        getItems: () => items,
        getHandlers: () => handlers,
      }),
    ],
  })
  return editor
}

afterEach(() => {
  editor?.destroy()
  editor = undefined
  vi.clearAllMocks()
})

const typeText = (instance: Editor, text: string) => {
  for (const char of text) {
    instance.commands.insertContent(char)
  }
}

const slashState = (instance: Editor) =>
  SlashCommandPluginKey.getState(instance.state) as {
    active: boolean
    query: string | null
    range: { from: number; to: number }
  }

describe("slash command trigger rules", () => {
  test("opens at the start of a line", () => {
    const instance = createEditor()
    typeText(instance, "/")
    expect(slashState(instance).active).toBe(true)
    expect(slashState(instance).query).toBe("")
  })

  test("opens after a space and tracks the query", () => {
    const instance = createEditor()
    typeText(instance, "Hi /bo")
    expect(slashState(instance).active).toBe(true)
    expect(slashState(instance).query).toBe("bo")
  })

  test("does not open inside a word", () => {
    const instance = createEditor()
    typeText(instance, "and/")
    expect(slashState(instance).active).toBe(false)
  })

  test("does not open inside a URL", () => {
    const instance = createEditor()
    typeText(instance, "see https://")
    expect(slashState(instance).active).toBe(false)
    typeText(instance, "example.com/b")
    expect(slashState(instance).active).toBe(false)
  })

  test("a space right after / closes the menu", () => {
    const instance = createEditor()
    typeText(instance, "/")
    expect(slashState(instance).active).toBe(true)
    typeText(instance, " ")
    expect(slashState(instance).active).toBe(false)
  })

  test("a non-matching word closes the menu and leaves /start as text", () => {
    const instance = createEditor()
    typeText(instance, "/st")
    expect(slashState(instance).active).toBe(true) // "Strikethrough"
    typeText(instance, "art")
    expect(slashState(instance).active).toBe(false)
    expect(instance.getText()).toBe("/start")
  })

  test("does not open directly after a variable chip", () => {
    const instance = createEditor()
    instance.commands.insertContent({
      type: "mention",
      attrs: { id: "first_name", label: "First name" },
    })
    typeText(instance, "/")
    expect(slashState(instance).active).toBe(false)
  })

  test("does not open inside inline code", () => {
    const instance = createEditor()
    instance.commands.toggleCode()
    typeText(instance, "/")
    expect(slashState(instance).active).toBe(false)
  })

  test("opens after a hard break", () => {
    const instance = createEditor()
    typeText(instance, "Hi")
    instance.commands.setHardBreak()
    typeText(instance, "/")
    expect(slashState(instance).active).toBe(true)
  })
})

// Same entry point the menu calls on Enter/click.
const runItem = (instance: Editor, id: string) => {
  const item = items.find((candidate) => candidate.id === id)
  if (!item) {
    throw new Error(`no item ${id}`)
  }
  runSlashCommand({
    editor: instance,
    range: slashState(instance).range,
    item,
    handlers,
  })
}

describe("runSlashCommand", () => {
  test("variable item replaces /query with the {{token}} mention chip", () => {
    const instance = createEditor()
    typeText(instance, "Hello /first")
    runItem(instance, "variable:first_name")

    expect(instance.getText()).toBe("Hello {{first_name}} ")
    const paragraph = instance.getJSON().content?.[0]
    expect(paragraph?.content?.[1]).toMatchObject({
      type: "mention",
      attrs: { id: "first_name", label: "First name" },
    })
  })

  test("mark item removes /query and formats the text typed next", () => {
    const instance = createEditor()
    typeText(instance, "Hi /bold")
    runItem(instance, "format:bold")
    typeText(instance, "x")

    expect(instance.getText()).toBe("Hi x")
    const nodes = instance.getJSON().content?.[0]?.content ?? []
    expect(nodes.at(-1)).toMatchObject({
      text: "x",
      marks: [{ type: "bold" }],
    })
  })

  test("line break item inserts a hard break", () => {
    const instance = createEditor()
    typeText(instance, "Hi /br")
    runItem(instance, "insert:lineBreak")
    expect(instance.getText({ blockSeparator: "\n" })).toBe("Hi \n")
  })

  test("link and emoji items delegate to the editor handlers", () => {
    const instance = createEditor()
    typeText(instance, "/link")
    runItem(instance, "format:link")
    expect(handlers.openLink).toHaveBeenCalledOnce()
    expect(instance.getText()).toBe("")

    typeText(instance, "/emo")
    runItem(instance, "insert:emoji")
    expect(handlers.openEmojiPicker).toHaveBeenCalledOnce()
    expect(instance.getText()).toBe("")
  })
})

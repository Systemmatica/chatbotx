import type { Editor, Range } from "@tiptap/react"
import type { PromptVariableOption } from "../variable-injection/definition"
import { toVariableMentionAttrs } from "../variable-injection/mention"

/**
 * Groups are rendered in this order. Formatting items are limited to the
 * marks the `sendText` rich-text subset can store (`b`/`i`/`s`/`code`/`a`,
 * see `packages/flow-config/src/rich-text/parser.ts`) — blockquote/spoiler
 * are deliberately absent because the parser would reject them.
 */
export const SLASH_COMMAND_GROUPS = [
  "variables",
  "formatting",
  "insert",
] as const
export type SlashCommandGroup = (typeof SLASH_COMMAND_GROUPS)[number]

export type SlashCommandMark = "bold" | "italic" | "strike" | "code"

export type SlashCommandAction =
  | { type: "variable"; option: PromptVariableOption }
  | { type: "mark"; mark: SlashCommandMark }
  | { type: "link" }
  | { type: "emoji" }
  | { type: "lineBreak" }

export type SlashCommandItem = {
  id: string
  group: SlashCommandGroup
  label: string
  /** Secondary text, e.g. the variable's group ("Contact", "Custom fields"). */
  hint?: string
  /** Extra search terms; matched case-insensitively by prefix. */
  keywords: string[]
  action: SlashCommandAction
}

export type SlashCommandLabels = Record<
  "bold" | "italic" | "strike" | "code" | "link" | "emoji" | "lineBreak",
  string
>

// Both English and Russian aliases are always searchable regardless of the
// UI locale, so "/bold" and "/жир" both work for everyone.
const STATIC_ITEMS: Array<
  Omit<SlashCommandItem, "label"> & { labelKey: keyof SlashCommandLabels }
> = [
  {
    id: "format:bold",
    group: "formatting",
    labelKey: "bold",
    keywords: ["bold", "b", "strong", "жирный"],
    action: { type: "mark", mark: "bold" },
  },
  {
    id: "format:italic",
    group: "formatting",
    labelKey: "italic",
    keywords: ["italic", "i", "em", "курсив"],
    action: { type: "mark", mark: "italic" },
  },
  {
    id: "format:strike",
    group: "formatting",
    labelKey: "strike",
    keywords: ["strikethrough", "strike", "s", "зачеркнутый", "зачёркнутый"],
    action: { type: "mark", mark: "strike" },
  },
  {
    id: "format:code",
    group: "formatting",
    labelKey: "code",
    keywords: ["code", "monospace", "код", "моноширинный"],
    action: { type: "mark", mark: "code" },
  },
  {
    id: "format:link",
    group: "formatting",
    labelKey: "link",
    keywords: ["link", "url", "href", "ссылка"],
    action: { type: "link" },
  },
  {
    id: "insert:emoji",
    group: "insert",
    labelKey: "emoji",
    keywords: ["emoji", "smile", "эмодзи", "смайл"],
    action: { type: "emoji" },
  },
  {
    id: "insert:lineBreak",
    group: "insert",
    labelKey: "lineBreak",
    keywords: ["break", "newline", "br", "перенос", "разделитель"],
    action: { type: "lineBreak" },
  },
]

export const buildSlashCommandItems = ({
  variables,
  labels,
}: {
  variables: PromptVariableOption[]
  labels: SlashCommandLabels
}): SlashCommandItem[] => [
  ...variables.map(
    (option): SlashCommandItem => ({
      id: `variable:${String(option.value)}`,
      group: "variables",
      label: option.label,
      hint: option.group,
      keywords: [String(option.value)],
      action: { type: "variable", option },
    }),
  ),
  ...STATIC_ITEMS.map(({ labelKey, ...item }) => ({
    ...item,
    label: labels[labelKey],
  })),
]

const WORD_SPLIT_REGEX = /[\s_\-.:]+/

const normalize = (value: string) => value.toLowerCase().replace(/ё/g, "е")

const matchesQuery = (item: SlashCommandItem, query: string): boolean => {
  const label = normalize(item.label)
  if (label.includes(query)) {
    return true
  }
  return item.keywords.some((keyword) => {
    const normalized = normalize(keyword)
    return (
      normalized.startsWith(query) ||
      normalized.split(WORD_SPLIT_REGEX).some((part) => part.startsWith(query))
    )
  })
}

/**
 * Filters and orders items for the current `/query`: grouped in
 * `SLASH_COMMAND_GROUPS` order, original order kept inside a group.
 * An empty result is meaningful — the extension hides the menu entirely so
 * a plain-text bot command such as `/start` can be typed undisturbed.
 */
export const filterSlashCommandItems = (
  items: SlashCommandItem[],
  query: string,
): SlashCommandItem[] => {
  const normalizedQuery = normalize(query.trim())
  const matched = normalizedQuery
    ? items.filter((item) => matchesQuery(item, normalizedQuery))
    : items
  return SLASH_COMMAND_GROUPS.flatMap((group) =>
    matched.filter((item) => item.group === group),
  )
}

export type SlashCommandHandlers = {
  /** Opens the link URL prompt (toolbar link popover). */
  openLink: () => void
  /** Opens the existing emoji picker popover. */
  openEmojiPicker: () => void
}

/**
 * Replaces the typed `/query` with the chosen item's effect. Mark items
 * toggle the stored mark at the caret, so the text typed next is formatted
 * (same behaviour as pressing Ctrl+B with an empty selection).
 */
export const runSlashCommand = ({
  editor,
  range,
  item,
  handlers,
}: {
  editor: Editor
  range: Range
  item: SlashCommandItem
  handlers: SlashCommandHandlers
}): void => {
  const chain = editor.chain().focus().deleteRange(range)
  const { action } = item

  switch (action.type) {
    case "variable":
      chain
        .insertContent([
          { type: "mention", attrs: toVariableMentionAttrs(action.option) },
          { type: "text", text: " " },
        ])
        .run()
      return
    case "mark":
      chain.toggleMark(action.mark).run()
      return
    case "lineBreak":
      chain.setHardBreak().run()
      return
    case "link":
      chain.run()
      handlers.openLink()
      return
    case "emoji":
      chain.run()
      handlers.openEmojiPicker()
      return
    default:
      throw new Error(`Unknown slash command: ${JSON.stringify(action)}`)
  }
}

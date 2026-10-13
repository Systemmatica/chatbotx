import { PluginKey } from "@tiptap/pm/state"
import { Extension } from "@tiptap/react"
import Suggestion, { type SuggestionOptions } from "@tiptap/suggestion"
import {
  filterSlashCommandItems,
  runSlashCommand,
  type SlashCommandHandlers,
  type SlashCommandItem,
} from "./items"
import { isSlashTriggerAllowed } from "./trigger"

export const SLASH_COMMAND_CHAR = "/"

const noop = () => undefined

// Own key so it never collides with the mention (`{{`) or emoji (`:`)
// suggestion plugins running in the same editor.
export const SlashCommandPluginKey = new PluginKey("slashCommand")

export type SlashCommandOptions = {
  /** Read lazily on every keystroke so live variable lists are picked up. */
  getItems: () => SlashCommandItem[]
  getHandlers: () => SlashCommandHandlers
  render?: SuggestionOptions<SlashCommandItem, SlashCommandItem>["render"]
}

/**
 * Notion-style `/` command menu for the bot message editor.
 *
 * Trigger rules (see `isSlashTriggerAllowed`): `/` at line start or after
 * whitespace; the query cannot contain spaces, so `/ ` closes the menu.
 * When nothing matches the query the suggestion is not shown at all, which
 * keeps plain-text bot commands like `/start` typeable — and Escape
 * dismisses the menu for the current `/word` without touching the text.
 */
export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      getItems: () => [],
      getHandlers: () => ({ openLink: noop, openEmojiPicker: noop }),
      render: undefined,
    }
  },

  addProseMirrorPlugins() {
    const { getItems, getHandlers, render } = this.options

    return [
      Suggestion<SlashCommandItem, SlashCommandItem>({
        editor: this.editor,
        pluginKey: SlashCommandPluginKey,
        char: SLASH_COMMAND_CHAR,
        allowSpaces: false,
        allowedPrefixes: null,
        startOfLine: false,
        decorationClass: "slash-command-suggestion",
        allow: ({ state, range }) => isSlashTriggerAllowed(state, range.from),
        shouldShow: ({ query }) =>
          filterSlashCommandItems(getItems(), query).length > 0,
        items: ({ query }) => filterSlashCommandItems(getItems(), query),
        command: ({ editor, range, props }) => {
          runSlashCommand({
            editor,
            range,
            item: props,
            handlers: getHandlers(),
          })
        },
        render,
      }),
    ]
  },
})

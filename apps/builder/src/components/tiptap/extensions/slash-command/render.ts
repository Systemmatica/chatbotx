import { ReactRenderer } from "@tiptap/react"
import type { SuggestionOptions } from "@tiptap/suggestion"
import tippy, { type Instance } from "tippy.js"
import type { SlashCommandItem } from "./items"
import {
  SlashCommandList,
  type SlashCommandListRef,
} from "./slash-command-list"

/** Popup renderer for the slash menu — same tippy setup as the `{{` menu. */
export const renderSlashCommandMenu: NonNullable<
  SuggestionOptions<SlashCommandItem, SlashCommandItem>["render"]
> = () => {
  let component: ReactRenderer<SlashCommandListRef> | undefined
  let popup: Instance | undefined

  return {
    onStart: (props) => {
      component = new ReactRenderer(SlashCommandList, {
        props,
        editor: props.editor,
      })

      popup = tippy(document.body, {
        getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
        appendTo: () => document.body,
        content: component.element,
        showOnCreate: true,
        interactive: true,
        trigger: "manual",
        placement: "bottom-start",
      })
    },

    onUpdate: (props) => {
      component?.updateProps(props)
      popup?.setProps({
        getReferenceClientRect: () => props.clientRect?.() ?? new DOMRect(),
      })
    },

    onKeyDown: (props) => {
      if (props.event.key === "Escape") {
        popup?.hide()
        return true
      }
      return component?.ref?.onKeyDown(props) ?? false
    },

    onExit: () => {
      popup?.destroy()
      component?.destroy()
      popup = undefined
      component = undefined
    },
  }
}

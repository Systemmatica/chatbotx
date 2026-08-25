"use client"

import {
  type SendTextStepVersionSchema,
  tiptapDocToRichText,
} from "@chatbotx.io/flow-config"
import Emoji, { gitHubEmojis } from "@tiptap/extension-emoji"
import Mention from "@tiptap/extension-mention"
import Placeholder from "@tiptap/extension-placeholder"
import { EditorContent, useEditor } from "@tiptap/react"
import StarterKit from "@tiptap/starter-kit"
import emojiSuggestion from "./extensions/emoij/suggestion"
import {
  plainTextToParagraphHtmlWithVariableMentions,
  renderVariableMentionHTML,
  renderVariableMentionText,
  toVariableMentionAttrs,
} from "./extensions/variable-injection/mention"
import { richTextValueToParagraphHtml } from "./extensions/variable-injection/rich-text-mention"
import variableInjectionSuggestion from "./extensions/variable-injection/suggestion"
import { htmlToPlainTextWithBlocks } from "./html-to-plain-text"
import { flattenAtomsToText } from "./rich-text-doc"
import { RichTextToolbar } from "./rich-text-toolbar"
import "./tiptap-editor.css"
import type { ChannelType } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import EmojiPicker, { type EmojiClickData } from "emoji-picker-react"
import { CodeXml, Smile } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { usePromptVariableOptions } from "./use-prompt-variable-options"

type RichTextTiptapEditorProps = {
  initValue?: string
  /** Legacy ("v1"/absent) initValue is rendered and re-serialized as plain
   * text — see docs/rich-text-design.md. Any edit promotes the step to "v2". */
  version?: SendTextStepVersionSchema
  placeholder?: string
  channels?: ChannelType[]
  includeCouponVariables?: boolean
  onChange?: (content: { text: string; version: "v2" }) => void
}

/**
 * A `sendText`-only rich text editor — deliberately not a mode added to the
 * shared `TiptapEditor`. `TiptapEditor`/`TiptapEditorField` are consumed by
 * ~20 other fields (execute-javascript, prompts, message templates, …) that
 * all expect plain text out of `onChange`; see docs/rich-text-design.md §
 * "What was deliberately not touched".
 */
export const RichTextTiptapEditor = ({
  initValue,
  version,
  onChange,
  channels,
  includeCouponVariables = false,
  placeholder = "Type a message...",
}: RichTextTiptapEditorProps) => {
  const [isOpenEmoji, setIsOpenEmoji] = useState(false)
  const [isEditorFocused, setIsEditorFocused] = useState(false)
  const [isOpenCustomField, setIsOpenCustomField] = useState(false)
  const promptVariableOptions = usePromptVariableOptions({
    channels,
    includeCouponVariables,
  })
  const promptVariableOptionsRef = useRef(promptVariableOptions)

  useEffect(() => {
    promptVariableOptionsRef.current = promptVariableOptions
  }, [promptVariableOptions])

  const tiptapEditor = useEditor({
    extensions: [
      StarterKit.configure({
        // Only the five marks the rich-text subset supports; every other
        // StarterKit node/mark is switched off so the editor can never
        // produce something outside what channels can render.
        heading: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        underline: false,
        link: {
          openOnClick: false,
          HTMLAttributes: { rel: null, target: null },
        },
      }),
      Mention.configure({
        renderHTML: renderVariableMentionHTML,
        renderText: renderVariableMentionText,
        suggestion: variableInjectionSuggestion({
          listOfPromptVariables: () => promptVariableOptionsRef.current,
        }),
      }),
      Emoji.configure({
        emojis: gitHubEmojis,
        enableEmoticons: true,
        suggestion: emojiSuggestion,
      }),
      Placeholder.configure({
        placeholder,
      }),
    ],
    parseOptions: {
      preserveWhitespace: "full",
    },
    editorProps: {
      transformPastedText(text) {
        return text.replace(/\xA0/g, " ")
      },
      // Pasted rich formatting (Word/Google Docs/websites) is intentionally
      // flattened to plain text rather than mapped into the five-tag
      // subset — matching every other tiptap field in the app, keeps the
      // conversion surface small and predictable. Manual toolbar/keyboard
      // formatting is the only way to add marks.
      transformPastedHTML(html) {
        return plainTextToParagraphHtmlWithVariableMentions(
          htmlToPlainTextWithBlocks(html),
          promptVariableOptionsRef.current,
        )
      },
    },
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      const text = tiptapDocToRichText(
        flattenAtomsToText(editor.getJSON() as never),
      )
      onChange?.({ text, version: "v2" })
    },
    onFocus: () => {
      setIsEditorFocused(true)
    },
    onBlur: () => {
      setIsEditorFocused(false)
    },
  })

  const onEmojiClick = (emojiObject: EmojiClickData) => {
    setEditorValue(emojiObject.emoji)
  }

  const setEditorValue = (value: string) => {
    if (tiptapEditor) {
      tiptapEditor.commands.insertContent(value)
      tiptapEditor.commands.focus()
    }
  }

  // Only re-runs when the editor instance or the initial value identity
  // changes — `version` is read once at mount time the same way `initValue`
  // is (see TiptapEditor, same pattern).
  // biome-ignore lint/correctness/useExhaustiveDependencies: mirrors TiptapEditor's initValue-only effect
  useEffect(() => {
    if (tiptapEditor && initValue) {
      const html =
        version === "v2"
          ? richTextValueToParagraphHtml(
              initValue,
              promptVariableOptionsRef.current,
            )
          : plainTextToParagraphHtmlWithVariableMentions(
              initValue,
              promptVariableOptionsRef.current,
            )
      tiptapEditor.commands.setContent(html)
    }
  }, [tiptapEditor, initValue])

  return (
    <div className="relative">
      <RichTextToolbar editor={tiptapEditor} />
      <EditorContent editor={tiptapEditor} />

      <div
        className={`${isEditorFocused ? "opacity-100" : "opacity-0"} absolute end-0 bottom-0 z-10 flex translate-y-full cursor-pointer items-center rounded-b-sm bg-gray-500 hover:bg-gray-600`}
      >
        <Popover onOpenChange={setIsOpenEmoji} open={isOpenEmoji}>
          <PopoverTrigger
            nativeButton={false}
            onClick={() => setIsEditorFocused(true)}
            render={
              <div className="p-2">
                <Smile className="text-white" size={14} />
              </div>
            }
          />
          <PopoverContent className="w-auto p-0">
            <EmojiPicker onEmojiClick={onEmojiClick} />
          </PopoverContent>
        </Popover>

        <Popover onOpenChange={setIsOpenCustomField} open={isOpenCustomField}>
          <PopoverTrigger
            nativeButton={false}
            onClick={() => setIsEditorFocused(true)}
            render={
              <div className="p-2">
                <CodeXml className="text-white" size={14} />
              </div>
            }
          />
          <PopoverContent className="w-auto p-0">
            {promptVariableOptions.length > 0 && (
              <div className="max-h-60 w-50 overflow-y-auto">
                {promptVariableOptions.map((field, index) => {
                  const showGroup =
                    Boolean(field.group) &&
                    promptVariableOptions[index - 1]?.group !== field.group

                  return (
                    <div key={field.value}>
                      {showGroup ? (
                        <div className="px-2 pt-2 pb-1 font-medium text-muted-foreground text-xs">
                          {field.group}
                        </div>
                      ) : null}
                      <Button
                        className="w-full cursor-pointer justify-start rounded-none p-2"
                        onClick={() => {
                          tiptapEditor
                            ?.chain()
                            .insertContent({
                              type: "mention",
                              attrs: toVariableMentionAttrs(field),
                            })
                            .focus()
                            .run()
                          setIsOpenCustomField(false)
                        }}
                        variant="ghost"
                      >
                        {field.label}
                      </Button>
                    </div>
                  )
                })}
              </div>
            )}
          </PopoverContent>
        </Popover>
      </div>
    </div>
  )
}

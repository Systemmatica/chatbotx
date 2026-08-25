"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { type Editor, useEditorState } from "@tiptap/react"
import { Bold, Code, Italic, Link2, Strikethrough } from "lucide-react"
import { useEffect, useState } from "react"

type RichTextToolbarProps = {
  editor: Editor | null
}

const MarkButton = ({
  editor,
  mark,
  label,
  icon: Icon,
  onToggle,
}: {
  editor: Editor
  mark: "bold" | "italic" | "strike" | "code"
  label: string
  icon: typeof Bold
  onToggle: () => void
}) => {
  const isActive = useEditorState({
    editor,
    selector: (ctx) => ctx.editor.isActive(mark),
  })

  return (
    <Button
      aria-label={label}
      aria-pressed={isActive}
      className={isActive ? "bg-gray-200 dark:bg-neutral-700" : undefined}
      onClick={(event) => {
        event.preventDefault()
        onToggle()
      }}
      size="icon"
      title={label}
      type="button"
      variant="ghost"
    >
      <Icon size={14} />
    </Button>
  )
}

const HREF_SCHEME_REGEX = /^(https?:|mailto:|tel:)/i

const LinkButton = ({ editor }: { editor: Editor }) => {
  const [open, setOpen] = useState(false)
  const [href, setHref] = useState("")
  const isActive = useEditorState({
    editor,
    selector: (ctx) => ctx.editor.isActive("link"),
  })

  useEffect(() => {
    if (open) {
      setHref((editor.getAttributes("link").href as string | undefined) ?? "")
    }
  }, [open, editor])

  const apply = () => {
    const trimmed = href.trim()
    if (!trimmed) {
      editor.chain().focus().extendMarkRange("link").unsetLink().run()
      setOpen(false)
      return
    }
    const withScheme = HREF_SCHEME_REGEX.test(trimmed)
      ? trimmed
      : `https://${trimmed}`
    editor
      .chain()
      .focus()
      .extendMarkRange("link")
      .setLink({ href: withScheme })
      .run()
    setOpen(false)
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        nativeButton={false}
        render={
          <Button
            aria-label="Link"
            aria-pressed={isActive}
            className={isActive ? "bg-gray-200 dark:bg-neutral-700" : undefined}
            onClick={(event) => event.preventDefault()}
            size="icon"
            title="Link"
            type="button"
            variant="ghost"
          >
            <Link2 size={14} />
          </Button>
        }
      />
      <PopoverContent className="flex w-64 gap-2 p-2">
        <Input
          autoFocus
          onChange={(event) => setHref(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              apply()
            }
          }}
          placeholder="https://example.com"
          value={href}
        />
        <Button onClick={apply} size="sm" type="button">
          Add
        </Button>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The only place a `sendText` step's marks are applied — bold/italic/strike/
 * code/link are the exact five tags `parseRichText` accepts
 * (`packages/flow-config/src/rich-text/parser.ts`), so this toolbar is the
 * complete surface, on purpose: there is nowhere else in the UI a mark can
 * originate from other than typing/pasting plain characters.
 */
export const RichTextToolbar = ({ editor }: RichTextToolbarProps) => {
  if (!editor) {
    return null
  }

  return (
    <div className="mb-1 flex items-center gap-0.5 border-b pb-1">
      <MarkButton
        editor={editor}
        icon={Bold}
        label="Bold"
        mark="bold"
        onToggle={() => editor.chain().focus().toggleBold().run()}
      />
      <MarkButton
        editor={editor}
        icon={Italic}
        label="Italic"
        mark="italic"
        onToggle={() => editor.chain().focus().toggleItalic().run()}
      />
      <MarkButton
        editor={editor}
        icon={Strikethrough}
        label="Strikethrough"
        mark="strike"
        onToggle={() => editor.chain().focus().toggleStrike().run()}
      />
      <MarkButton
        editor={editor}
        icon={Code}
        label="Code"
        mark="code"
        onToggle={() => editor.chain().focus().toggleCode().run()}
      />
      <LinkButton editor={editor} />
    </div>
  )
}

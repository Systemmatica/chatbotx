import {
  Bold,
  Braces,
  Code,
  CornerDownLeft,
  Italic,
  Link2,
  type LucideIcon,
  Smile,
  Strikethrough,
} from "lucide-react"
import { useTranslations } from "next-intl"
import {
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react"
import type { SlashCommandAction, SlashCommandItem } from "./items"

export type SlashCommandListRef = {
  onKeyDown: ({ event }: { event: KeyboardEvent }) => boolean
}

type SlashCommandListProps = {
  ref?: Ref<SlashCommandListRef>
  items: SlashCommandItem[]
  command: (item: SlashCommandItem) => void
}

const MARK_ICONS: Record<string, LucideIcon> = {
  bold: Bold,
  italic: Italic,
  strike: Strikethrough,
  code: Code,
}

const iconFor = (action: SlashCommandAction): LucideIcon => {
  switch (action.type) {
    case "variable":
      return Braces
    case "mark":
      return MARK_ICONS[action.mark] ?? Bold
    case "link":
      return Link2
    case "emoji":
      return Smile
    case "lineBreak":
      return CornerDownLeft
    default:
      return Braces
  }
}

export const SlashCommandList = ({
  ref,
  items,
  command,
}: SlashCommandListProps) => {
  const t = useTranslations("slashCommands")
  const [selectedIndex, setSelectedIndex] = useState(0)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])

  // Reset the highlight whenever the filtered list changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: items identity is the trigger
  useEffect(() => setSelectedIndex(0), [items])

  useEffect(() => {
    itemRefs.current[selectedIndex]?.scrollIntoView({ block: "nearest" })
  }, [selectedIndex])

  const selectItem = (index: number): boolean => {
    const item = items[index]
    if (item) {
      command(item)
    }
    return Boolean(item)
  }

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }) => {
      if (items.length === 0) {
        return false
      }
      if (event.key === "ArrowUp") {
        setSelectedIndex((selectedIndex + items.length - 1) % items.length)
        return true
      }
      if (event.key === "ArrowDown") {
        setSelectedIndex((selectedIndex + 1) % items.length)
        return true
      }
      if (event.key === "Enter" || event.key === "Tab") {
        return selectItem(selectedIndex)
      }
      return false
    },
  }))

  if (items.length === 0) {
    return null
  }

  return (
    <div
      aria-label={t("menuLabel")}
      className="dropdown-menu max-h-72 w-64 overflow-y-auto bg-background!"
      onWheel={(event) => event.stopPropagation()}
      role="listbox"
    >
      {items.map((item, index) => {
        const showGroup = items[index - 1]?.group !== item.group
        const Icon = iconFor(item.action)
        const isSelected = index === selectedIndex

        return (
          <div key={item.id}>
            {showGroup ? (
              <div className="px-2 pt-2 pb-1 font-medium text-muted-foreground text-xs">
                {t(`groups.${item.group}`)}
              </div>
            ) : null}
            <button
              aria-selected={isSelected}
              className={`rounded-md px-2 py-1 text-sm ${isSelected ? "is-selected" : ""}`}
              onClick={() => selectItem(index)}
              onMouseDown={(event) => event.preventDefault()}
              onMouseEnter={() => setSelectedIndex(index)}
              ref={(element) => {
                itemRefs.current[index] = element
              }}
              role="option"
              type="button"
            >
              <Icon className="shrink-0 text-muted-foreground" size={14} />
              <span className="truncate">{item.label}</span>
              {item.hint ? (
                <span className="ms-auto truncate text-muted-foreground text-xs">
                  {item.hint}
                </span>
              ) : null}
            </button>
          </div>
        )
      })}
    </div>
  )
}

export default SlashCommandList

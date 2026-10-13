import { cn } from "@chatbotx.io/ui/lib/utils"
import { XIcon } from "lucide-react"
import type { ReactNode } from "react"
import { getLabelColorStyle } from "@/lib/label-colors"

type LabelChipProps = {
  /** Palette token; `null` derives the color from `name`. */
  color?: string | null
  /** Text shown in the chip, also the seed of the fallback color. */
  name: string
  /**
   * Muted rendering for a value that no longer matches a label (e.g. a
   * deleted select option): neutral, dashed, never crashes.
   */
  muted?: boolean
  className?: string
  children?: ReactNode
  onRemove?: () => void
  removeLabel?: string
}

/** Notion-style colored label used for tags and select-field options. */
export function LabelChip({
  color,
  name,
  muted = false,
  className,
  children,
  onRemove,
  removeLabel,
}: LabelChipProps) {
  const style = getLabelColorStyle(color, name)

  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1 rounded-sm px-1.5 py-0.5 font-medium text-xs leading-4",
        muted
          ? "border border-muted-foreground/40 border-dashed text-muted-foreground"
          : style.chip,
        className,
      )}
      title={name}
    >
      <span className="truncate">{children ?? name}</span>
      {onRemove ? (
        <button
          aria-label={removeLabel}
          className="-me-0.5 rounded-sm p-0.5 opacity-70 hover:opacity-100"
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          type="button"
        >
          <XIcon className="size-3" />
        </button>
      ) : null}
    </span>
  )
}

/** Wrapping list of chips. */
export function LabelChipList({
  className,
  children,
}: {
  className?: string
  children: ReactNode
}) {
  return (
    <span className={cn("flex flex-wrap items-center gap-1", className)}>
      {children}
    </span>
  )
}

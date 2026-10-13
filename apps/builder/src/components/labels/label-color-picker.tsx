"use client"

import type { LabelColor } from "@chatbotx.io/database/partials"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { CheckIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import {
  getLabelColorStyle,
  LABEL_COLOR_OPTIONS,
  labelColorTranslationKey,
} from "@/lib/label-colors"

type LabelColorPickerProps = {
  /** Selected token; `null` shows the color derived from `name`. */
  value: string | null | undefined
  onChange: (color: LabelColor) => void
  /** Label text, previewed in the trigger and used for the fallback color. */
  name: string
  /** Icon-only trigger (a swatch), for dense rows like option lists. */
  compact?: boolean
  disabled?: boolean
}

/** Popover with the Notion-like palette; the trigger previews the chip. */
export function LabelColorPicker({
  value,
  onChange,
  name,
  compact = false,
  disabled = false,
}: LabelColorPickerProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const current = getLabelColorStyle(value, name)

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={t("labelColors.pick")}
            className={cn(compact ? "size-8 shrink-0" : "justify-start")}
            disabled={disabled}
            size={compact ? "icon" : "default"}
            type="button"
            variant="outline"
          >
            <span className={cn("size-3.5 rounded-full", current.dot)} />
            {compact ? null : (
              <span
                className={cn(
                  "max-w-48 truncate rounded-sm px-1.5 py-0.5 text-xs",
                  current.chip,
                )}
              >
                {name.trim() || t("labelColors.preview")}
              </span>
            )}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-56 p-1">
        <div className="grid gap-0.5">
          {LABEL_COLOR_OPTIONS.map((color) => {
            const style = getLabelColorStyle(color)
            const selected = value === color
            return (
              <button
                aria-pressed={selected}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-start text-sm hover:bg-accent"
                key={color}
                onClick={() => {
                  onChange(color)
                  setOpen(false)
                }}
                type="button"
              >
                <span
                  className={cn("size-4 rounded-sm border", style.chip)}
                  style={{ borderColor: style.foreground }}
                />
                <span className="flex-1">
                  {t(labelColorTranslationKey(color))}
                </span>
                {selected ? <CheckIcon className="size-4" /> : null}
              </button>
            )
          })}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** `color` form field for label create/edit forms (tags). */
export function LabelColorField({
  name = "color",
  previewName,
}: {
  name?: string
  previewName: string
}) {
  const t = useTranslations()
  return (
    <FormFieldWrapper label={t("labelColors.label")} name={name} required>
      {(field) => (
        <LabelColorPicker
          name={previewName}
          onChange={field.onChange}
          value={typeof field.value === "string" ? field.value : null}
        />
      )}
    </FormFieldWrapper>
  )
}

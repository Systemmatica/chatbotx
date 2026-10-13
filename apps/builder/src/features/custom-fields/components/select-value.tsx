"use client"

import {
  type CustomFieldOption,
  findCustomFieldOption,
  parseMultiSelectValue,
  type SelectCustomFieldType,
  serializeMultiSelectValue,
} from "@chatbotx.io/database/partials"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { CheckIcon, ChevronDownIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { LabelChip, LabelChipList } from "@/components/labels/label-chip"

/** Labels held by a stored select / multiSelect value. */
export const selectValueLabels = (
  type: SelectCustomFieldType,
  value: string | null | undefined,
): string[] => {
  if (type === "multiSelect") {
    return parseMultiSelectValue(value)
  }
  const label = value?.trim() ?? ""
  return label ? [label] : []
}

/**
 * Chips of a select / multiSelect value. A label that no longer matches an
 * option (deleted or renamed outside the app) renders as a muted chip with
 * the raw text instead of disappearing or crashing.
 */
export function SelectValueChips({
  type,
  options,
  value,
  className,
}: {
  type: SelectCustomFieldType
  options: readonly CustomFieldOption[] | null | undefined
  value: string | null | undefined
  className?: string
}) {
  const t = useTranslations()
  const labels = selectValueLabels(type, value)
  if (labels.length === 0) {
    return null
  }

  return (
    <LabelChipList className={className}>
      {labels.map((label) => {
        const option = findCustomFieldOption(options, label)
        return option ? (
          <LabelChip color={option.color} key={label} name={option.label} />
        ) : (
          <span key={label} title={t("customFields.options.missing")}>
            <LabelChip muted name={label} />
          </span>
        )
      })}
    </LabelChipList>
  )
}

type SelectValuePickerProps = {
  type: SelectCustomFieldType
  options: readonly CustomFieldOption[]
  value: string
  onChange: (value: string) => void
}

/** Dropdown of colored option chips; multi-select toggles several. */
export function SelectValuePicker({
  type,
  options,
  value,
  onChange,
}: SelectValuePickerProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const selected = selectValueLabels(type, value)
  const isSelected = (option: CustomFieldOption) =>
    selected.some(
      (label) => findCustomFieldOption([option], label) !== undefined,
    )

  const toggle = (option: CustomFieldOption) => {
    if (type === "select") {
      onChange(isSelected(option) ? "" : option.label)
      setOpen(false)
      return
    }
    // Keep option order, drop labels that are no longer options.
    const next = options.filter((item) =>
      item.id === option.id ? !isSelected(item) : isSelected(item),
    )
    onChange(serializeMultiSelectValue(next.map((item) => item.label)))
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            className="h-auto min-h-9 w-full justify-between gap-2 py-1.5"
            type="button"
            variant="outline"
          >
            {selected.length > 0 ? (
              <SelectValueChips
                className="min-w-0"
                options={options}
                type={type}
                value={value}
              />
            ) : (
              <span className="text-muted-foreground">
                {t("actions.pleaseSelect")}
              </span>
            )}
            <ChevronDownIcon className="size-4 shrink-0 opacity-60" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-(--anchor-width) p-1">
        {options.length === 0 ? (
          <p className="px-2 py-1.5 text-muted-foreground text-sm">
            {t("customFields.options.empty")}
          </p>
        ) : (
          <div className="grid max-h-64 gap-0.5 overflow-y-auto">
            {options.map((option) => (
              <button
                aria-pressed={isSelected(option)}
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-start hover:bg-accent"
                key={option.id}
                onClick={() => toggle(option)}
                type="button"
              >
                <span className="flex-1">
                  <LabelChip color={option.color} name={option.label} />
                </span>
                {isSelected(option) ? <CheckIcon className="size-4" /> : null}
              </button>
            ))}
          </div>
        )}
        {selected.length > 0 ? (
          <Button
            className="mt-1 w-full"
            onClick={() => {
              onChange("")
              setOpen(false)
            }}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("customFields.options.clear")}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/** Form field (string value) for a select / multiSelect custom field. */
export function SelectValueField({
  name,
  type,
  options,
  label,
  required,
}: {
  name: string
  type: SelectCustomFieldType
  options: readonly CustomFieldOption[]
  label?: string
  required?: boolean
}) {
  return (
    <FormFieldWrapper label={label} name={name} required={required}>
      {(field) => (
        <SelectValuePicker
          onChange={field.onChange}
          options={options}
          type={type}
          value={typeof field.value === "string" ? field.value : ""}
        />
      )}
    </FormFieldWrapper>
  )
}

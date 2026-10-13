"use client"

import {
  AUTO_LABEL_COLORS,
  type CustomFieldOption,
  MAX_CUSTOM_FIELD_OPTION_LABEL_LENGTH,
  MAX_CUSTOM_FIELD_OPTIONS,
  MULTI_SELECT_SEPARATOR,
} from "@chatbotx.io/database/partials"
import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import { ArrowDownIcon, ArrowUpIcon, PlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { LabelColorPicker } from "@/components/labels/label-color-picker"

const newOptionId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

const labelKey = (label: string) => label.trim().toLowerCase()

/** Why a label cannot be used, or `null` when it is valid. */
export const getOptionLabelError = (
  label: string,
  options: readonly CustomFieldOption[],
  ownId?: string,
): "required" | "comma" | "duplicate" | null => {
  const trimmed = label.trim()
  if (!trimmed) {
    return "required"
  }
  if (trimmed.includes(MULTI_SELECT_SEPARATOR)) {
    return "comma"
  }
  const key = labelKey(trimmed)
  return options.some(
    (option) => option.id !== ownId && labelKey(option.label) === key,
  )
    ? "duplicate"
    : null
}

/** Next color in the palette cycle, so neighbouring options differ. */
const nextOptionColor = (options: readonly CustomFieldOption[]) =>
  AUTO_LABEL_COLORS[options.length % AUTO_LABEL_COLORS.length]

type CustomFieldOptionsEditorProps = {
  value: CustomFieldOption[]
  onChange: (options: CustomFieldOption[]) => void
}

/**
 * Notion-style option list of a select / multi-select field: add, rename,
 * recolor, reorder and delete. Options keep a stable `id`, so renaming one
 * migrates the values already stored on contacts.
 */
export function CustomFieldOptionsEditor({
  value,
  onChange,
}: CustomFieldOptionsEditorProps) {
  const t = useTranslations()
  const [draft, setDraft] = useState("")
  const draftError = draft ? getOptionLabelError(draft, value) : null
  const isFull = value.length >= MAX_CUSTOM_FIELD_OPTIONS

  const update = (id: string, patch: Partial<CustomFieldOption>) =>
    onChange(
      value.map((option) =>
        option.id === id ? { ...option, ...patch } : option,
      ),
    )

  const move = (index: number, offset: -1 | 1) => {
    const target = index + offset
    if (target < 0 || target >= value.length) {
      return
    }
    const next = [...value]
    const [moved] = next.splice(index, 1)
    if (moved) {
      next.splice(target, 0, moved)
    }
    onChange(next)
  }

  const add = () => {
    if (isFull || getOptionLabelError(draft, value) !== null) {
      return
    }
    onChange([
      ...value,
      { id: newOptionId(), label: draft.trim(), color: nextOptionColor(value) },
    ])
    setDraft("")
  }

  return (
    <div className="grid gap-2">
      {value.length > 0 ? (
        <ul className="grid gap-1.5">
          {value.map((option, index) => {
            const error = getOptionLabelError(option.label, value, option.id)
            return (
              <li className="grid gap-0.5" key={option.id}>
                <div className="flex items-center gap-1.5">
                  <LabelColorPicker
                    compact
                    name={option.label}
                    onChange={(color) => update(option.id, { color })}
                    value={option.color}
                  />
                  <Input
                    aria-invalid={error !== null}
                    aria-label={t("customFields.options.label")}
                    className="h-8"
                    maxLength={MAX_CUSTOM_FIELD_OPTION_LABEL_LENGTH}
                    onChange={(event) =>
                      update(option.id, { label: event.target.value })
                    }
                    value={option.label}
                  />
                  <Button
                    aria-label={t("customFields.options.moveUp")}
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowUpIcon />
                  </Button>
                  <Button
                    aria-label={t("customFields.options.moveDown")}
                    disabled={index === value.length - 1}
                    onClick={() => move(index, 1)}
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <ArrowDownIcon />
                  </Button>
                  <Button
                    aria-label={t("customFields.options.delete")}
                    onClick={() =>
                      onChange(value.filter((item) => item.id !== option.id))
                    }
                    size="icon"
                    type="button"
                    variant="ghost"
                  >
                    <Trash2Icon />
                  </Button>
                </div>
                {error ? (
                  <p className="ps-10 text-destructive text-xs">
                    {t(`customFields.options.errors.${error}`)}
                  </p>
                ) : null}
              </li>
            )
          })}
        </ul>
      ) : (
        <p className="text-muted-foreground text-sm">
          {t("customFields.options.empty")}
        </p>
      )}

      <div className="flex items-center gap-1.5">
        <Input
          aria-invalid={draftError !== null}
          className="h-8"
          disabled={isFull}
          maxLength={MAX_CUSTOM_FIELD_OPTION_LABEL_LENGTH}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              add()
            }
          }}
          placeholder={t("customFields.options.addPlaceholder")}
          value={draft}
        />
        <Button
          disabled={isFull || !draft.trim() || draftError !== null}
          onClick={add}
          size="sm"
          type="button"
          variant="outline"
        >
          <PlusIcon />
          {t("customFields.options.add")}
        </Button>
      </div>
      {draftError ? (
        <p className="text-destructive text-xs">
          {t(`customFields.options.errors.${draftError}`)}
        </p>
      ) : null}
      <p className="text-muted-foreground text-xs">
        {t("customFields.options.hint")}
      </p>
    </div>
  )
}

/** `options` form field of the custom field create/edit forms. */
export function CustomFieldOptionsField() {
  const t = useTranslations()
  return (
    <FormFieldWrapper
      label={t("customFields.options.title")}
      name="options"
      required
    >
      {(field) => (
        <CustomFieldOptionsEditor
          onChange={field.onChange}
          value={Array.isArray(field.value) ? field.value : []}
        />
      )}
    </FormFieldWrapper>
  )
}

"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Form } from "@chatbotx.io/ui/components/ui/form"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  formatCustomFieldValueInTimeZone,
  isTemporalCustomFieldType,
  resolveTemporalCustomFieldFormValue,
  resolveTemporalCustomFieldSaveFormat,
} from "@chatbotx.io/utils/datetime"
import { XIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useRef, useState } from "react"
import { useForm, useWatch } from "react-hook-form"
import { toast } from "sonner"
import { BotFieldValueInput } from "@/features/bot-fields/account-field-value-input"
import { getBrowserTimezone } from "@/features/contact-filter/lib/timezone"
import { deleteContactCustomFieldAction } from "../actions/delete-contact-custom-field.action"
import { updateContactFieldAction } from "../actions/update-contact-field.action"
import {
  normalizeInlineValue,
  resolveInlineCommitMode,
} from "../lib/custom-field-columns"

const VALUE_FIELD = "value"

type CustomFieldCellProps = {
  workspaceId: string
  contactId: string
  customFieldId: string
  type: string
  /** Raw stored value; `null` when the contact has none. */
  value: string | null
  /** Applies a value to the table at once (optimistic) or rolls it back. */
  onLocalChange: (value: string | null) => void
  /**
   * `true` while the value is edited or being saved, `false` after: the table
   * holds its background refresh meanwhile.
   */
  onBusyChange?: (busy: boolean) => void
}

const serverErrorOf = (result: unknown): string | undefined => {
  const error = (result as { serverError?: unknown } | undefined)?.serverError
  return typeof error === "string" ? error : undefined
}

/**
 * A custom field value in the contacts table, edited in place: click to edit
 * with the same editor as the contact panel, Enter/blur (or picking a value)
 * saves, Esc cancels. The table updates at once and rolls back on failure.
 */
export function CustomFieldCell({
  workspaceId,
  contactId,
  customFieldId,
  type,
  value,
  onLocalChange,
  onBusyChange,
}: CustomFieldCellProps) {
  const t = useTranslations()
  const [editing, setEditing] = useState(false)
  const [saving, setSaving] = useState(false)
  const busy = editing || saving
  const onBusyChangeRef = useRef(onBusyChange)
  onBusyChangeRef.current = onBusyChange

  useEffect(() => {
    if (!busy) {
      return
    }
    onBusyChangeRef.current?.(true)
    return () => onBusyChangeRef.current?.(false)
  }, [busy])
  const [timezone, setTimezone] = useState("UTC")

  useEffect(() => {
    setTimezone(getBrowserTimezone())
  }, [])

  const save = async (next: string | null) => {
    setEditing(false)
    if (next === value) {
      return
    }
    const previous = value
    onLocalChange(next)
    setSaving(true)
    try {
      const result =
        next === null
          ? await deleteContactCustomFieldAction(workspaceId, {
              ids: [contactId],
              customFieldId,
            })
          : await updateContactFieldAction(workspaceId, contactId, {
              [customFieldId]: next,
              clientTimezone: getBrowserTimezone(),
            })
      const failure =
        serverErrorOf(result) ??
        ((result as { validationErrors?: unknown } | undefined)
          ?.validationErrors
          ? t("contacts.inlineEdit.saveFailed")
          : undefined)
      if (failure) {
        throw new Error(failure)
      }
    } catch (error) {
      onLocalChange(previous)
      toast.error(
        error instanceof Error && error.message
          ? error.message
          : t("contacts.inlineEdit.saveFailed"),
      )
    } finally {
      setSaving(false)
    }
  }

  if (editing) {
    return (
      <CustomFieldCellEditor
        initialValue={value}
        onCancel={() => setEditing(false)}
        onSave={save}
        type={type}
      />
    )
  }

  let display: string | null = null
  if (value) {
    if (type === "boolean") {
      display =
        value === "true" ? t("fields.boolean.true") : t("fields.boolean.false")
    } else if (isTemporalCustomFieldType(type)) {
      display = formatCustomFieldValueInTimeZone(type, value, timezone)
    } else {
      display = value
    }
  }

  return (
    <button
      className={cn(
        "-mx-2 block w-[calc(100%+1rem)] min-w-24 max-w-64 truncate rounded px-2 py-1 text-start hover:bg-muted",
        !display && "text-muted-foreground/60",
      )}
      data-peek-ignore
      onClick={() => setEditing(true)}
      title={display ?? t("actions.clickToEdit")}
      type="button"
    >
      {display ?? "—"}
    </button>
  )
}

function CustomFieldCellEditor({
  type,
  initialValue,
  onSave,
  onCancel,
}: {
  type: string
  initialValue: string | null
  onSave: (value: string | null) => void
  onCancel: () => void
}) {
  const t = useTranslations()
  const mode = resolveInlineCommitMode(type)
  const containerRef = useRef<HTMLFieldSetElement>(null)
  const doneRef = useRef(false)
  const startValue =
    initialValue && isTemporalCustomFieldType(type)
      ? resolveTemporalCustomFieldFormValue(type, initialValue)
      : (initialValue ?? "")
  const form = useForm<{ value: string }>({
    defaultValues: { [VALUE_FIELD]: startValue },
  })
  const watched = useWatch({ control: form.control, name: VALUE_FIELD })

  const finish = (next: string | null | undefined) => {
    if (doneRef.current) {
      return
    }
    doneRef.current = true
    if (next === undefined) {
      onCancel()
    } else {
      onSave(next)
    }
  }

  useEffect(() => {
    containerRef.current
      ?.querySelector<HTMLElement>("input, textarea, button")
      ?.focus()
  }, [])

  // Pickers and choices save as soon as a value is chosen.
  useEffect(() => {
    if (mode === "onChange" && (watched ?? "") !== startValue) {
      finish(normalizeInlineValue(watched))
    }
  })

  return (
    <Form {...form}>
      {/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: keyboard/blur handling delegated from the field editor inside */}
      <fieldset
        className="m-0 flex min-w-40 max-w-72 items-start gap-1 border-0 p-0 [&_[data-slot=form-item]]:flex-1 [&_[data-slot=form-item]]:gap-0"
        data-peek-ignore
        onBlur={(event) => {
          if (mode !== "onEnterOrBlur") {
            return
          }
          const next = event.relatedTarget as Node | null
          if (next && containerRef.current?.contains(next)) {
            return
          }
          finish(normalizeInlineValue(form.getValues(VALUE_FIELD)))
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault()
            event.stopPropagation()
            finish(undefined)
            return
          }
          if (
            event.key === "Enter" &&
            mode === "onEnterOrBlur" &&
            !(type === "longText" && event.shiftKey)
          ) {
            event.preventDefault()
            finish(normalizeInlineValue(form.getValues(VALUE_FIELD)))
          }
        }}
        ref={containerRef}
      >
        <BotFieldValueInput
          name={VALUE_FIELD}
          saveFormat={resolveTemporalCustomFieldSaveFormat(type)}
          type={type as Parameters<typeof BotFieldValueInput>[0]["type"]}
        />
        {mode === "onChange" ? (
          <Button
            aria-label={t("actions.cancel")}
            onClick={() => finish(undefined)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <XIcon />
          </Button>
        ) : null}
      </fieldset>
    </Form>
  )
}

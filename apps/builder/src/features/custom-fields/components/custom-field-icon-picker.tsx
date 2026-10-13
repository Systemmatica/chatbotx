"use client"

import { FormFieldWrapper } from "@chatbotx.io/ui/components/form/field-wrapper"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { Input } from "@chatbotx.io/ui/components/ui/input"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@chatbotx.io/ui/components/ui/popover"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useMemo, useState } from "react"
import {
  CUSTOM_FIELD_ICON_NAMES,
  type CustomFieldIconName,
  isCustomFieldIconName,
} from "../lib/custom-field-icon-names"
import {
  customFieldIconComponents,
  resolveCustomFieldIcon,
} from "../lib/custom-field-icons"

type CustomFieldIconPickerProps = {
  /** Picked icon name; `null`/unknown shows the type icon. */
  value: string | null | undefined
  onChange: (value: CustomFieldIconName | null) => void
  /** Field type, for the fallback icon. */
  type: string
}

/** Searchable grid of the curated custom field icons. */
function CustomFieldIconPicker({
  value,
  onChange,
  type,
}: CustomFieldIconPickerProps) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState("")

  const SelectedIcon = resolveCustomFieldIcon({ icon: value, type })
  const selected = isCustomFieldIconName(value) ? value : null

  const names = useMemo(() => {
    const query = search.trim().toLowerCase().replace(/\s+/g, "-")
    return query
      ? CUSTOM_FIELD_ICON_NAMES.filter((name) => name.includes(query))
      : CUSTOM_FIELD_ICON_NAMES
  }, [search])

  const pick = (name: CustomFieldIconName | null) => {
    onChange(name)
    setOpen(false)
    setSearch("")
  }

  return (
    <Popover onOpenChange={setOpen} open={open}>
      <PopoverTrigger
        render={
          <Button
            aria-label={t("customFields.icon.label")}
            className="justify-start"
            type="button"
            variant="outline"
          >
            <SelectedIcon />
            {selected ?? t("customFields.icon.default")}
          </Button>
        }
      />
      <PopoverContent align="start" className="w-72">
        <div className="grid gap-2">
          <Input
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t("customFields.icon.search")}
            value={search}
          />
          <div className="grid max-h-56 grid-cols-7 gap-1 overflow-y-auto">
            {names.map((name) => {
              const Icon = customFieldIconComponents[name]
              return (
                <Button
                  aria-label={name}
                  aria-pressed={selected === name}
                  className={cn(selected === name && "bg-accent")}
                  key={name}
                  onClick={() => pick(name)}
                  size="icon"
                  title={name}
                  type="button"
                  variant="ghost"
                >
                  <Icon />
                </Button>
              )
            })}
          </div>
          {names.length === 0 ? (
            <p className="text-center text-muted-foreground text-sm">
              {t("actions.noRecordFound")}
            </p>
          ) : null}
          <Button
            disabled={selected === null}
            onClick={() => pick(null)}
            size="sm"
            type="button"
            variant="ghost"
          >
            {t("customFields.icon.reset")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** `icon` form field of the custom field create/edit forms. */
export function CustomFieldIconField({ type }: { type: string }) {
  const t = useTranslations()
  return (
    <FormFieldWrapper label={t("customFields.icon.label")} name="icon">
      {(field) => (
        <CustomFieldIconPicker
          onChange={field.onChange}
          type={type}
          value={typeof field.value === "string" ? field.value : null}
        />
      )}
    </FormFieldWrapper>
  )
}

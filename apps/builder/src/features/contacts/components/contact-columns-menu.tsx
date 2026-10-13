"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Columns3Icon } from "lucide-react"
import { useTranslations } from "next-intl"

export type ColumnOption = { id: string; label: string }

/** Picks which columns the contacts table shows (built-in and custom fields). */
export function ContactColumnsMenu({
  baseColumns,
  customFieldColumns,
  visibleColumns,
  onVisibleColumnsChange,
}: {
  baseColumns: ColumnOption[]
  customFieldColumns: ColumnOption[]
  visibleColumns: readonly string[]
  onVisibleColumnsChange: (next: string[]) => void
}) {
  const t = useTranslations()
  const visible = new Set(visibleColumns)

  const toggle = (id: string, checked: boolean) => {
    const next = new Set(visibleColumns)
    if (checked) {
      next.add(id)
    } else {
      next.delete(id)
    }
    // Keep the menu order so saved views compare stably.
    onVisibleColumnsChange(
      [...baseColumns, ...customFieldColumns]
        .map((column) => column.id)
        .filter((columnId) => next.has(columnId)),
    )
  }

  const renderItems = (options: ColumnOption[]) =>
    options.map((option) => (
      <DropdownMenuCheckboxItem
        checked={visible.has(option.id)}
        closeOnClick={false}
        key={option.id}
        onCheckedChange={(checked) => toggle(option.id, Boolean(checked))}
      >
        <span className="truncate">{option.label}</span>
      </DropdownMenuCheckboxItem>
    ))

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button size="sm" type="button" variant="outline">
            <Columns3Icon />
            {t("contacts.columns.title")}
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="max-h-96 w-60">
        <DropdownMenuGroup>
          <DropdownMenuLabel>{t("contacts.columns.base")}</DropdownMenuLabel>
          {renderItems(baseColumns)}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {t("contacts.columns.customFields")}
          </DropdownMenuLabel>
          {customFieldColumns.length > 0 ? (
            renderItems(customFieldColumns)
          ) : (
            <p className="px-2 py-1.5 text-muted-foreground text-xs">
              {t("contacts.columns.noCustomFields")}
            </p>
          )}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

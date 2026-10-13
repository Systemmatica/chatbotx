"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { Rows3Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import type { KanbanBoardResource } from "@/features/kanban/schemas/resource"
import type { ContactViewGroupBy } from "../schemas/config"

const NONE = "none"

const toValue = (groupBy: ContactViewGroupBy | null): string => {
  switch (groupBy?.kind) {
    case "customField":
      return `customField:${groupBy.customFieldId}`
    case "stage":
      return `stage:${groupBy.boardId}`
    case "leadMagnet":
      return "leadMagnet"
    default:
      return NONE
  }
}

const fromValue = (value: string): ContactViewGroupBy | null => {
  if (value === "leadMagnet") {
    return { kind: "leadMagnet" }
  }
  const [kind, id] = value.split(":")
  if (kind === "customField" && id) {
    return { kind: "customField", customFieldId: id }
  }
  if (kind === "stage" && id) {
    return { kind: "stage", boardId: id }
  }
  return null
}

/** "Group by": none, lead magnet, a board's stage or any custom field. */
export function ContactGroupByMenu({
  groupBy,
  onGroupByChange,
  onOpenChange,
  boards,
  customFields,
  label,
}: {
  groupBy: ContactViewGroupBy | null
  onGroupByChange: (groupBy: ContactViewGroupBy | null) => void
  /** Lets the parent load boards/lead magnets when the menu opens. */
  onOpenChange?: (open: boolean) => void
  boards: KanbanBoardResource[]
  customFields: { id: string; name: string }[]
  /** Current grouping's name for the button. */
  label: string | null
}) {
  const t = useTranslations()

  return (
    <DropdownMenu onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        render={
          <Button
            size="sm"
            type="button"
            variant={groupBy ? "secondary" : "outline"}
          >
            <Rows3Icon />
            <span className="max-w-40 truncate">
              {label
                ? t("contactViews.grouping.groupedBy", { name: label })
                : t("contactViews.grouping.title")}
            </span>
          </Button>
        }
      />
      <DropdownMenuContent align="end" className="max-h-96 w-64">
        <DropdownMenuRadioGroup
          onValueChange={(value) => onGroupByChange(fromValue(String(value)))}
          value={toValue(groupBy)}
        >
          <DropdownMenuRadioItem value={NONE}>
            {t("contactViews.grouping.none")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="leadMagnet">
            {t("contactViews.grouping.leadMagnet")}
          </DropdownMenuRadioItem>
          {boards.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {t("contactViews.grouping.stage")}
                </DropdownMenuLabel>
                {boards.map((board) => (
                  <DropdownMenuRadioItem
                    key={board.id}
                    value={`stage:${board.id}`}
                  >
                    <span className="truncate">{board.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuGroup>
            </>
          ) : null}
          {customFields.length > 0 ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuLabel>
                  {t("contacts.columns.customFields")}
                </DropdownMenuLabel>
                {customFields.map((field) => (
                  <DropdownMenuRadioItem
                    key={field.id}
                    value={`customField:${field.id}`}
                  >
                    <span className="truncate">{field.name}</span>
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuGroup>
            </>
          ) : null}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

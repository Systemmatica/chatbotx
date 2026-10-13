"use client"

import {
  KANBAN_MAX_CARD_PROPERTIES,
  type KanbanCardProperty,
  kanbanCardPropertyKey,
} from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@chatbotx.io/ui/components/ui/select"
import {
  Sortable,
  SortableContent,
  SortableItem,
  SortableItemHandle,
} from "@chatbotx.io/ui/components/ui/sortable"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  formatCustomFieldValueInTimeZone,
  isTemporalCustomFieldType,
} from "@chatbotx.io/utils/datetime"
import {
  ClockIcon,
  GiftIcon,
  GripVerticalIcon,
  PaperclipIcon,
  PhoneIcon,
  Trash2Icon,
} from "lucide-react"
import { useFormatter, useTranslations } from "next-intl"
import { useMemo } from "react"
import { getBrowserTimezone } from "@/features/contact-filter/lib/timezone"
import { CurrentStepLine } from "@/features/flow-steps/components/current-step-line"
import type { KanbanCardResource } from "../schemas/resource"

export type CardCustomField = { id: string; name: string; type: string }

const MAX_CHIPS = 3

const FIXED_PROPERTY_TYPES = [
  "lastActivity",
  "currentStep",
  "lastMessage",
  "timeInStage",
  "phone",
  "tags",
  "leadMagnets",
] as const

/** The label of a property in the board settings. */
function usePropertyLabel(customFieldsById: Map<string, CardCustomField>) {
  const t = useTranslations()
  return (property: KanbanCardProperty) =>
    property.type === "customField"
      ? (customFieldsById.get(property.customFieldId)?.name ??
        t("kanban.cardProperties.deletedField"))
      : t(`kanban.cardProperties.types.${property.type}`)
}

/** The card's lines and chips, in the board's property order. */
export function KanbanCardPropertyLines({
  card,
  properties,
  customFieldsById,
}: {
  card: KanbanCardResource
  properties: readonly KanbanCardProperty[]
  customFieldsById: Map<string, CardCustomField>
}) {
  const t = useTranslations()
  const format = useFormatter()

  return (
    <>
      {properties.map((property) => {
        const key = kanbanCardPropertyKey(property)
        const data = card.properties
        switch (property.type) {
          case "lastActivity":
            return (
              <p className="truncate text-muted-foreground text-xs" key={key}>
                {card.lastMessageAt
                  ? format.relativeTime(card.lastMessageAt)
                  : t("kanban.noLastMessage")}
              </p>
            )
          case "currentStep":
            return <CurrentStepLine key={key} step={card.currentFlowStep} />
          case "lastMessage": {
            const message = data?.lastMessage
            if (!message) {
              return null
            }
            return (
              <p
                className="line-clamp-2 break-words text-muted-foreground text-xs"
                key={key}
              >
                {message.messageType === "outgoing"
                  ? `${t("kanban.cardProperties.you")}: `
                  : null}
                {message.text ||
                  (message.attachmentCount > 0 ? (
                    <span className="inline-flex items-center gap-1">
                      <PaperclipIcon className="size-3" />
                      {t("contactPeek.attachments", {
                        count: message.attachmentCount,
                      })}
                    </span>
                  ) : null)}
              </p>
            )
          }
          case "timeInStage":
            return data?.stageSince ? (
              <p
                className="flex items-center gap-1 truncate text-muted-foreground text-xs"
                key={key}
              >
                <ClockIcon className="size-3 shrink-0" />
                {t("kanban.cardProperties.inStageSince", {
                  time: format.relativeTime(data.stageSince),
                })}
              </p>
            ) : null
          case "phone":
            return data?.phone ? (
              <p
                className="flex items-center gap-1 truncate text-muted-foreground text-xs"
                key={key}
              >
                <PhoneIcon className="size-3 shrink-0" />
                <span className="truncate">{data.phone}</span>
              </p>
            ) : null
          case "tags":
            return (
              <Chips
                items={(data?.tags ?? []).map((tag) => tag.name)}
                key={key}
              />
            )
          case "leadMagnets":
            return (
              <Chips
                icon={<GiftIcon className="size-3 shrink-0" />}
                items={(data?.leadMagnets ?? []).map((item) => item.name)}
                key={key}
              />
            )
          case "customField": {
            const field = customFieldsById.get(property.customFieldId)
            const raw = data?.customFields?.[property.customFieldId]
            if (!(field && raw)) {
              return null
            }
            return (
              <p
                className="flex min-w-0 items-center gap-1 text-xs"
                key={key}
                title={`${field.name}: ${raw}`}
              >
                <span className="shrink-0 text-muted-foreground">
                  {field.name}:
                </span>
                <span className="truncate">
                  {formatFieldValue(field.type, raw, t)}
                </span>
              </p>
            )
          }
          default:
            return null
        }
      })}
    </>
  )
}

function formatFieldValue(
  type: string,
  value: string,
  t: ReturnType<typeof useTranslations>,
): string {
  if (type === "boolean") {
    return value === "true"
      ? t("fields.boolean.true")
      : t("fields.boolean.false")
  }
  if (isTemporalCustomFieldType(type)) {
    return formatCustomFieldValueInTimeZone(type, value, getBrowserTimezone())
  }
  return value
}

function Chips({ items, icon }: { items: string[]; icon?: React.ReactNode }) {
  if (items.length === 0) {
    return null
  }
  const shown = items.slice(0, MAX_CHIPS)
  const rest = items.length - shown.length
  return (
    <div className="flex min-w-0 flex-wrap gap-1" title={items.join(", ")}>
      {shown.map((item) => (
        <span
          className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-muted px-2 py-0.5 text-[11px]"
          key={item}
        >
          {icon}
          <span className="truncate">{item}</span>
        </span>
      ))}
      {rest > 0 ? (
        <span className="rounded-full px-1 py-0.5 text-[11px] text-muted-foreground">
          +{rest}
        </span>
      ) : null}
    </div>
  )
}

/** Board settings: which properties cards show and in which order. */
export function KanbanCardPropertiesEditor({
  value,
  onChange,
  customFields,
}: {
  value: KanbanCardProperty[]
  onChange: (next: KanbanCardProperty[]) => void
  customFields: CardCustomField[]
}) {
  const t = useTranslations()
  const customFieldsById = useMemo(
    () => new Map(customFields.map((field) => [field.id, field])),
    [customFields],
  )
  const label = usePropertyLabel(customFieldsById)
  const used = new Set(value.map(kanbanCardPropertyKey))

  const available: KanbanCardProperty[] = [
    ...FIXED_PROPERTY_TYPES.map((type) => ({ type }) as KanbanCardProperty),
    ...customFields.map(
      (field): KanbanCardProperty => ({
        type: "customField",
        customFieldId: field.id,
      }),
    ),
  ].filter((property) => !used.has(kanbanCardPropertyKey(property)))
  const addOptions = available.map((property) => ({
    label: label(property),
    value: kanbanCardPropertyKey(property),
  }))

  const move = (from: number, to: number) => {
    const next = [...value]
    const [moved] = next.splice(from, 1)
    if (moved) {
      next.splice(to, 0, moved)
    }
    onChange(next)
  }

  return (
    <div className="grid gap-2">
      <Sortable
        getItemValue={(property: KanbanCardProperty) =>
          kanbanCardPropertyKey(property)
        }
        onMove={({ activeIndex, overIndex }) => move(activeIndex, overIndex)}
        value={value}
      >
        <SortableContent>
          <div className="flex flex-col gap-1">
            {value.map((property) => {
              const key = kanbanCardPropertyKey(property)
              return (
                <SortableItem
                  key={key}
                  render={
                    <div className="flex items-center gap-2 rounded-md border px-1 py-0.5">
                      <SortableItemHandle
                        render={
                          <Button
                            aria-label={t("actions.move")}
                            className="size-7 shrink-0"
                            size="icon"
                            type="button"
                            variant="ghost"
                          >
                            <GripVerticalIcon className="size-4" />
                          </Button>
                        }
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          property.type === "customField" &&
                            !customFieldsById.has(property.customFieldId) &&
                            "text-muted-foreground italic",
                        )}
                      >
                        {label(property)}
                      </span>
                      <Button
                        aria-label={t("actions.remove")}
                        className="size-7 shrink-0"
                        onClick={() =>
                          onChange(
                            value.filter(
                              (item) => kanbanCardPropertyKey(item) !== key,
                            ),
                          )
                        }
                        size="icon"
                        type="button"
                        variant="ghost"
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </div>
                  }
                  value={key}
                />
              )
            })}
          </div>
        </SortableContent>
      </Sortable>
      {value.length < KANBAN_MAX_CARD_PROPERTIES && addOptions.length > 0 ? (
        <Select
          items={addOptions}
          onValueChange={(next) => {
            const property = available.find(
              (item) => kanbanCardPropertyKey(item) === String(next),
            )
            if (property) {
              onChange([...value, property])
            }
          }}
          value=""
        >
          <SelectTrigger
            aria-label={t("kanban.cardProperties.add")}
            className="w-full"
          >
            <SelectValue placeholder={t("kanban.cardProperties.add")} />
          </SelectTrigger>
          <SelectContent
            align="start"
            className="max-h-64 min-w-(--anchor-width)"
          >
            {addOptions.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
    </div>
  )
}

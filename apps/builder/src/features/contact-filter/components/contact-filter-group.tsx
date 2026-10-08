"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { ListPlusIcon, Trash2Icon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useState } from "react"
import type { ContactFilterCondition, ContactFilterGroup } from "../schemas"
import { ContactFilterConditionEditDialog } from "./contact-filter-condition-dialog"
import { ContactFilterConditionForm } from "./contact-filter-condition-form"
import { ContactFilterConditionRow } from "./contact-filter-condition-row"
import type { ConditionOption, FieldConfig } from "./contact-filter-config"

export const createEmptyContactFilterGroup = (): ContactFilterGroup => ({
  type: "group",
  operator: "and",
  conditions: [],
})

/** Stable-enough React key for a condition row (content + position). */
export const getContactFilterConditionKey = (
  condition: ContactFilterCondition,
  index: number,
): string =>
  `${index}-${condition.field}-${"operator" in condition ? condition.operator : "none"}-${
    "value" in condition ? JSON.stringify(condition.value) : "empty"
  }`

type ContactFilterGroupBlockProps = {
  group: ContactFilterGroup
  /** Full config list (labels for existing rows, incl. excluded fields). */
  configs: FieldConfig[]
  /** Configs offered when adding / editing a condition. */
  filteredConfigs: FieldConfig[]
  conditionOptions: ConditionOption[]
  operatorLabelByValue: Map<string, string>
  enableVariables?: boolean
  onChange: (group: ContactFilterGroup) => void
  onRemove: () => void
}

/**
 * One Notion-style condition group: its own and/or toggle, its condition rows,
 * an "add condition" button and a remove-group action. Groups nest one level
 * only, so this block never renders another group.
 */
export const ContactFilterGroupBlock = ({
  group,
  configs,
  filteredConfigs,
  conditionOptions,
  operatorLabelByValue,
  enableVariables = false,
  onChange,
  onRemove,
}: ContactFilterGroupBlockProps) => {
  const t = useTranslations()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const setConditions = (conditions: ContactFilterCondition[]) =>
    onChange({ ...group, conditions })

  const editingCondition =
    editingIndex === null ? null : (group.conditions[editingIndex] ?? null)

  return (
    <fieldset
      aria-label={t("fields.contactFilter.group")}
      className="flex flex-col gap-2 rounded-md border border-dashed bg-muted/30 p-3"
    >
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground text-sm">
          {t("fields.contactFilter.groupMatches")}
        </span>
        <button
          className="w-fit font-medium text-primary text-sm underline underline-offset-4"
          onClick={() =>
            onChange({
              ...group,
              operator: group.operator === "and" ? "or" : "and",
            })
          }
          type="button"
        >
          {group.operator === "and"
            ? t("fields.contactFilter.groupMatchAll")
            : t("fields.contactFilter.groupMatchAny")}
        </button>
        <Button
          aria-label={t("fields.contactFilter.removeGroup")}
          className="ms-auto size-8 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
          size="icon"
          title={t("fields.contactFilter.removeGroup")}
          type="button"
          variant="ghost"
        >
          <Trash2Icon size={16} />
        </Button>
      </div>

      {group.conditions.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          {t("fields.contactFilter.emptyGroup")}
        </p>
      ) : null}

      {group.conditions.map((condition, index) => (
        <ContactFilterConditionRow
          configs={configs}
          key={getContactFilterConditionKey(condition, index)}
          onEdit={() => setEditingIndex(index)}
          onRemove={() =>
            setConditions(group.conditions.filter((_, i) => i !== index))
          }
          operatorLabelByValue={operatorLabelByValue}
          row={condition}
        />
      ))}

      <ContactFilterConditionForm
        conditionOptions={conditionOptions}
        configs={filteredConfigs}
        enableVariables={enableVariables}
        onAdd={(condition) => setConditions([...group.conditions, condition])}
      />

      {editingCondition && editingIndex !== null ? (
        <ContactFilterConditionEditDialog
          condition={editingCondition}
          conditionOptions={conditionOptions}
          configs={filteredConfigs}
          enableVariables={enableVariables}
          key={editingIndex}
          onClose={() => setEditingIndex(null)}
          onSubmit={(data) => {
            setConditions(
              group.conditions.map((current, i) =>
                i === editingIndex ? data : current,
              ),
            )
            setEditingIndex(null)
          }}
        />
      ) : null}
    </fieldset>
  )
}

export const ContactFilterAddGroupButton = ({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) => {
  const t = useTranslations()

  return (
    <Button
      className={cn(
        "h-10 w-full justify-center rounded-md border border-dashed bg-background/60 text-muted-foreground hover:bg-primary/5 hover:text-primary",
        className,
      )}
      onClick={onClick}
      size="sm"
      type="button"
      variant="ghost"
    >
      <ListPlusIcon size={16} />
      {t("fields.contactFilter.addGroup")}
    </Button>
  )
}

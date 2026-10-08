"use client"

import type { ContactFilterField } from "@chatbotx.io/database/partials"
import { Button } from "@chatbotx.io/ui/components/ui/button"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { FilterIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { pruneExcludedConditions } from "../lib/prune-conditions"
import { getBrowserTimezone } from "../lib/timezone"
import {
  type ContactFilterCondition,
  type ContactFilterCriteria,
  type ContactFilterGroup,
  countContactFilterLeafConditions,
  isContactFilterGroupItem,
} from "../schemas"
import { ContactFilterConditionEditDialog } from "./contact-filter-condition-dialog"
import { ContactFilterConditionForm } from "./contact-filter-condition-form"
import { ContactFilterConditionRow } from "./contact-filter-condition-row"
import {
  ContactFilterAddGroupButton,
  ContactFilterGroupBlock,
  createEmptyContactFilterGroup,
  getContactFilterConditionKey,
} from "./contact-filter-group"
import { useContactFilterConfigs } from "./use-contact-filter-configs"

type ContactListFilterButtonProps = {
  open: boolean
  active: boolean
  onToggle: () => void
  filter: ContactFilterCriteria
}

export function ContactListFilterButton({
  open,
  active,
  onToggle,
  filter,
}: ContactListFilterButtonProps) {
  const t = useTranslations()

  const filterCount = countContactFilterLeafConditions(filter)

  return (
    <Button
      onClick={onToggle}
      size="sm"
      variant={active || open ? "default" : "outline"}
    >
      <FilterIcon />
      {t("actions.filter")}
      {filterCount > 0 ? ` (${filterCount})` : ""}
    </Button>
  )
}

type ContactListFilterPanelProps = {
  className?: string
  filter: ContactFilterCriteria
  onFilterChange: (filter: ContactFilterCriteria) => void
  excludeFields?: ContactFilterField[]
  inboxChannel?: string
  /** Show "Add group" (Notion-style and/or groups). Defaults to true. */
  allowGroups?: boolean
}

const EMPTY_EXCLUDE_FIELDS: ContactFilterField[] = []

export function ContactListFilterPanel({
  className,
  filter,
  onFilterChange,
  excludeFields = EMPTY_EXCLUDE_FIELDS,
  inboxChannel,
  allowGroups = true,
}: ContactListFilterPanelProps) {
  const t = useTranslations()
  const { configs, conditionOptions, operatorLabelByValue } =
    useContactFilterConfigs(inboxChannel)
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const filteredConfigs = useMemo(
    () =>
      configs.filter(
        (config) => !excludeFields.includes(config.name as ContactFilterField),
      ),
    [configs, excludeFields],
  )

  useEffect(() => {
    const pruned = pruneExcludedConditions(filter.conditions, excludeFields)
    if (pruned !== filter.conditions) {
      onFilterChange({
        operator: pruned.length > 0 ? filter.operator : "and",
        conditions: pruned,
        timezone: filter.timezone,
      })
    }
  }, [excludeFields, filter, onFilterChange])

  // Stamp the browser timezone onto an active filter so the backend interprets
  // naive date/datetime values in the user's local zone. Fires at most once per
  // filter (guarded on the absent timezone), mirroring the prune effect above.
  useEffect(() => {
    if (filter.conditions.length > 0 && !filter.timezone) {
      onFilterChange({ ...filter, timezone: getBrowserTimezone() })
    }
  }, [filter, onFilterChange])

  const handleToggleOperator = () => {
    onFilterChange({
      ...filter,
      operator: filter.operator === "and" ? "or" : "and",
    })
  }

  const handleAddCondition = (condition: ContactFilterCondition) => {
    onFilterChange({
      ...filter,
      conditions: [...filter.conditions, condition],
    })
  }

  const handleAddGroup = () => {
    onFilterChange({
      ...filter,
      conditions: [...filter.conditions, createEmptyContactFilterGroup()],
    })
  }

  const handleUpdateItem = (
    index: number,
    condition: ContactFilterCondition | ContactFilterGroup,
  ) => {
    onFilterChange({
      ...filter,
      conditions: filter.conditions.map((currentCondition, currentIndex) =>
        currentIndex === index ? condition : currentCondition,
      ),
    })
  }

  const handleRemoveCondition = (index: number) => {
    const conditions = filter.conditions.filter((_, i) => i !== index)
    onFilterChange({
      operator: conditions.length > 0 ? filter.operator : "and",
      conditions,
      timezone: conditions.length > 0 ? filter.timezone : undefined,
    })
  }

  const editingItem =
    editingIndex === null ? null : (filter.conditions[editingIndex] ?? null)
  const editingCondition =
    editingItem && !isContactFilterGroupItem(editingItem) ? editingItem : null

  return (
    <div
      className={cn(
        "flex flex-col gap-3 rounded-md border bg-muted/20 p-3",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <span className="text-muted-foreground text-sm">
          {t("fields.contactFilter.onlyContactsMatch")}
        </span>
        <button
          className="w-fit font-medium text-primary text-sm underline underline-offset-4"
          onClick={handleToggleOperator}
          type="button"
        >
          {filter.operator === "and"
            ? t("fields.contactFilter.allConditions")
            : t("fields.contactFilter.anyConditions")}
        </button>
      </div>

      <div className="flex flex-col gap-2">
        {filter.conditions.map((item, index) =>
          isContactFilterGroupItem(item) ? (
            <ContactFilterGroupBlock
              conditionOptions={conditionOptions}
              configs={configs}
              filteredConfigs={filteredConfigs}
              group={item}
              // biome-ignore lint/suspicious/noArrayIndexKey: groups have no stable id; position is their identity.
              key={`group-${index}`}
              onChange={(group) => handleUpdateItem(index, group)}
              onRemove={() => handleRemoveCondition(index)}
              operatorLabelByValue={operatorLabelByValue}
            />
          ) : (
            <ContactFilterConditionRow
              configs={configs}
              key={getContactFilterConditionKey(item, index)}
              onEdit={() => setEditingIndex(index)}
              onRemove={() => handleRemoveCondition(index)}
              operatorLabelByValue={operatorLabelByValue}
              row={item}
            />
          ),
        )}

        <ContactFilterConditionForm
          conditionOptions={conditionOptions}
          configs={filteredConfigs}
          onAdd={handleAddCondition}
        />

        {allowGroups ? (
          <ContactFilterAddGroupButton onClick={handleAddGroup} />
        ) : null}

        {editingCondition && editingIndex !== null ? (
          <ContactFilterConditionEditDialog
            condition={editingCondition}
            conditionOptions={conditionOptions}
            configs={filteredConfigs}
            key={editingIndex}
            onClose={() => setEditingIndex(null)}
            onSubmit={(data) => {
              handleUpdateItem(editingIndex, data)
              setEditingIndex(null)
            }}
          />
        ) : null}
      </div>
    </div>
  )
}

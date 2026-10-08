"use client"

import type { ContactFilterField } from "@chatbotx.io/database/partials"
import { RadioGroupField } from "@chatbotx.io/ui/components/form/radio-group-field"
import { Label } from "@chatbotx.io/ui/components/ui/label"
import { useTranslations } from "next-intl"
import { useEffect, useMemo, useState } from "react"
import { useFieldArray, useFormContext } from "react-hook-form"
import { pruneExcludedConditions } from "../lib/prune-conditions"
import { getBrowserTimezone } from "../lib/timezone"
import {
  type ContactFilterCondition,
  type ContactFilterItem,
  isContactFilterGroupItem,
} from "../schemas"
import { ContactFilterConditionEditDialog } from "./contact-filter-condition-dialog"
import { ContactFilterConditionForm } from "./contact-filter-condition-form"
import { ContactFilterConditionRow } from "./contact-filter-condition-row"
import {
  ContactFilterAddGroupButton,
  ContactFilterGroupBlock,
  createEmptyContactFilterGroup,
} from "./contact-filter-group"
import { useContactFilterConfigs } from "./use-contact-filter-configs"

type ContactFilterProps = {
  parentName: string
  excludeFields?: ContactFilterField[]
  inboxChannel?: string
  enableVariables?: boolean
  /**
   * Show "Add group" (Notion-style and/or groups). Defaults to true; turn it
   * off where the persisted schema can't hold groups (flow Condition step).
   */
  allowGroups?: boolean
}

const EMPTY_EXCLUDE_FIELDS: ContactFilterField[] = []

export const ContactFilter = ({
  parentName,
  excludeFields = EMPTY_EXCLUDE_FIELDS,
  inboxChannel,
  enableVariables = false,
  allowGroups = true,
}: ContactFilterProps) => {
  const t = useTranslations()
  const { control, getValues, setValue } = useFormContext()
  const { fields, append, remove, replace, update } = useFieldArray({
    control,
    name: `${parentName}.conditions`,
  })

  // Stamp the browser timezone onto the criteria so the backend interprets
  // naive date/datetime values in the user's local zone. Only set it when
  // absent, so re-opening an existing filter preserves its saved timezone.
  useEffect(() => {
    if (!getValues(`${parentName}.timezone`)) {
      setValue(`${parentName}.timezone`, getBrowserTimezone(), {
        shouldDirty: false,
      })
    }
  }, [parentName, getValues, setValue])
  const [editingIndex, setEditingIndex] = useState<number | null>(null)

  const { configs, conditionOptions, operatorLabelByValue } =
    useContactFilterConfigs(inboxChannel)
  const filteredConfigs = useMemo(
    () =>
      configs.filter(
        (config) => !excludeFields.includes(config.name as ContactFilterField),
      ),
    [configs, excludeFields],
  )

  useEffect(() => {
    const conditions =
      (getValues(`${parentName}.conditions`) as
        | ContactFilterItem[]
        | undefined) ?? []
    const pruned = pruneExcludedConditions(conditions, excludeFields)

    if (pruned !== conditions) {
      replace(pruned)
    }
  }, [excludeFields, getValues, parentName, replace])

  const handleAdd = (data: ContactFilterCondition) => {
    append(data)
  }

  const editingItem =
    editingIndex === null
      ? null
      : ((fields[editingIndex] as unknown as ContactFilterItem | undefined) ??
        null)
  const editingCondition =
    editingItem && !isContactFilterGroupItem(editingItem) ? editingItem : null

  return (
    <div className="flex flex-col gap-2">
      <Label>{t("fields.contactFilter.label")}</Label>

      <RadioGroupField
        name={`${parentName}.operator`}
        options={[
          {
            label: t("fields.matchAll.label"),
            value: "and",
          },
          {
            label: t("fields.matchAny.label"),
            value: "or",
          },
        ]}
      />

      {fields.map((field, index) => {
        const item = field as unknown as ContactFilterItem
        if (isContactFilterGroupItem(item)) {
          return (
            <ContactFilterGroupBlock
              conditionOptions={conditionOptions}
              configs={configs}
              enableVariables={enableVariables}
              filteredConfigs={filteredConfigs}
              // useFieldArray adds `id` to the item; strip it so it isn't persisted.
              group={{
                type: "group",
                operator: item.operator,
                conditions: item.conditions,
              }}
              key={field.id}
              onChange={(group) => update(index, group)}
              onRemove={() => remove(index)}
              operatorLabelByValue={operatorLabelByValue}
            />
          )
        }
        return (
          <ContactFilterConditionRow
            configs={configs}
            key={field.id}
            onEdit={() => setEditingIndex(index)}
            onRemove={() => remove(index)}
            operatorLabelByValue={operatorLabelByValue}
            row={item}
          />
        )
      })}

      <ContactFilterConditionForm
        conditionOptions={conditionOptions}
        configs={filteredConfigs}
        enableVariables={enableVariables}
        onAdd={handleAdd}
      />

      {allowGroups ? (
        <ContactFilterAddGroupButton
          onClick={() => append(createEmptyContactFilterGroup())}
        />
      ) : null}

      {editingCondition && editingIndex !== null ? (
        <ContactFilterConditionEditDialog
          condition={editingCondition}
          conditionOptions={conditionOptions}
          configs={filteredConfigs}
          enableVariables={enableVariables}
          key={editingIndex}
          onClose={() => setEditingIndex(null)}
          onSubmit={(data) => {
            update(editingIndex, data)
            setEditingIndex(null)
          }}
        />
      ) : null}
    </div>
  )
}

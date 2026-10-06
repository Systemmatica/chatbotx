"use client"

import { ComboboxField } from "@chatbotx.io/ui/components/form/combobox-field"
import type { SelectOption } from "@chatbotx.io/ui/components/form/select-field"
import { useTranslations } from "next-intl"
import { useCallback, useMemo } from "react"
import { useFormContext, useWatch } from "react-hook-form"

type FlowNodeValueInputProps = {
  /** Flow → node tree from `buildFlowNodeOptionTree`. */
  options: SelectOption[]
}

/**
 * Two-step picker for `currentFlowNode`: the flow, then a step of its
 * published version. Writes `value: [flowId, nodeId]`.
 */
export const FlowNodeValueInput = ({ options }: FlowNodeValueInputProps) => {
  const t = useTranslations()
  const { control, setValue } = useFormContext()
  const flowId = useWatch({ control, name: "value.0" }) as string | undefined

  const flowOptions = useMemo(
    () => options.map(({ label, value }) => ({ label, value })),
    [options],
  )
  const nodeOptions = useMemo(
    () => options.find((option) => option.value === flowId)?.children ?? [],
    [options, flowId],
  )

  // A step id only means something inside its flow.
  const resetNode = useCallback(
    (nextFlowId: string) => {
      if (nextFlowId !== flowId) {
        setValue("value.1", "")
      }
    },
    [flowId, setValue],
  )

  return (
    <div className="flex flex-col gap-2">
      <ComboboxField
        emptyText={t("actions.noRecordFound")}
        name="value.0"
        options={flowOptions}
        placeholder={t("fields.flow.label")}
        popoverClassName="w-[var(--anchor-width)]"
        portal
        triggerValueChange={resetNode}
      />
      <ComboboxField
        emptyText={t("actions.noRecordFound")}
        name="value.1"
        options={nodeOptions}
        placeholder={t("currentStep.step")}
        popoverClassName="w-[var(--anchor-width)]"
        portal
      />
    </div>
  )
}

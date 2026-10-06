"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { useFormatter, useTranslations } from "next-intl"
import { formatStepLabel } from "../lib/step-label"
import type { CurrentFlowStepResource } from "../schemas/resource"

/**
 * One muted line "<flow> › <step> · <time ago>" for list items (inbox
 * conversation list, Kanban cards). Renders nothing without a step.
 */
export function CurrentStepLine({
  step,
  className,
}: {
  step: CurrentFlowStepResource | null | undefined
  className?: string
}) {
  const t = useTranslations()
  const format = useFormatter()

  if (!step) {
    return null
  }

  const text = t("currentStep.line", {
    flow: step.flowName,
    step: formatStepLabel(step, t),
    time: format.relativeTime(step.reachedAt),
  })

  return (
    <div
      className={cn("truncate text-[11px] text-muted-foreground", className)}
      title={`${t("currentStep.title")}: ${text}`}
    >
      {text}
    </div>
  )
}

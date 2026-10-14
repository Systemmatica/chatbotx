"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import { useRelativeTime } from "@/hooks/use-relative-time"
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
  const time = useRelativeTime(step?.reachedAt)

  if (!step) {
    return null
  }

  const text = t("currentStep.line", {
    flow: step.flowName,
    step: formatStepLabel(step, t),
    time,
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

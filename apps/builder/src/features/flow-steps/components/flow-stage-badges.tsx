"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { useTranslations } from "next-intl"
import type { ConversationFlowStageResource } from "@/features/conversations/schema/resource"
import { formatStepLabel } from "../lib/step-label"
import type { CurrentFlowStepResource } from "../schemas/resource"

/**
 * Two chips for list items: the funnel (flow) the contact is in and their
 * stage on that flow's board. Without a board stage the second chip shows the
 * current step instead, muted. Renders nothing outside any flow.
 */
export function FlowStageBadges({
  step,
  stage,
  className,
}: {
  step: CurrentFlowStepResource | null | undefined
  stage: ConversationFlowStageResource | null | undefined
  className?: string
}) {
  const t = useTranslations()

  if (!step) {
    return null
  }

  const stepLabel = formatStepLabel(step, t)

  return (
    <div className={cn("flex min-w-0 flex-wrap items-center gap-1", className)}>
      <span
        className="max-w-[60%] truncate rounded-full border bg-background px-2 py-0.5 text-[11px] text-foreground"
        title={`${t("currentStep.flow")}: ${step.flowName}`}
      >
        {step.flowName}
      </span>
      {stage ? (
        <span
          className="flex max-w-[60%] items-center gap-1 truncate rounded-full border bg-background px-2 py-0.5 font-medium text-[11px] text-foreground"
          title={`${t("flowHub.stage")}: ${stage.name}`}
        >
          <span
            aria-hidden
            className="size-2 shrink-0 rounded-full"
            style={{
              backgroundColor: stage.color ?? "var(--muted-foreground)",
            }}
          />
          <span className="truncate">{stage.name}</span>
        </span>
      ) : (
        <span
          className="max-w-[60%] truncate rounded-full px-1 py-0.5 text-[11px] text-muted-foreground"
          title={`${t("currentStep.step")}: ${stepLabel}`}
        >
          {stepLabel}
        </span>
      )}
    </div>
  )
}

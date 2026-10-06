"use client"

import { formatDate } from "@chatbotx.io/ui/lib/format"
import { ExternalLinkIcon, WorkflowIcon } from "lucide-react"
import Link from "next/link"
import { useFormatter, useLocale, useTranslations } from "next-intl"
import { formatStepLabel } from "../lib/step-label"
import type { CurrentFlowStepResource } from "../schemas/resource"

/**
 * "Current step" block for the contact panel: flow, step, when the contact
 * reached it, and a link to the flow in the builder.
 */
export function CurrentStepBlock({
  workspaceId,
  step,
}: {
  workspaceId: string
  step: CurrentFlowStepResource | null | undefined
}) {
  const t = useTranslations()
  const format = useFormatter()
  const locale = useLocale()

  return (
    <div className="flex flex-col gap-1 border-t px-2 py-3 text-[12px]">
      <div className="flex items-center gap-1 font-medium text-gray-600 dark:text-gray-300">
        <WorkflowIcon className="size-4" />
        {t("currentStep.title")}
      </div>
      {step ? (
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">{t("currentStep.flow")}</dt>
          <dd className="truncate">{step.flowName}</dd>
          <dt className="text-muted-foreground">{t("currentStep.step")}</dt>
          <dd className="truncate" title={formatStepLabel(step, t)}>
            {formatStepLabel(step, t)}
          </dd>
          <dt className="text-muted-foreground">
            {t("currentStep.reachedAt")}
          </dt>
          <dd
            className="truncate"
            title={formatDate(step.reachedAt, {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
              locale,
            })}
          >
            {format.relativeTime(step.reachedAt)}
          </dd>
        </dl>
      ) : (
        <p className="text-muted-foreground">{t("currentStep.noActiveFlow")}</p>
      )}
      {step ? (
        <Link
          className="inline-flex w-fit items-center gap-1 text-primary hover:underline"
          href={`/space/${workspaceId}/flows/${step.flowId}`}
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("currentStep.openFlow")}
          <ExternalLinkIcon className="size-3" />
        </Link>
      ) : null}
    </div>
  )
}

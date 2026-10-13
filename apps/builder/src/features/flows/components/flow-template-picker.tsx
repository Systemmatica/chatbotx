"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { Loader2Icon, WorkflowIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useAction } from "next-safe-action/hooks"
import { toast } from "sonner"
import { createFlowsFromTemplateAction } from "../actions/create-flows-from-template.action"
import type { FlowTemplateId } from "../schemas/action"

const TEMPLATES: { id: FlowTemplateId; messagesKey: "funnel" }[] = [
  { id: "funnelThreeEntries", messagesKey: "funnel" },
]

/** Built-in templates offered in the "new flow" dialog. */
export function FlowTemplatePicker({
  workspaceId,
  folderId,
  disabled,
  onCreated,
}: {
  workspaceId: string
  folderId: string | null
  disabled?: boolean
  /** Receives the flow to open, i.e. the template's common flow. */
  onCreated: (flowId: string) => void
}) {
  const t = useTranslations()

  const { execute, isPending, input } = useAction(
    createFlowsFromTemplateAction.bind(null, workspaceId),
    {
      onSuccess: ({ data }) => {
        if (!data) {
          return
        }
        toast.success(
          t("flowTemplates.createdSuccess", { count: data.flowIds.length }),
        )
        onCreated(data.flowId)
      },
      onError: ({ error }) => {
        toast.error(
          error.serverError ??
            t("messages.createdFailed", { feature: t("fields.flow.label") }),
        )
      },
    },
  )

  return (
    <div className="flex flex-col gap-2">
      <p className="text-muted-foreground text-sm">
        {t("flowTemplates.orStartFrom")}
      </p>
      {TEMPLATES.map((template) => {
        const isRunning = isPending && input?.templateId === template.id
        return (
          <button
            className={cn(
              "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              "disabled:pointer-events-none disabled:opacity-60",
            )}
            disabled={disabled || isPending}
            key={template.id}
            onClick={() => execute({ templateId: template.id, folderId })}
            type="button"
          >
            {isRunning ? (
              <Loader2Icon className="mt-0.5 size-5 shrink-0 animate-spin" />
            ) : (
              <WorkflowIcon className="mt-0.5 size-5 shrink-0 text-primary" />
            )}
            <span className="flex flex-col gap-1">
              <span className="font-medium text-sm">
                {t(`flowTemplates.${template.messagesKey}.title`)}
              </span>
              <span className="text-muted-foreground text-xs">
                {t(`flowTemplates.${template.messagesKey}.description`)}
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}

"use client"

import { useTranslations } from "next-intl"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { FlowHubTabs } from "./flow-hub-tabs"

/** Header of the flow hub pages that have no canvas (board, settings). */
export function FlowHubHeader({
  workspaceId,
  flowId,
  flowName,
  section,
}: {
  workspaceId: string
  flowId: string
  flowName: string
  /** Translation key of the current tab under `flowHub`. */
  section: "kanban" | "settings"
}) {
  const t = useTranslations()

  return (
    <header className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
      <div className="min-w-0 flex-1">
        <AppBreadcrumb
          items={[
            {
              label: t("fields.flows.label"),
              href: `/space/${workspaceId}/flows`,
            },
            {
              label: flowName,
              href: `/space/${workspaceId}/flows/${flowId}`,
            },
            { label: t(`flowHub.${section}`), href: "" },
          ]}
        />
      </div>
      <FlowHubTabs flowId={flowId} workspaceId={workspaceId} />
    </header>
  )
}

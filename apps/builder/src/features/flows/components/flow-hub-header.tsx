"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@chatbotx.io/ui/components/ui/dropdown-menu"
import { CopyIcon, EllipsisIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { useState } from "react"
import { AppBreadcrumb } from "@/components/app-breadcrumb"
import { DuplicateFlowDialog } from "../duplicate-flow-dialog"
import { FlowHubTabs } from "./flow-hub-tabs"

/** Header of the flow hub pages that have no canvas (board, chats, settings). */
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
  section: "kanban" | "chats" | "settings"
}) {
  const t = useTranslations()
  const router = useRouter()
  const [duplicateOpen, setDuplicateOpen] = useState(false)

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
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              aria-label={t("actions.actions")}
              size="icon"
              variant="ghost"
            >
              <EllipsisIcon />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setDuplicateOpen(true)}>
            <CopyIcon />
            {t("flows.duplicateFlow")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DuplicateFlowDialog
        flow={{ id: flowId, name: flowName }}
        onOpenChange={setDuplicateOpen}
        onSuccess={(duplicatedFlowId) =>
          router.push(`/space/${workspaceId}/flows/${duplicatedFlowId}`)
        }
        open={duplicateOpen}
        workspaceId={workspaceId}
      />
    </header>
  )
}

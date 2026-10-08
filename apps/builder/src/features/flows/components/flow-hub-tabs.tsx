"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ChartColumnIcon,
  MessagesSquareIcon,
  SettingsIcon,
  SquareKanbanIcon,
  WorkflowIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"

/**
 * The flow is the hub: its builder, funnel board, chats, analytics and
 * settings are tabs of one page. "Chats" is the inbox pre-filtered to contacts
 * currently in this flow.
 */
export function flowChatsHref(workspaceId: string, flowId: string): string {
  const filter = {
    operator: "and",
    conditions: [{ field: "currentFlow", operator: "eq", value: flowId }],
  }
  return `/space/${workspaceId}/inbox?contactFilter=${encodeURIComponent(
    JSON.stringify(filter),
  )}`
}

export function FlowHubTabs({
  workspaceId,
  flowId,
  className,
}: {
  workspaceId: string
  flowId: string
  className?: string
}) {
  const t = useTranslations()
  const pathname = usePathname()
  const base = `/space/${workspaceId}/flows/${flowId}`

  const tabs = [
    { id: "builder", href: base, icon: WorkflowIcon },
    { id: "kanban", href: `${base}/kanban`, icon: SquareKanbanIcon },
    {
      id: "chats",
      href: flowChatsHref(workspaceId, flowId),
      icon: MessagesSquareIcon,
    },
    { id: "analytics", href: `${base}/analytics`, icon: ChartColumnIcon },
    { id: "settings", href: `${base}/settings`, icon: SettingsIcon },
  ] as const

  return (
    <nav
      aria-label={t("flowHub.label")}
      className={cn("flex items-center gap-1", className)}
    >
      {tabs.map((tab) => {
        const active = tab.id !== "chats" && pathname === tab.href
        const Icon = tab.icon
        return (
          <Link
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm transition-colors",
              active
                ? "bg-secondary font-medium text-foreground"
                : "text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
            href={tab.href}
            key={tab.id}
          >
            <Icon className="size-4" />
            <span className="hidden lg:inline">{t(`flowHub.${tab.id}`)}</span>
          </Link>
        )
      })}
    </nav>
  )
}

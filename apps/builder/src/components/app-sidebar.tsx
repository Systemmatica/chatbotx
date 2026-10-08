"use client"

import type { WorkspaceMemberPermissions } from "@chatbotx.io/database/partials"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
} from "@chatbotx.io/ui/components/ui/sidebar"
import {
  AtomIcon,
  BrainIcon,
  ChartPieIcon,
  ChevronsRight,
  LightbulbIcon,
  type LucideIcon,
  MagnetIcon,
  MessageCircleMoreIcon,
  RadioIcon,
  SlidersHorizontalIcon,
  SquareKanbanIcon,
  UsersIcon,
  WebhookIcon,
  WorkflowIcon,
  WrenchIcon,
} from "lucide-react"

import Link from "next/link"
import { useTranslations } from "next-intl"
import type { ComponentProps } from "react"
import { BrandIcon } from "@/components/brand-icon"
import { NavHelp } from "@/components/nav-help"
import { NavMain } from "@/components/nav-main"
import { NavUsage, type QuotaSummary } from "@/components/nav-usage"
import { NavUser } from "@/components/nav-user"
import { WorkspaceSwitcher } from "@/components/workspace-switcher"
import type { WorkspaceResource } from "@/features/workspaces/schema/resource"
import { authClient } from "@/lib/auth/auth-client"
import {
  hasContactsAccess,
  hasWorkspacePermission,
  PERMISSION_NAV,
  type WorkspacePermissionKey,
} from "@/lib/auth/permission-routes"

type SidebarNavItem = {
  id: string
  title: string
  url: string
  icon: LucideIcon
  permission: WorkspacePermissionKey
}

const SETTINGS_GENERAL_URL_SEGMENT = "/settings/general"

export function AppSidebar({
  workspaceId,
  allWorkspaces,
  isSuperAdmin,
  isPlatformAdmin,
  permissions,
  quota,
  scheduledForDeletion = false,
  hiddenFeatures = [],
  staffNotificationsAvailable = false,
  ...props
}: ComponentProps<typeof Sidebar> & {
  workspaceId: string
  allWorkspaces: WorkspaceResource[]
  isSuperAdmin?: boolean
  isPlatformAdmin?: boolean
  // Runtime may be a partial object (the jsonb column defaults to `{}`);
  // `hasWorkspacePermission` fails closed on any missing flag.
  permissions: WorkspaceMemberPermissions
  quota: QuotaSummary
  scheduledForDeletion?: boolean
  hiddenFeatures?: string[]
  staffNotificationsAvailable?: boolean
}) {
  const t = useTranslations()
  const { data: session } = authClient.useSession()

  const data = {
    user: {
      name: session?.user.name ?? "",
      email: session?.user.email ?? "",
      avatar: session?.user.image ?? "",
    },
    navMain: [
      {
        id: "dashboard",
        title: t("fields.analytics.label"),
        url: `/space/${workspaceId}/dashboard`,
        icon: ChartPieIcon,
        permission: PERMISSION_NAV.dashboard,
      },
      {
        id: "inbox",
        title: t("fields.inbox.label"),
        url: `/space/${workspaceId}/inbox`,
        icon: MessageCircleMoreIcon,
        permission: PERMISSION_NAV.contacts,
      },
      {
        id: "flows",
        title: t("fields.flows.label"),
        url: `/space/${workspaceId}/flows`,
        icon: WorkflowIcon,
        permission: PERMISSION_NAV.flows,
      },
      {
        id: "contacts",
        title: t("fields.contacts.label"),
        url: `/space/${workspaceId}/contacts`,
        icon: UsersIcon,
        permission: PERMISSION_NAV.contacts,
      },
      {
        id: "lead-magnets",
        title: t("leadMagnets.title"),
        url: `/space/${workspaceId}/lead-magnets`,
        icon: MagnetIcon,
        permission: PERMISSION_NAV.contacts,
      },
      {
        id: "kanban",
        title: t("kanban.title"),
        url: `/space/${workspaceId}/kanban`,
        icon: SquareKanbanIcon,
        permission: PERMISSION_NAV.contacts,
      },
      {
        id: "ai-agents",
        title: t("aiAgent.title"),
        url: `/space/${workspaceId}/ai-agents`,
        icon: BrainIcon,
        permission: PERMISSION_NAV.flows,
      },
      {
        id: "keywords",
        title: t("keywords.title"),
        url: `/space/${workspaceId}/automated-responses`,
        icon: AtomIcon,
        permission: "superAdmin",
      },
      {
        id: "broadcasts",
        title: t("broadcasts.title"),
        url: `/space/${workspaceId}/broadcasts`,
        icon: RadioIcon,
        permission: PERMISSION_NAV.broadcasts,
      },
      {
        id: "sequences",
        title: t("sequences.title"),
        url: `/space/${workspaceId}/sequences`,
        icon: ChevronsRight,
        permission: PERMISSION_NAV.sequences,
      },
      {
        id: "triggers",
        title: t("triggers.title"),
        url: `/space/${workspaceId}/triggers`,
        icon: LightbulbIcon,
        permission: "superAdmin",
      },
      {
        id: "webhooks",
        title: t("webhooks.title"),
        url: `/space/${workspaceId}/webhooks`,
        icon: WebhookIcon,
        permission: "superAdmin",
      },
      {
        id: "tools",
        title: t("tools.title"),
        url: `/space/${workspaceId}/tools`,
        icon: WrenchIcon,
        permission: PERMISSION_NAV.flows,
      },
      {
        id: "settings",
        title: t("settings.title"),
        url: `/space/${workspaceId}/settings/general`,
        icon: SlidersHorizontalIcon,
        permission: "superAdmin",
      },
    ] satisfies SidebarNavItem[],
  }

  const navMain = data.navMain
    .filter((item) => !hiddenFeatures.includes(item.id))
    .filter((item) =>
      // Items gated on the `contacts` flag (Contacts, Inbox) use the shared
      // contacts-access rule, which also admits assigned-only members.
      item.permission === PERMISSION_NAV.contacts
        ? hasContactsAccess(permissions)
        : hasWorkspacePermission(permissions, item.permission),
    )
    .map((item) => ({
      ...item,
      disabled:
        scheduledForDeletion &&
        !item.url.endsWith(SETTINGS_GENERAL_URL_SEGMENT),
    }))

  return (
    <Sidebar collapsible="icon" {...props}>
      <SidebarHeader className="gap-0 px-0 py-0">
        <Link
          className="flex h-12 items-center justify-center border-b"
          href="/"
        >
          <BrandIcon alt="Brand" />
        </Link>
        <div className="border-b px-1">
          <WorkspaceSwitcher workspaces={allWorkspaces} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <NavMain
          disabledTooltip={t("workspace.deletion.navDisabledTooltip")}
          items={navMain}
        />
      </SidebarContent>
      <SidebarFooter>
        <NavUsage
          metrics={quota.metrics}
          planStatus={quota.planStatus}
          trialEndsAt={quota.trialEndsAt}
        />
        <NavUser
          isPlatformAdmin={isPlatformAdmin}
          isSuperAdmin={isSuperAdmin}
          planName={quota.planName}
          staffNotificationsAvailable={staffNotificationsAvailable}
          user={data.user}
          workspaceId={workspaceId}
        />
        <NavHelp />
      </SidebarFooter>
    </Sidebar>
  )
}

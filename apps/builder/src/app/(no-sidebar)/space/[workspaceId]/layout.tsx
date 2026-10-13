import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound, redirect } from "next/navigation"
import type { ReactNode } from "react"
import { CouponTopicStoreProvider } from "@/features/coupons/provider/coupon-topic-store-context"
import { WorkspaceCommandPalette } from "@/features/workspace-search/components/command-palette"
import { hasWorkspacePermission } from "@/lib/auth/permission-routes"
import { enforcePasswordCurrent } from "@/lib/auth/require-password-current"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"
import { parseHiddenFeatures } from "@/lib/hidden-features"
import { logger } from "@/lib/log"
import { enforceWorkspaceNotScheduledForDeletionFromRequest } from "@/lib/workspace/require-not-scheduled-for-deletion"

export type WorkspaceNoSidebarLayoutProps = {
  params: Promise<{ workspaceId: string }>
  children: ReactNode
}

export default async function WorkspaceNoSidebarLayout({
  params,
  children,
}: WorkspaceNoSidebarLayoutProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  const result = await getCurrentUserAndTargetWorkspace(workspaceId)
  if (!result) {
    logger.debug(
      `User is not authenticated or does not have access to the workspace ${workspaceId}`,
    )

    return redirect("/")
  }

  enforcePasswordCurrent(result.user)

  await enforceWorkspaceNotScheduledForDeletionFromRequest(
    result.targetWorkspace,
    hasWorkspacePermission(
      result.targetWorkspaceMember.permissions,
      "superAdmin",
    ),
  )

  return (
    <CouponTopicStoreProvider autoInitialize={false} workspaceId={workspaceId}>
      {children}
      <WorkspaceCommandPalette
        hiddenFeatures={parseHiddenFeatures()}
        permissions={result.targetWorkspaceMember.permissions}
        workspaceId={workspaceId}
      />
    </CouponTopicStoreProvider>
  )
}

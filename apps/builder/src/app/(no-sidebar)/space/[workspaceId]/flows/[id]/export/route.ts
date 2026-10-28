import { buildFlowExport } from "@/features/flows/lib/flow-export"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import {
  hasWorkspacePermission,
  type WorkspacePermissionKey,
} from "@/lib/auth/permission-routes"
import { getCurrentUserAndTargetWorkspace } from "@/lib/auth/utils"

export const runtime = "nodejs"

const FLOW_EXPORT_PERMISSION: WorkspacePermissionKey = "flows"

export async function GET(
  _request: Request,
  props: { params: Promise<{ workspaceId: string; id: string }> },
) {
  const { data } = withWorkspaceIdAndIdSchema.safeParse(await props.params)
  if (!data) {
    return new Response(null, { status: 404 })
  }

  // A route handler must return an explicit Response on the deny path.
  // `notFound()` (used by requireWorkspacePermission) renders an HTML error
  // page here instead of a real 404, and the browser saves that page as the
  // downloaded file.
  const userAndWorkspace = await getCurrentUserAndTargetWorkspace(
    data.workspaceId,
  )
  const canAccess = userAndWorkspace
    ? hasWorkspacePermission(
        userAndWorkspace.targetWorkspaceMember.permissions,
        FLOW_EXPORT_PERMISSION,
      )
    : false
  if (!canAccess) {
    return new Response(null, { status: 404 })
  }

  const result = await buildFlowExport({
    workspaceId: data.workspaceId,
    flowId: data.id,
  })
  if (result.status === "notFound") {
    return new Response(null, { status: 404 })
  }
  if (result.status === "notPublished") {
    return Response.json({ code: "notPublished" }, { status: 409 })
  }

  const body = JSON.stringify(result.envelope, null, 2)

  return new Response(body, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${result.fileName}"`,
      "Cache-Control": "no-store",
    },
  })
}

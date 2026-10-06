import { ToolsList } from "@/features/tools/tools-list"
import { resolveGuardedWorkspaceId } from "@/lib/auth/require-workspace-permission"
import { parseHiddenFeatures } from "@/lib/hidden-features"

export default async function ToolsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>
}) {
  await resolveGuardedWorkspaceId(params, "flows")

  return <ToolsList hiddenFeatures={parseHiddenFeatures()} />
}

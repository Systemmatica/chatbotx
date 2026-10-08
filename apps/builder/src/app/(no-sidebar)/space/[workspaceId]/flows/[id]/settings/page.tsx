import { automatedResponseService, flowService } from "@chatbotx.io/business"
import { Badge } from "@chatbotx.io/ui/components/ui/badge"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { PencilIcon, PlusIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import { FlowHubHeader } from "@/features/flows/components/flow-hub-header"
import { withWorkspaceIdAndIdSchema } from "@/features/workspaces/schema/resource"
import { requireWorkspacePermission } from "@/lib/auth/require-workspace-permission"

type FlowSettingsPageProps = {
  params: Promise<{ workspaceId: string; id: string }>
}

/**
 * Flow settings: what starts the flow. Keywords live here instead of a
 * separate menu, because the flow is the hub.
 */
export default async function FlowSettingsPage({
  params,
}: FlowSettingsPageProps) {
  const { data } = await withWorkspaceIdAndIdSchema.safeParse(await params)
  if (!data) {
    return notFound()
  }

  await requireWorkspacePermission(data.workspaceId, "flows")

  const flow = await flowService.findBy({
    workspaceId: data.workspaceId,
    id: data.id,
  })
  if (!flow) {
    return notFound()
  }

  const t = await getTranslations()
  const keywords = await automatedResponseService.listInboundByFlow({
    workspaceId: flow.workspaceId,
    flowId: flow.id,
  })
  const settingsPath = `/space/${flow.workspaceId}/flows/${flow.id}/settings`
  const createHref = `/space/${flow.workspaceId}/automated-responses/create?${new URLSearchParams(
    { flowId: flow.id, returnTo: settingsPath },
  ).toString()}`

  return (
    <div className="flex h-screen w-screen flex-col">
      <FlowHubHeader
        flowId={flow.id}
        flowName={flow.name}
        section="settings"
        workspaceId={flow.workspaceId}
      />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 overflow-y-auto p-6">
        <section className="flex flex-col gap-3 rounded-lg border p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="font-semibold">{t("flowHub.keywordsTitle")}</h2>
              <p className="text-muted-foreground text-sm">
                {t("flowHub.keywordsDescription")}
              </p>
            </div>
            <Link
              className={buttonVariants({ size: "sm" })}
              href={createHref}
            >
              <PlusIcon />
              {t("flowHub.addKeyword")}
            </Link>
          </div>

          {keywords.length === 0 ? (
            <p className="rounded-md border border-dashed p-4 text-center text-muted-foreground text-sm">
              {t("flowHub.noKeywords")}
            </p>
          ) : (
            <ul className="flex flex-col divide-y rounded-md border">
              {keywords.map((keyword) => (
                <li
                  className="flex items-center justify-between gap-3 px-3 py-2"
                  key={keyword.id}
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-1.5">
                    {keyword.keywords.map((value) => (
                      <Badge key={value} variant="secondary">
                        {value}
                      </Badge>
                    ))}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge variant={keyword.status ? "default" : "outline"}>
                      {keyword.status
                        ? t("flowHub.keywordOn")
                        : t("flowHub.keywordOff")}
                    </Badge>
                    <Link
                      aria-label={t("actions.edit")}
                      className={buttonVariants({
                        size: "icon",
                        variant: "ghost",
                      })}
                      href={`/space/${flow.workspaceId}/automated-responses/${keyword.id}/edit`}
                    >
                      <PencilIcon />
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>
    </div>
  )
}

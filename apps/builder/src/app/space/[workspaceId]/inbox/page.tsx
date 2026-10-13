import { getIdFromParams } from "@chatbotx.io/utils"
import { notFound } from "next/navigation"
import { InboxScreen } from "@/features/chat/inbox-screen"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schemas"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

type InboxPageProps = {
  params: Promise<{ workspaceId: string }>
  searchParams?: Promise<{ contactFilter?: string | string[] }>
}

/** `?contactFilter=<json>` presets the conversation filter. */
const parseContactFilter = (raw: string | string[] | undefined) => {
  if (typeof raw !== "string") {
    return
  }
  try {
    const parsed = contactFilterCriteriaSchema.safeParse(JSON.parse(raw))
    return parsed.success ? parsed.data : undefined
  } catch {
    return
  }
}

export default async function InboxPage({
  params,
  searchParams,
}: InboxPageProps) {
  const workspaceId = getIdFromParams(await params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }

  await requireContactsAccess(workspaceId)

  return (
    <div className="-m-6">
      <InboxScreen
        initialFilters={{
          contactFilter: parseContactFilter(
            (await searchParams)?.contactFilter,
          ),
        }}
        workspaceId={workspaceId}
      />
    </div>
  )
}

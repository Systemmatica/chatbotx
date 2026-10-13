import { contactViewService } from "@chatbotx.io/business"
import { buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import { getIdFromParams } from "@chatbotx.io/utils"
import { CloudUploadIcon } from "lucide-react"
import Link from "next/link"
import { notFound } from "next/navigation"
import { getTranslations } from "next-intl/server"
import type { SearchParams } from "nuqs/server"
import { Suspense } from "react"
import { EMPTY_CONTACT_FILTER } from "@/features/contact-filter"
import { CONTACT_VIEW_PARAM } from "@/features/contact-views/lib/view-state"
import { resolveContactViewConfig } from "@/features/contact-views/schemas/config"
import { ContactsTable } from "@/features/contacts/contacts-table"
import { CreateContactDialog } from "@/features/contacts/create-contact-dialog"
import { requireContactPermissionScope } from "@/features/contacts/permissions"
import { listContactsRSC } from "@/features/contacts/queries/list-contacts.queries"
import { listContactsRequest } from "@/features/contacts/schemas/query"
import { CustomFieldStoreProvider } from "@/features/custom-fields/provider/custom-field-store-context"
import { FlowStoreProvider } from "@/features/flows/provider/flow-store-context"
import { InboxStoreProvider } from "@/features/inboxes/provider/inbox-store-context"
import { SequenceStoreProvider } from "@/features/sequences/provider/sequence-store-context"
import { TagStoreProvider } from "@/features/tags/provider/tag-store-context"
import { UserStoreProvider } from "@/features/users/provider/user-store-context"
import { requireContactsAccess } from "@/lib/auth/require-workspace-permission"

export default async function ContactsPage(props: {
  params: Promise<{ workspaceId: string }>
  searchParams: Promise<SearchParams>
}) {
  const workspaceId = getIdFromParams(await props.params, "workspaceId")
  if (!workspaceId) {
    return notFound()
  }
  await requireContactsAccess(workspaceId)
  const contactPermissionScope =
    await requireContactPermissionScope(workspaceId)

  const t = await getTranslations()
  const searchParams = await props.searchParams
  const { data: search } = listContactsRequest
    .omit({ workspaceId: true })
    .safeParse(searchParams)
  // A shared link may carry only `?view=<id>`: the view's filter and sort
  // then drive the first page (explicit URL params still win).
  const views = await contactViewService.list({ workspaceId })
  const viewParam = searchParams[CONTACT_VIEW_PARAM]
  const activeView =
    typeof viewParam === "string"
      ? views.find((view) => view.id === viewParam)
      : undefined
  const activeViewConfig = activeView
    ? resolveContactViewConfig(activeView.config)
    : null
  const initialContactFilter =
    search?.contactFilter ?? activeViewConfig?.filter ?? EMPTY_CONTACT_FILTER

  const promises = Promise.all([
    listContactsRSC({
      ...search,
      contactFilter:
        search?.contactFilter ?? activeViewConfig?.filter ?? undefined,
      sort:
        search?.sort ??
        (activeViewConfig?.sort.length ? activeViewConfig.sort : undefined),
      workspaceId,
    }),
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-bold text-xl">{t("contacts.title")}</h4>
        <div className="flex items-center gap-2">
          <Link
            className={buttonVariants({ variant: "outline" })}
            href={`/space/${workspaceId}/contacts/import`}
          >
            <CloudUploadIcon />
            {t("actions.import")}
          </Link>
          <CreateContactDialog workspaceId={workspaceId} />
        </div>
      </div>

      <Suspense>
        <UserStoreProvider workspaceId={workspaceId}>
          <TagStoreProvider workspaceId={workspaceId}>
            <CustomFieldStoreProvider workspaceId={workspaceId}>
              <FlowStoreProvider workspaceId={workspaceId}>
                <InboxStoreProvider workspaceId={workspaceId}>
                  <SequenceStoreProvider workspaceId={workspaceId}>
                    <ContactsTable
                      canManageViews={
                        !contactPermissionScope.restrictToAssignedUserId
                      }
                      canViewEmailAndPhone={
                        contactPermissionScope.canViewEmailAndPhone
                      }
                      initialContactFilter={initialContactFilter}
                      initialViews={views}
                      promises={promises}
                      workspaceId={workspaceId}
                    />
                  </SequenceStoreProvider>
                </InboxStoreProvider>
              </FlowStoreProvider>
            </CustomFieldStoreProvider>
          </TagStoreProvider>
        </UserStoreProvider>
      </Suspense>
    </div>
  )
}

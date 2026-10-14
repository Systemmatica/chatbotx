"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import { DataTable } from "@chatbotx.io/ui/components/data-table/data-table"
import { DataTableColumnHeader } from "@chatbotx.io/ui/components/data-table/data-table-column-header"
import { DataTableToolbar } from "@chatbotx.io/ui/components/data-table/data-table-toolbar"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { Checkbox } from "@chatbotx.io/ui/components/ui/checkbox"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@chatbotx.io/ui/components/ui/tooltip"
import { useDataTable } from "@chatbotx.io/ui/hooks/use-data-table"
import {
  formatCustomFieldValueInTimeZone,
  isTemporalCustomFieldType,
} from "@chatbotx.io/utils/datetime"
import type { Column, ColumnDef } from "@tanstack/react-table"
import { format } from "date-fns"
import { ChevronDownIcon, ChevronRightIcon } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useFormatter, useTranslations } from "next-intl"
import { parseAsString, useQueryState } from "nuqs"
import { use, useCallback, useEffect, useMemo, useRef, useState } from "react"
import { LabelChip, LabelChipList } from "@/components/labels/label-chip"
import { RelativeTime } from "@/components/relative-time"
import {
  type ContactFilterCriteria,
  ContactListFilterButton,
  ContactListFilterPanel,
  countContactFilterLeafConditions,
  EMPTY_CONTACT_FILTER,
  useContactFilterQueryState,
} from "@/features/contact-filter"
import { EMAIL_PHONE_RESTRICTED_FILTER_FIELDS } from "@/features/contact-filter/lib/restricted-fields"
import { getBrowserTimezone } from "@/features/contact-filter/lib/timezone"
import { ContactGroupByMenu } from "@/features/contact-views/components/contact-group-by-menu"
import { ContactViewTabs } from "@/features/contact-views/components/contact-view-tabs"
import {
  buildGroupingContext,
  useCollapsedGroups,
  useGroupCounts,
  useGroupingSources,
} from "@/features/contact-views/hooks/use-contact-grouping"
import { useContactViews } from "@/features/contact-views/hooks/use-contact-views"
import {
  EMPTY_GROUP_KEY,
  groupRows,
  visibleRowIds,
} from "@/features/contact-views/lib/grouping"
import {
  CONTACT_VIEW_PARAM,
  type ContactTableViewState,
  isViewStateDirty,
  toSavedViewConfig,
  toTableViewState,
} from "@/features/contact-views/lib/view-state"
import {
  type ContactViewGroupBy,
  resolveContactViewConfig,
} from "@/features/contact-views/schemas/config"
import type { ContactViewResource } from "@/features/contact-views/schemas/resource"
import { client } from "@/lib/orpc/orpc"
import { resolveCustomFieldIcon } from "../custom-fields/lib/custom-field-icons"
import { useCustomFieldStore } from "../custom-fields/provider/custom-field-store-context"
import type { CustomFieldResource } from "../custom-fields/schemas/resource"
import { InboxIcon } from "../inboxes/components/inbox-icon"
import { getUserName } from "../users/schemas/resource"
import {
  type ColumnOption,
  ContactColumnsMenu,
} from "./components/contact-columns-menu"
import { ContactPeek } from "./components/contact-peek"
import { CustomFieldCell } from "./components/custom-field-cell"
import { CONTACTS_DEFAULT_PER_PAGE } from "./constants"
import { ContactListAction } from "./contacts-list-action"
import { useContactPeek } from "./hooks/use-contact-peek"
import {
  BASE_HIDEABLE_COLUMNS,
  buildColumnVisibility,
  customFieldColumnId,
  getRowCustomFieldValue,
  patchRowCustomField,
} from "./lib/custom-field-columns"
import {
  CONTACT_PEEK_PARAM,
  isInteractiveClickTarget,
} from "./lib/peek-navigation"
import {
  getSingleTagFilterId,
  TAG_RECEIVED_AT_COLUMN_ID,
} from "./lib/tag-received-at"
import type { listContacts } from "./queries/list-contacts.queries"
import type { ExportContactsFilter } from "./schemas/action"
import type { ListContactsResponse } from "./schemas/query"
import type { ContactResource } from "./schemas/resource"
import { getLatestContactLastReadAt, useAvatarUrl } from "./utils"

const parseSortParam = (value: string | null) => {
  if (!value) {
    return []
  }

  try {
    const parsed = JSON.parse(value)
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed.filter(
      (sort): sort is { id: string; desc: boolean } =>
        typeof sort?.id === "string" && typeof sort?.desc === "boolean",
    )
  } catch {
    return []
  }
}

const MAX_VISIBLE_TAGS = 3

function ContactTagsCell({
  tags,
}: {
  tags: { id: string; name: string; color: string | null }[]
}) {
  if (tags.length === 0) {
    return null
  }
  const hidden = tags.length - MAX_VISIBLE_TAGS
  return (
    <LabelChipList className="max-w-64">
      {tags.slice(0, MAX_VISIBLE_TAGS).map((tag) => (
        <LabelChip color={tag.color} key={tag.id} name={tag.name} />
      ))}
      {hidden > 0 ? (
        <span
          className="text-muted-foreground text-xs"
          title={tags
            .slice(MAX_VISIBLE_TAGS)
            .map((tag) => tag.name)
            .join(", ")}
        >
          +{hidden}
        </span>
      ) : null}
    </LabelChipList>
  )
}

function NameCell({
  contact,
  workspaceId,
}: {
  contact: ListContactsResponse["data"][number]
  workspaceId: string
}) {
  const avatarUrl = useAvatarUrl(contact)
  const conversationId = contact.conversation?.id
  const inboxHref = conversationId
    ? `/space/${workspaceId}/inbox?conversationId=${conversationId}`
    : null
  const channel = contact.contactInboxes?.[0]?.channel as
    | ChannelType
    | undefined

  const avatarVisual = (
    <div className="relative">
      <Avatar className="size-9 shrink-0">
        <AvatarImage
          alt={contact.fullName ?? ""}
          className="object-cover"
          src={avatarUrl}
        />
        <AvatarFallback className="bg-gray-300 text-sm dark:bg-zinc-100 dark:text-zinc-800">
          {contact.fullName?.slice(0, 2) ?? "?"}
        </AvatarFallback>
      </Avatar>
      {channel && (
        <div className="absolute end-0 bottom-0 ltr:translate-x-1 rtl:-translate-x-1">
          <InboxIcon
            channel={channel}
            iconClassName="size-3"
            showLabel={false}
            size="small"
          />
        </div>
      )}
    </div>
  )

  const avatarNode = inboxHref ? (
    <Link href={inboxHref} prefetch={false} target="_blank">
      {avatarVisual}
    </Link>
  ) : (
    avatarVisual
  )

  // The name opens the side peek (row click); the avatar still opens the chat.
  const nameNode = (
    <span className="truncate font-medium leading-5">{contact.fullName}</span>
  )

  return (
    <div className="flex max-w-56 items-center gap-3">
      {avatarNode}
      <Tooltip>
        <TooltipTrigger render={nameNode} />
        <TooltipContent>
          <p>{contact.fullName}</p>
        </TooltipContent>
      </Tooltip>
    </div>
  )
}

function CustomFieldHeader({ field }: { field: CustomFieldResource }) {
  const Icon = resolveCustomFieldIcon(field)
  return (
    <span className="inline-flex max-w-48 items-center gap-1.5">
      <Icon className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="truncate">{field.name}</span>
    </span>
  )
}

type ContactsTableProps = {
  canViewEmailAndPhone?: boolean
  /** Members limited to assigned contacts use views but cannot edit them. */
  canManageViews?: boolean
  initialContactFilter?: ContactFilterCriteria
  initialViews?: ContactViewResource[]
  workspaceId: string
  promises: Promise<[Awaited<ReturnType<typeof listContacts>>]>
}

export function ContactsTable({
  canViewEmailAndPhone = true,
  canManageViews = false,
  initialContactFilter = EMPTY_CONTACT_FILTER,
  initialViews = [],
  workspaceId,
  promises,
}: ContactsTableProps) {
  const t = useTranslations()
  const formatter = useFormatter()
  const searchParams = useSearchParams()
  // The peek and view params only switch UI state (the view's filter and
  // sort are applied separately): they must not refetch the list.
  const searchParamsKey = useMemo(() => {
    const params = new URLSearchParams(searchParams.toString())
    params.delete(CONTACT_PEEK_PARAM)
    params.delete(CONTACT_VIEW_PARAM)
    return params.toString()
  }, [searchParams])
  const { contactId: peekContactId, openContact } = useContactPeek()
  const [
    {
      data: initialData,
      pageCount: initialPageCount,
      totalCount: initialTotalCount,
      totalCountCapped: initialTotalCountCapped,
    },
  ] = use(promises)
  const [tableData, setTableData] =
    useState<ListContactsResponse["data"]>(initialData)
  const [tablePageCount, setTablePageCount] = useState(initialPageCount)
  const [tableTotalCount, setTableTotalCount] = useState(initialTotalCount)
  const [tableTotalCountCapped, setTableTotalCountCapped] = useState(
    initialTotalCountCapped,
  )
  const didHydrateInitialDataRef = useRef(false)
  const {
    filter: contactFilter,
    setFilter: setContactFilter,
    isActive: isContactFilterActive,
  } = useContactFilterQueryState({ initialFilter: initialContactFilter })
  const [optimisticContactFilter, setOptimisticContactFilter] =
    useState<ContactFilterCriteria>(contactFilter)
  const [showContactFilterPanel, setShowContactFilterPanel] = useState(
    isContactFilterActive,
  )
  const isOptimisticContactFilterActive =
    countContactFilterLeafConditions(optimisticContactFilter) > 0
  const excludedFilterFields = useMemo(
    () =>
      canViewEmailAndPhone ? [] : [...EMAIL_PHONE_RESTRICTED_FILTER_FIELDS],
    [canViewEmailAndPhone],
  )

  const keyword = useMemo(() => {
    const params = new URLSearchParams(searchParamsKey)
    return params.get("keyword") ?? undefined
  }, [searchParamsKey])

  useEffect(() => {
    if (!didHydrateInitialDataRef.current) {
      didHydrateInitialDataRef.current = true
      return
    }

    let ignore = false
    const params = new URLSearchParams(searchParamsKey)

    client.contactsAPIs
      .listContactsByPOSTAuthenticatedAPI({
        workspaceId,
        page: Number(params.get("page") ?? "1"),
        perPage: Number(
          params.get("perPage") ?? String(CONTACTS_DEFAULT_PER_PAGE),
        ),
        sort: parseSortParam(params.get("sort")),
        keyword: params.get("keyword") ?? undefined,
        contactFilter: isContactFilterActive ? contactFilter : undefined,
      })
      .then((response) => {
        if (ignore) {
          return
        }

        setTableData(response.data)
        setTablePageCount(response.pageCount)
        setTableTotalCount(response.totalCount)
        setTableTotalCountCapped(response.totalCountCapped)
      })
      .catch(() => {
        if (ignore) {
          return
        }

        setTableData(initialData)
        setTablePageCount(initialPageCount)
        setTableTotalCount(initialTotalCount)
        setTableTotalCountCapped(initialTotalCountCapped)
      })

    return () => {
      ignore = true
    }
  }, [
    contactFilter,
    initialData,
    initialPageCount,
    initialTotalCount,
    initialTotalCountCapped,
    isContactFilterActive,
    searchParamsKey,
    workspaceId,
  ])

  useEffect(() => {
    if (isContactFilterActive) {
      setShowContactFilterPanel(true)
    }
  }, [isContactFilterActive])

  useEffect(() => {
    setOptimisticContactFilter(contactFilter)
  }, [contactFilter])

  const exportFilter = useMemo<ExportContactsFilter>(
    () => ({
      keyword,
      contactFilter: isOptimisticContactFilterActive
        ? optimisticContactFilter
        : undefined,
    }),
    [keyword, isOptimisticContactFilterActive, optimisticContactFilter],
  )
  // Filtered by exactly one tag (e.g. a lead magnet's "show contacts"): the
  // server then returns when each contact got that tag.
  const showTagReceivedAt =
    isContactFilterActive && getSingleTagFilterId(contactFilter) !== null

  const totalCountDisplay = formatter.number(tableTotalCount)
  const totalCountLabel = tableTotalCountCapped
    ? t("contacts.countCapped", { count: totalCountDisplay })
    : t("contacts.countExact", { count: totalCountDisplay })

  const customFields = useCustomFieldStore((state) => state.customFields)
  // Optimistic inline edits (and their rollback) patch the loaded page.
  const updateRowCustomField = useCallback(
    (contactId: string, customFieldId: string, value: string | null) => {
      setTableData((rows) =>
        patchRowCustomField(rows, contactId, customFieldId, value),
      )
    },
    [],
  )

  const columns = useMemo<ColumnDef<ListContactsResponse["data"][number]>[]>(
    () => [
      {
        id: "select",
        header: ({ table: innerTable }) => (
          <Checkbox
            aria-label={t("actions.selectAll")}
            checked={innerTable.getIsAllPageRowsSelected()}
            indeterminate={innerTable.getIsSomePageRowsSelected()}
            onCheckedChange={(value) =>
              innerTable.toggleAllPageRowsSelected(Boolean(value))
            }
          />
        ),
        cell: ({ row }) => (
          <Checkbox
            aria-label={t("actions.selectRow")}
            checked={row.getIsSelected()}
            onCheckedChange={(value) => row.toggleSelected(Boolean(value))}
          />
        ),
        size: 32,
        enableSorting: false,
        enableHiding: false,
      },
      {
        id: "fullName",
        accessorKey: "fullName",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.name.label")}
          />
        ),
        cell: ({ row }) => (
          <NameCell contact={row.original} workspaceId={workspaceId} />
        ),
        meta: {
          label: t("fields.name.label"),
          placeholder: t("fields.name.placeholder"),
          variant: "text",
          // The column id ("fullName") matches the DB column so sorting
          // works directly, but the filter must persist under the server's
          // "keyword" query param — it searches name, email, and phone, not
          // just fullName.
          filterKey: "keyword",
        },
        enableColumnFilter: true,
        enableHiding: false,
      },
      {
        accessorKey: "source",
        header: ({ column }: { column: Column<ContactResource, unknown> }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.source.label")}
          />
        ),
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            {[
              ...new Set(
                row.original.contactInboxes?.map(
                  (contactInbox) => contactInbox.source,
                ) ?? [],
              ),
            ].map((source) => {
              const labelKey = `condition.sources.${source}` as const
              return (
                <span key={source}>
                  {t.has(labelKey) ? t(labelKey) : source}
                </span>
              )
            })}
          </div>
        ),
        enableSorting: false,
        meta: {
          label: t("fields.source.label"),
        },
      },
      {
        id: "tags",
        header: ({ column }: { column: Column<ContactResource, unknown> }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.tags.label")}
          />
        ),
        cell: ({ row }) => <ContactTagsCell tags={row.original.tags ?? []} />,
        enableSorting: false,
        meta: {
          label: t("fields.tags.label"),
        },
      },
      {
        accessorKey: "assignee",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.assignee.label")}
          />
        ),
        cell: ({ row }) => (
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="inline-block max-w-[200px] truncate">
                  {getUserName(
                    row.original.conversation?.assignedUser,
                    t("assignAdmin.unAssigned"),
                  )}
                </div>
              }
            />
            <TooltipContent>
              {getUserName(
                row.original.conversation?.assignedUser,
                t("assignAdmin.unAssigned"),
              )}
            </TooltipContent>
          </Tooltip>
        ),
        meta: {
          label: t("fields.assignee.label"),
        },
        enableSorting: false,
      },
      {
        id: "lastReadAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.lastRead.label")}
          />
        ),
        cell: ({ row }) => {
          const lastReadAt = getLatestContactLastReadAt(
            row.original.contactInboxes,
          )

          return (
            <div>{lastReadAt ? <RelativeTime value={lastReadAt} /> : null}</div>
          )
        },
        meta: {
          label: t("fields.lastRead.label"),
        },
        enableSorting: false,
      },
      ...(showTagReceivedAt
        ? [
            {
              id: TAG_RECEIVED_AT_COLUMN_ID,
              accessorFn: (row) => row.tagReceivedAt ?? null,
              header: ({ column }) => (
                <DataTableColumnHeader
                  column={column}
                  title={t("contacts.tagReceivedAt")}
                />
              ),
              cell: ({ row }) =>
                row.original.tagReceivedAt
                  ? format(row.original.tagReceivedAt, "yyyy/MM/dd HH:mm")
                  : null,
              meta: {
                label: t("contacts.tagReceivedAt"),
              },
              enableSorting: true,
              enableHiding: false,
            } satisfies ColumnDef<ListContactsResponse["data"][number]>,
          ]
        : []),
      {
        accessorKey: "createdAt",
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t("fields.createdAt.label")}
          />
        ),
        cell: ({ row }) => format(row.original.createdAt, "yyyy/MM/dd"),
        meta: {
          label: t("fields.createdAt.label"),
        },
        enableSorting: true,
      },
      ...customFields.map(
        (field) =>
          ({
            id: customFieldColumnId(field.id),
            accessorFn: (row) => getRowCustomFieldValue(row, field.id),
            header: () => <CustomFieldHeader field={field} />,
            cell: ({ row }) => (
              <CustomFieldCell
                contactId={row.original.id}
                customFieldId={field.id}
                onLocalChange={(value) =>
                  updateRowCustomField(row.original.id, field.id, value)
                }
                type={field.type}
                value={getRowCustomFieldValue(row.original, field.id)}
                workspaceId={workspaceId}
              />
            ),
            meta: { label: field.name },
            enableSorting: false,
          }) satisfies ColumnDef<ListContactsResponse["data"][number]>,
      ),
    ],
    [workspaceId, t, showTagReceivedAt, customFields, updateRowCustomField],
  )

  const { table } = useDataTable({
    data: tableData,
    columns,
    pageCount: tablePageCount,
    initialState: {
      pagination: {
        pageIndex: 0,
        pageSize: CONTACTS_DEFAULT_PER_PAGE,
      },
      sorting: [{ id: "createdAt", desc: true }],
      columnPinning: { right: ["actions"] },
    },
    getRowId: (originalRow) => originalRow.id,
    shallow: false,
    clearOnDefault: true,
  })

  // ── Saved views ─────────────────────────────────────────────────────
  const contactViews = useContactViews(workspaceId, initialViews)
  const [activeViewId, setActiveViewId] = useQueryState(
    CONTACT_VIEW_PARAM,
    parseAsString.withOptions({ history: "replace", scroll: false }),
  )
  const activeView =
    contactViews.views.find((view) => view.id === activeViewId) ?? null
  const expectedViewState = useMemo(
    () =>
      toTableViewState(
        activeView ? resolveContactViewConfig(activeView.config) : null,
      ),
    [activeView],
  )
  const [visibleColumns, setVisibleColumns] = useState<readonly string[]>(
    expectedViewState.visibleColumns,
  )
  const [groupBy, setGroupBy] = useState<ContactViewGroupBy | null>(
    expectedViewState.groupBy,
  )
  const sorting = table.getState().sorting
  const currentViewState = useMemo<ContactTableViewState>(
    () => ({
      filter: optimisticContactFilter,
      sort: sorting,
      visibleColumns,
      groupBy,
    }),
    [optimisticContactFilter, sorting, visibleColumns, groupBy],
  )
  const viewDirty = isViewStateDirty(expectedViewState, currentViewState)
  const baseColumnOptions = useMemo<ColumnOption[]>(
    () => [
      { id: "source", label: t("fields.source.label") },
      { id: "assignee", label: t("fields.assignee.label") },
      { id: "lastReadAt", label: t("fields.lastRead.label") },
      { id: "createdAt", label: t("fields.createdAt.label") },
    ],
    [t],
  )
  const customFieldColumnOptions = useMemo<ColumnOption[]>(
    () =>
      customFields.map((field) => ({
        id: customFieldColumnId(field.id),
        label: field.name,
      })),
    [customFields],
  )
  useEffect(() => {
    table.setColumnVisibility(
      buildColumnVisibility(
        [
          ...BASE_HIDEABLE_COLUMNS,
          ...customFieldColumnOptions.map((column) => column.id),
        ],
        visibleColumns,
      ),
    )
  }, [table, visibleColumns, customFieldColumnOptions])

  const handleContactFilterChange = useCallback(
    (next: ContactFilterCriteria) => {
      table.setPageIndex(0)
      setOptimisticContactFilter(next)
      setContactFilter(next).catch(() => {
        setOptimisticContactFilter(contactFilter)
      })
    },
    [contactFilter, setContactFilter, table],
  )

  const applyViewState = useCallback(
    (state: ContactTableViewState) => {
      handleContactFilterChange(state.filter)
      table.setSorting(state.sort)
      setVisibleColumns(state.visibleColumns)
      setGroupBy(state.groupBy)
    },
    [handleContactFilterChange, table],
  )

  const selectView = useCallback(
    (viewId: string | null) => {
      const view = contactViews.views.find((item) => item.id === viewId)
      setActiveViewId(view ? view.id : null)
      applyViewState(
        toTableViewState(view ? resolveContactViewConfig(view.config) : null),
      )
    },
    [applyViewState, contactViews.views, setActiveViewId],
  )

  // Opened from a link: the server applied the view's filter (and first
  // page sort); bring the sort into the table state once. A link to a view
  // that no longer exists falls back to "All".
  const didApplyLinkedViewRef = useRef(false)
  useEffect(() => {
    if (didApplyLinkedViewRef.current) {
      return
    }
    didApplyLinkedViewRef.current = true
    if (activeViewId && !activeView) {
      setActiveViewId(null)
      return
    }
    if (activeView && !new URLSearchParams(searchParamsKey).has("sort")) {
      table.setSorting(expectedViewState.sort)
    }
  }, [
    activeView,
    activeViewId,
    expectedViewState.sort,
    searchParamsKey,
    setActiveViewId,
    table,
  ])

  // ── Grouping ─────────────────────────────────────────────────────────
  const [groupMenuOpened, setGroupMenuOpened] = useState(false)
  const groupingSources = useGroupingSources(
    workspaceId,
    groupMenuOpened || groupBy !== null,
  )
  const groupingContext = useMemo(
    () => buildGroupingContext(groupBy, groupingSources),
    [groupBy, groupingSources],
  )
  const groupCounts = useGroupCounts({
    workspaceId,
    groupBy,
    contactFilter: isContactFilterActive ? contactFilter : undefined,
    keyword,
  })
  const { collapsed: collapsedGroups, toggle: toggleGroup } =
    useCollapsedGroups({
      workspaceId,
      viewId: activeView?.id ?? null,
      groupBy,
    })
  const groups = useMemo(
    () => (groupBy ? groupRows(tableData, groupBy, groupingContext) : null),
    [groupBy, groupingContext, tableData],
  )
  const groupingLabel = useMemo(() => {
    switch (groupBy?.kind) {
      case "leadMagnet":
        return t("contactViews.grouping.leadMagnet")
      case "stage":
        return (
          groupingSources.boards.find((board) => board.id === groupBy.boardId)
            ?.name ?? t("contactViews.grouping.stage")
        )
      case "customField":
        return (
          customFields.find((field) => field.id === groupBy.customFieldId)
            ?.name ?? null
        )
      default:
        return null
    }
  }, [groupBy, groupingSources.boards, customFields, t])
  const groupFieldType =
    groupBy?.kind === "customField"
      ? (customFields.find((field) => field.id === groupBy.customFieldId)
          ?.type ?? "shortText")
      : null

  const groupTitle = (key: string): string => {
    if (key === EMPTY_GROUP_KEY) {
      if (groupBy?.kind === "stage") {
        return t("kanban.noStatus")
      }
      return groupBy?.kind === "leadMagnet"
        ? t("contactViews.grouping.noLeadMagnet")
        : t("contactViews.grouping.empty")
    }
    if (groupBy?.kind === "leadMagnet") {
      return (
        groupingSources.leadMagnets.find((item) => item.id === key)?.name ?? key
      )
    }
    if (groupFieldType === "boolean") {
      return key === "true"
        ? t("fields.boolean.true")
        : t("fields.boolean.false")
    }
    if (groupFieldType && isTemporalCustomFieldType(groupFieldType)) {
      return formatCustomFieldValueInTimeZone(
        groupFieldType,
        key,
        getBrowserTimezone(),
      )
    }
    return key
  }

  const rowById = new Map(
    table.getRowModel().rows.map((row) => [row.original.id, row]),
  )
  const rowGroups = groups?.map((group) => {
    const total = groupCounts?.get(group.key)
    const isCollapsed = collapsedGroups.has(group.key)
    return {
      id: group.key,
      collapsed: isCollapsed,
      rows: group.rows.flatMap((contact) => {
        const row = rowById.get(contact.id)
        return row ? [row] : []
      }),
      header: (
        <button
          aria-expanded={!isCollapsed}
          className="flex w-full items-center gap-2 text-start font-medium text-sm"
          onClick={() => toggleGroup(group.key)}
          type="button"
        >
          {isCollapsed ? (
            <ChevronRightIcon className="size-4 shrink-0" />
          ) : (
            <ChevronDownIcon className="size-4 shrink-0" />
          )}
          <span className="truncate">{groupTitle(group.key)}</span>
          <span className="rounded-full bg-background px-2 text-muted-foreground text-xs">
            {formatter.number(total ?? group.rows.length)}
          </span>
          {total !== undefined && total !== group.rows.length ? (
            <span className="text-muted-foreground text-xs">
              {t("contactViews.grouping.onThisPage", {
                count: group.rows.length,
              })}
            </span>
          ) : null}
        </button>
      ),
    }
  })

  const peekContactIds = useMemo(
    () =>
      groups
        ? visibleRowIds(groups, collapsedGroups)
        : tableData.map((contact) => contact.id),
    [groups, collapsedGroups, tableData],
  )
  const chatHref = useCallback(
    (conversationId: string) =>
      `/space/${workspaceId}/inbox?conversationId=${conversationId}`,
    [workspaceId],
  )

  return (
    <>
      <ContactViewTabs
        activeViewId={activeView?.id ?? null}
        canManage={canManageViews}
        dirty={viewDirty}
        onCreate={async (name) => {
          const view = await contactViews.create(
            name,
            toSavedViewConfig(currentViewState),
          )
          if (view) {
            await setActiveViewId(view.id)
          }
        }}
        onDelete={async (viewId) => {
          const deleted = await contactViews.remove(viewId)
          if (deleted && viewId === activeView?.id) {
            selectView(null)
          }
        }}
        onDiscard={() => applyViewState(expectedViewState)}
        onDuplicate={async (viewId, name) => {
          const view = await contactViews.duplicate(viewId, name)
          if (view) {
            await setActiveViewId(view.id)
            applyViewState(
              toTableViewState(resolveContactViewConfig(view.config)),
            )
          }
        }}
        onMove={(viewId, direction) => {
          contactViews.move(viewId, direction)
        }}
        onRename={(viewId, name) => contactViews.update(viewId, { name })}
        onSave={async () => {
          if (activeView) {
            await contactViews.update(activeView.id, {
              config: toSavedViewConfig(currentViewState),
            })
          }
        }}
        onSelect={selectView}
        views={contactViews.views}
      />
      <DataTable
        className="[&_tbody_td]:py-3 [&_tbody_td]:text-[15px] [&_tbody_tr]:h-16"
        isRowActive={(row) => row.original.id === peekContactId}
        onRowClick={(row, event) => {
          if (
            isInteractiveClickTarget(event.target, event.currentTarget) ||
            window.getSelection()?.toString()
          ) {
            return
          }
          openContact(row.original.id)
        }}
        rowGroups={rowGroups}
        table={table}
      >
        {showContactFilterPanel && (
          <ContactListFilterPanel
            excludeFields={excludedFilterFields}
            filter={optimisticContactFilter}
            onFilterChange={handleContactFilterChange}
          />
        )}
        <DataTableToolbar table={table}>
          <span className="whitespace-nowrap text-muted-foreground text-sm">
            {totalCountLabel}
          </span>
          <ContactListFilterButton
            active={isOptimisticContactFilterActive}
            filter={optimisticContactFilter}
            onToggle={() => setShowContactFilterPanel((current) => !current)}
            open={showContactFilterPanel}
          />
          <ContactGroupByMenu
            boards={groupingSources.boards}
            customFields={customFields}
            groupBy={groupBy}
            label={groupingLabel}
            onGroupByChange={setGroupBy}
            onOpenChange={(open) => {
              if (open) {
                setGroupMenuOpened(true)
              }
            }}
          />
          <ContactColumnsMenu
            baseColumns={baseColumnOptions}
            customFieldColumns={customFieldColumnOptions}
            onVisibleColumnsChange={setVisibleColumns}
            visibleColumns={visibleColumns}
          />
          <ContactListAction
            filter={exportFilter}
            table={table}
            workspaceId={workspaceId}
          />
        </DataTableToolbar>
      </DataTable>
      <ContactPeek
        chatHref={chatHref}
        contactIds={peekContactIds}
        workspaceId={workspaceId}
      />
    </>
  )
}

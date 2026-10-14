"use client"

import { Button } from "@chatbotx.io/ui/components/ui/button"
import { formatDate } from "@chatbotx.io/ui/lib/format"
import {
  ArchiveIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CircleMinusIcon,
  GiftIcon,
  HistoryIcon,
  type LucideIcon,
  PencilLineIcon,
  PlayIcon,
  PlugIcon,
  RotateCwIcon,
  StickyNoteIcon,
  TagIcon,
  UserCheckIcon,
  UserPlusIcon,
  UserXIcon,
  WorkflowIcon,
} from "lucide-react"
import { useLocale, useTranslations } from "next-intl"
import { useCallback, useEffect, useRef, useState } from "react"
import { RelativeTime } from "@/components/relative-time"
import { client } from "@/lib/orpc/orpc"
import { describeActivity, describeActor } from "../lib/describe-activity"
import {
  CONTACT_ACTIVITY_PAGE_SIZE,
  type ContactActivityItemResource,
  type ContactActivityItemType,
} from "../schemas"

const ICONS: Record<ContactActivityItemType, LucideIcon> = {
  contactCreated: UserPlusIcon,
  channelConnected: PlugIcon,
  tagAdded: TagIcon,
  tagRemoved: CircleMinusIcon,
  leadMagnetReceived: GiftIcon,
  customFieldChanged: PencilLineIcon,
  flowStarted: PlayIcon,
  stepReached: WorkflowIcon,
  noteAdded: StickyNoteIcon,
  assignmentChanged: UserCheckIcon,
  conversationClosed: ArchiveIcon,
}

const iconFor = (item: ContactActivityItemResource): LucideIcon =>
  item.type === "assignmentChanged" && !item.details.assigneeKind
    ? UserXIcon
    : ICONS[item.type]

type FeedState = {
  items: ContactActivityItemResource[]
  nextCursor: string | null
  loading: boolean
  error: boolean
}

const INITIAL_STATE: FeedState = {
  items: [],
  nextCursor: null,
  loading: false,
  error: false,
}

/**
 * "History" section of the contact card: a chronological, paginated timeline
 * of what happened to the contact (joined, tags, flows, fields, notes,
 * assignment). Self-contained: loads its own data by contact id.
 */
export function ContactActivityFeed({
  workspaceId,
  contactId,
}: {
  workspaceId: string
  contactId: string | null | undefined
}) {
  const t = useTranslations()
  const locale = useLocale()
  const [open, setOpen] = useState(true)
  const [state, setState] = useState<FeedState>(INITIAL_STATE)
  // Responses for a contact (or a reload) that is no longer current are dropped.
  const requestRef = useRef(0)

  const load = useCallback(
    (cursor: string | null) => {
      if (!contactId) {
        return
      }
      requestRef.current += 1
      const requestId = requestRef.current
      setState((previous) => ({
        ...(cursor ? previous : INITIAL_STATE),
        loading: true,
        error: false,
      }))
      client.contactActivityAPI
        .listContactActivityAPI({
          workspaceId,
          contactId,
          cursor,
          limit: CONTACT_ACTIVITY_PAGE_SIZE,
        })
        .then(({ data, nextCursor }) => {
          if (requestRef.current !== requestId) {
            return
          }
          setState((previous) => ({
            items: cursor ? [...previous.items, ...data] : data,
            nextCursor,
            loading: false,
            error: false,
          }))
        })
        .catch(() => {
          if (requestRef.current !== requestId) {
            return
          }
          setState((previous) => ({ ...previous, loading: false, error: true }))
        })
    },
    [workspaceId, contactId],
  )

  useEffect(() => {
    requestRef.current += 1
    setState(INITIAL_STATE)
    if (open && contactId) {
      load(null)
    }
  }, [contactId, open, load])

  if (!contactId) {
    return null
  }

  return (
    <section className="flex w-full flex-col border-t px-2 py-3 text-[12px]">
      <div className="flex items-center gap-1">
        <button
          aria-expanded={open}
          className="flex flex-1 items-center gap-1 text-left font-medium text-gray-600 dark:text-gray-300"
          onClick={() => setOpen((value) => !value)}
          type="button"
        >
          {open ? (
            <ChevronDownIcon className="size-3.5" />
          ) : (
            <ChevronRightIcon className="size-3.5" />
          )}
          <HistoryIcon className="size-4" />
          {t("contactActivity.title")}
        </button>
        {open ? (
          <Button
            aria-label={t("contactActivity.refresh")}
            className="size-6"
            disabled={state.loading}
            onClick={() => load(null)}
            size="icon"
            title={t("contactActivity.refresh")}
            variant="ghost"
          >
            <RotateCwIcon className="size-3.5" />
          </Button>
        ) : null}
      </div>

      {open ? (
        <div className="mt-2 flex flex-col">
          {state.items.length === 0 && !state.loading && !state.error ? (
            <p className="text-muted-foreground">
              {t("contactActivity.empty")}
            </p>
          ) : null}

          <ol className="flex flex-col">
            {state.items.map((item) => {
              const Icon = iconFor(item)
              const { title, detail } = describeActivity(item, t)
              const actor = describeActor(item.actor, t)
              return (
                <li className="flex gap-2 py-1" key={item.id}>
                  <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <span className="break-words">{title}</span>
                    {detail ? (
                      <span className="line-clamp-2 break-words text-muted-foreground">
                        {detail}
                      </span>
                    ) : null}
                    <span className="text-[11px] text-muted-foreground">
                      <RelativeTime
                        title={formatDate(item.occurredAt, {
                          day: "2-digit",
                          month: "2-digit",
                          year: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          locale,
                        })}
                        value={item.occurredAt}
                      />
                      {actor ? ` · ${actor}` : null}
                    </span>
                  </div>
                </li>
              )
            })}
          </ol>

          {state.error ? (
            <p className="text-destructive">{t("contactActivity.loadError")}</p>
          ) : null}

          {state.loading ? (
            <p className="text-muted-foreground">
              {t("contactActivity.loading")}
            </p>
          ) : null}

          {state.nextCursor && !state.loading ? (
            <Button
              className="mt-1 h-7 self-start px-2 text-[12px]"
              onClick={() => load(state.nextCursor)}
              size="sm"
              variant="ghost"
            >
              {t("contactActivity.loadMore")}
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

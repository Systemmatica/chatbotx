"use client"

import { cn } from "@chatbotx.io/ui/lib/utils"
import { Loader2Icon, PaperclipIcon } from "lucide-react"
import { useTranslations } from "next-intl"
import { useEffect, useState } from "react"
import { RelativeTime } from "@/components/relative-time"
import type { ListMessagesResponse } from "@/features/messages/schema/query"
import { client } from "@/lib/orpc/orpc"

const RECENT_MESSAGES_LIMIT = 6

type RecentMessage = ListMessagesResponse["data"][number]

/** A short read-only tail of the contact's chat for the side peek. */
export function ContactRecentMessages({
  workspaceId,
  conversationId,
}: {
  workspaceId: string
  conversationId: string | null | undefined
}) {
  const t = useTranslations()
  const [messages, setMessages] = useState<RecentMessage[] | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    setMessages(null)
    setFailed(false)
    if (!conversationId) {
      return
    }
    let ignore = false
    client.messagesAPI
      .listMessagesAuthenticatedAPI({
        workspaceId,
        conversationId,
        perPage: RECENT_MESSAGES_LIMIT,
      })
      .then(({ data }) => {
        if (!ignore) {
          setMessages(
            data.toSorted(
              (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime(),
            ),
          )
        }
      })
      .catch(() => {
        if (!ignore) {
          setFailed(true)
        }
      })
    return () => {
      ignore = true
    }
  }, [workspaceId, conversationId])

  let body: React.ReactNode
  if (!conversationId) {
    body = <Empty>{t("contactPeek.noConversation")}</Empty>
  } else if (failed) {
    body = <Empty>{t("messages.errorLoadingData")}</Empty>
  } else if (messages === null) {
    body = (
      <div className="flex justify-center py-4">
        <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
      </div>
    )
  } else if (messages.length === 0) {
    body = <Empty>{t("contactPeek.noMessages")}</Empty>
  } else {
    body = (
      <ol className="flex flex-col gap-1.5">
        {messages.map((message) => (
          <li
            className={cn(
              "flex flex-col",
              message.messageType === "outgoing" && "items-end",
              message.messageType === "activity" && "items-center",
            )}
            key={message.id}
          >
            <div
              className={cn(
                "max-w-[85%] rounded-lg px-2.5 py-1.5 text-xs",
                message.messageType === "incoming" && "bg-muted",
                message.messageType === "outgoing" &&
                  "bg-primary/10 text-foreground",
                message.messageType === "activity" &&
                  "bg-transparent text-muted-foreground italic",
              )}
            >
              {message.text ? (
                <p className="line-clamp-4 whitespace-pre-line break-words">
                  {message.text}
                </p>
              ) : null}
              {message.attachments.length > 0 ? (
                <p className="flex items-center gap-1 text-muted-foreground">
                  <PaperclipIcon className="size-3" />
                  {t("contactPeek.attachments", {
                    count: message.attachments.length,
                  })}
                </p>
              ) : null}
            </div>
            <RelativeTime
              className="px-1 text-[10px] text-muted-foreground"
              value={message.createdAt}
            />
          </li>
        ))}
      </ol>
    )
  }

  return (
    <section className="flex flex-col gap-2">
      <h3 className="font-medium text-sm">{t("contactPeek.recentMessages")}</h3>
      {body}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-muted-foreground text-xs">{children}</p>
}

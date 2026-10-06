"use client"

import type { ChannelType } from "@chatbotx.io/database/partials"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import { useDraggable } from "@dnd-kit/core"
import Link from "next/link"
import { useFormatter, useTranslations } from "next-intl"
import { CurrentStepLine } from "@/features/flow-steps/components/current-step-line"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { useTenantSettings } from "@/features/tenant"
import type { KanbanCardResource } from "../schemas/resource"

type KanbanCardProps = {
  workspaceId: string
  card: KanbanCardResource
  /** Rendered inside the drag overlay: no drag handlers, no link. */
  overlay?: boolean
}

export function KanbanCardContent({
  card,
  className,
}: {
  card: KanbanCardResource
  className?: string
}) {
  const t = useTranslations()
  const format = useFormatter()
  const { storageUrl } = useTenantSettings()
  const avatarUrl = card.avatar
    ? getPublicFileUrl(card.avatar, storageUrl)
    : undefined
  const displayName = card.fullName ?? t("kanban.unnamedContact")

  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border bg-card p-3 shadow-xs",
        className,
      )}
    >
      <div className="relative shrink-0">
        <Avatar className="size-9">
          <AvatarImage
            alt={displayName}
            className="object-cover"
            src={avatarUrl}
          />
          <AvatarFallback className="bg-muted text-xs">
            {displayName.slice(0, 2)}
          </AvatarFallback>
        </Avatar>
        {card.channel ? (
          <div className="absolute end-0 bottom-0 ltr:translate-x-1 rtl:-translate-x-1">
            <InboxIcon
              channel={card.channel as ChannelType}
              iconClassName="size-3"
              showLabel={false}
              size="small"
            />
          </div>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-sm">{displayName}</p>
        <p className="truncate text-muted-foreground text-xs">
          {card.lastMessageAt
            ? format.relativeTime(card.lastMessageAt)
            : t("kanban.noLastMessage")}
        </p>
        <CurrentStepLine step={card.currentFlowStep} />
      </div>
    </div>
  )
}

export function KanbanCard({ workspaceId, card, overlay }: KanbanCardProps) {
  const t = useTranslations()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.contactId,
    disabled: overlay,
  })

  if (overlay) {
    return <KanbanCardContent card={card} className="rotate-2 shadow-lg" />
  }

  const content = (
    <KanbanCardContent
      card={card}
      className={cn(
        "cursor-grab transition-colors hover:bg-accent active:cursor-grabbing",
        isDragging && "opacity-40",
      )}
    />
  )

  return (
    <div ref={setNodeRef} {...attributes} {...listeners}>
      {card.conversationId ? (
        <Link
          aria-label={t("kanban.openChat")}
          className="block"
          draggable={false}
          href={`/space/${workspaceId}/inbox?conversationId=${card.conversationId}`}
        >
          {content}
        </Link>
      ) : (
        <div title={t("kanban.noConversation")}>{content}</div>
      )}
    </div>
  )
}

"use client"

import {
  type ChannelType,
  DEFAULT_KANBAN_CARD_PROPERTIES,
  type KanbanCardProperty,
} from "@chatbotx.io/database/partials"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@chatbotx.io/ui/components/ui/avatar"
import { cn } from "@chatbotx.io/ui/lib/utils"
import { getPublicFileUrl } from "@chatbotx.io/utils"
import { useDraggable } from "@dnd-kit/core"
import { useTranslations } from "next-intl"
import { isInteractiveClickTarget } from "@/features/contacts/lib/peek-navigation"
import { InboxIcon } from "@/features/inboxes/components/inbox-icon"
import { useTenantSettings } from "@/features/tenant"
import type { KanbanCardResource } from "../schemas/resource"
import {
  type CardCustomField,
  KanbanCardPropertyLines,
} from "./kanban-card-properties"

const NO_CUSTOM_FIELDS = new Map<string, CardCustomField>()

/** What a board's cards show (properties + the custom fields they name). */
export type KanbanCardDisplay = {
  properties: readonly KanbanCardProperty[]
  customFieldsById: Map<string, CardCustomField>
}

const DEFAULT_DISPLAY: KanbanCardDisplay = {
  properties: DEFAULT_KANBAN_CARD_PROPERTIES,
  customFieldsById: NO_CUSTOM_FIELDS,
}

type KanbanCardProps = {
  card: KanbanCardResource
  /** Opens the contact in the side peek (a click, not the end of a drag). */
  onOpen?: (contactId: string) => void
  /** The card open in the side peek. */
  active?: boolean
  /** Rendered inside the drag overlay: no drag handlers, no click. */
  overlay?: boolean
  display?: KanbanCardDisplay
}

export function KanbanCardContent({
  card,
  className,
  display = DEFAULT_DISPLAY,
}: {
  card: KanbanCardResource
  className?: string
  display?: KanbanCardDisplay
}) {
  const t = useTranslations()
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
        <div className="flex min-w-0 flex-col gap-1">
          <KanbanCardPropertyLines
            card={card}
            customFieldsById={display.customFieldsById}
            properties={display.properties}
          />
        </div>
      </div>
    </div>
  )
}

export function KanbanCard({
  card,
  onOpen,
  active,
  overlay,
  display,
}: KanbanCardProps) {
  const t = useTranslations()
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: card.contactId,
    disabled: overlay,
  })

  if (overlay) {
    return (
      <KanbanCardContent
        card={card}
        className="rotate-2 shadow-lg"
        display={display}
      />
    )
  }

  // dnd-kit only starts a drag after the pointer moves 6px, so a plain click
  // reaches onClick; the view also ignores clicks right after a drop.
  return (
    // biome-ignore lint/a11y/useSemanticElements: a draggable card with block content; dnd-kit sets the same role
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={(event) => {
        if (!isInteractiveClickTarget(event.target, event.currentTarget)) {
          onOpen?.(card.contactId)
        }
      }}
      onKeyDown={(event) => {
        // Space starts a keyboard drag (see the view's sensors); Enter opens.
        if (
          event.key === "Enter" &&
          !isDragging &&
          event.target === event.currentTarget
        ) {
          event.preventDefault()
          onOpen?.(card.contactId)
          return
        }
        listeners?.onKeyDown?.(event)
      }}
      role="button"
      tabIndex={0}
      title={t("kanban.openContact")}
    >
      <KanbanCardContent
        card={card}
        className={cn(
          "cursor-grab transition-colors hover:bg-accent active:cursor-grabbing",
          active && "border-primary ring-1 ring-primary",
          isDragging && "opacity-40",
        )}
        display={display}
      />
    </div>
  )
}

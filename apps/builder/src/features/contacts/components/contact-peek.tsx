"use client"

import { Button, buttonVariants } from "@chatbotx.io/ui/components/ui/button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@chatbotx.io/ui/components/ui/sheet"
import { cn } from "@chatbotx.io/ui/lib/utils"
import {
  ChevronDownIcon,
  ChevronUpIcon,
  Maximize2Icon,
  MessageCircleIcon,
  Minimize2Icon,
} from "lucide-react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useState } from "react"
import { ContactPanel } from "../contact-inbox-panel"
import { useContactPeek } from "../hooks/use-contact-peek"
import {
  getAdjacentContactId,
  isTypingTarget,
  type PeekDirection,
} from "../lib/peek-navigation"
import type { GetContactResponse } from "../schemas/query"
import { ContactRecentMessages } from "./contact-recent-messages"

type ContactPeekProps = {
  workspaceId: string
  /** Contacts of the current list in display order (↑/↓ navigation). */
  contactIds: readonly string[]
  /** Where "Open chat" leads (the flow hub's chats tab on a flow board). */
  chatHref: (conversationId: string) => string
}

/**
 * Notion-style side peek: the contact card of `?contact=<id>` over the list.
 * Esc/close drops the param; ↑/↓ step through the list.
 */
export function ContactPeek({
  workspaceId,
  contactIds,
  chatHref,
}: ContactPeekProps) {
  const t = useTranslations()
  const { contactId, openContact, closeContact } = useContactPeek()
  const [contact, setContact] = useState<GetContactResponse | null>(null)
  const [expanded, setExpanded] = useState(false)

  // Drop the previous contact's header while the next one loads.
  useEffect(() => {
    setContact((current) => (current?.id === contactId ? current : null))
  }, [contactId])

  const previousId = getAdjacentContactId(contactIds, contactId, "previous")
  const nextId = getAdjacentContactId(contactIds, contactId, "next")

  const step = useCallback(
    (direction: PeekDirection) => {
      const target = getAdjacentContactId(contactIds, contactId, direction)
      if (target) {
        openContact(target)
      }
    },
    [contactIds, contactId, openContact],
  )

  useEffect(() => {
    if (!contactId) {
      return
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        isTypingTarget(event.target)
      ) {
        return
      }
      if (event.key === "ArrowUp" || event.key === "ArrowDown") {
        event.preventDefault()
        step(event.key === "ArrowUp" ? "previous" : "next")
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [contactId, step])

  const conversationId = contact?.conversationId ?? null
  const title =
    contact?.fullName ||
    [contact?.firstName, contact?.lastName].filter(Boolean).join(" ") ||
    t("contactPeek.title")

  return (
    <Sheet
      onOpenChange={(open) => {
        if (!open) {
          closeContact()
        }
      }}
      open={Boolean(contactId)}
    >
      <SheetContent
        className={cn(
          "w-full gap-0 sm:max-w-md",
          expanded && "sm:max-w-none lg:w-[min(1200px,95vw)]",
        )}
        side="right"
      >
        <SheetHeader className="flex-row items-center gap-1 border-b py-3 pe-12">
          <div className="min-w-0 flex-1">
            <SheetTitle className="truncate">{title}</SheetTitle>
            <SheetDescription className="sr-only">
              {t("contactPeek.description")}
            </SheetDescription>
          </div>
          <Button
            aria-label={t("contactPeek.previous")}
            disabled={!previousId}
            onClick={() => step("previous")}
            size="icon"
            title={t("contactPeek.previous")}
            type="button"
            variant="ghost"
          >
            <ChevronUpIcon />
          </Button>
          <Button
            aria-label={t("contactPeek.next")}
            disabled={!nextId}
            onClick={() => step("next")}
            size="icon"
            title={t("contactPeek.next")}
            type="button"
            variant="ghost"
          >
            <ChevronDownIcon />
          </Button>
          <Button
            aria-label={
              expanded ? t("contactPeek.collapse") : t("contactPeek.fullScreen")
            }
            className="hidden sm:inline-flex"
            onClick={() => setExpanded((value) => !value)}
            size="icon"
            title={
              expanded ? t("contactPeek.collapse") : t("contactPeek.fullScreen")
            }
            type="button"
            variant="ghost"
          >
            {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
          </Button>
        </SheetHeader>

        <div className="flex items-center gap-2 border-b px-4 py-2">
          {conversationId ? (
            <Link
              className={buttonVariants({ size: "sm" })}
              href={chatHref(conversationId)}
              prefetch={false}
            >
              <MessageCircleIcon />
              {t("contactPeek.openChat")}
            </Link>
          ) : (
            <Button disabled size="sm" type="button">
              <MessageCircleIcon />
              {t("contactPeek.openChat")}
            </Button>
          )}
          <Button
            onClick={() => setExpanded((value) => !value)}
            size="sm"
            type="button"
            variant="outline"
          >
            {expanded ? <Minimize2Icon /> : <Maximize2Icon />}
            {expanded ? t("contactPeek.collapse") : t("contactPeek.fullScreen")}
          </Button>
        </div>

        <div
          className={cn(
            "min-h-0 flex-1 overflow-y-auto p-4",
            expanded && "grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]",
          )}
        >
          <div className="min-w-0">
            <ContactPanel
              contactId={contactId}
              key={contactId ?? "none"}
              onContactLoaded={setContact}
              workspaceId={workspaceId}
            />
          </div>
          <div className={cn("min-w-0", expanded ? "" : "mt-4 border-t pt-4")}>
            <ContactRecentMessages
              conversationId={conversationId}
              workspaceId={workspaceId}
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}

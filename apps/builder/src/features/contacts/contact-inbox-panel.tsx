"use client"

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@chatbotx.io/ui/components/ui/accordion"
import { useTranslations } from "next-intl"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useVisibleInterval } from "@/hooks/use-visible-interval"
import { reconcileList, reuseUnchanged } from "@/lib/merge-fresh"
import { client } from "@/lib/orpc/orpc"
import type { ContactAppointmentResource } from "../appointments/schemas/resource"
import { useChatStore } from "../chat/store/chat-store-provider"
import { ContactActivityFeed } from "../contact-activity/components/contact-activity-feed"
import type { ContactInboxResource } from "../contact-inboxes/schema/resource"
import { ContactNotesManage } from "../contact-notes/contact-notes-manage"
import type { ContactOnSequenceWithRelations } from "../contact-sequences/schema"
import UpdateContactSequenceField from "../contact-sequences/update-contact-sequence-field"
import { CurrentStepBlock } from "../flow-steps/components/current-step-block"
import { ContactLeadMagnets } from "../lead-magnets/components/contact-lead-magnets"
import type { ReceivedLeadMagnetResource } from "../lead-magnets/schemas/resource"
import { SequenceStoreProvider } from "../sequences/provider/sequence-store-context"
import type { TagResource } from "../tags/schema/resource"
import { ContactAppointmentsList } from "./components/contact-appointments-list"
import UpdateContactTagField from "./components/update-contact-tag-field"
import { ContactDetail } from "./contact-detail"
import type { GetContactResponse } from "./schemas/query"
import type { ContactResource } from "./schemas/resource"

type AccordionModule = {
  readonly keyName: string
  readonly content: React.ReactNode
}

type ContactTagsChange = { seq: number; contactId: string }

/**
 * The contact card: fields, tags, lead magnets, notes, sequences... Shown next
 * to a chat in the inbox and in the contacts/kanban side peek.
 */
export const ContactPanel = ({
  workspaceId,
  contactId,
  baseContact,
  contactInbox,
  contactTagsChange,
  onContactLoaded,
}: {
  workspaceId: string
  contactId: string | null
  /** Live contact row (the inbox's chat store copy). */
  baseContact?: ContactResource | null
  /** Channel row shown first (the inbox's active chat). */
  contactInbox?: ContactInboxResource | null
  /** Signal that the bot changed the tags of `contactId`. */
  contactTagsChange?: ContactTagsChange | null
  onContactLoaded?: (contact: GetContactResponse | null) => void
}) => {
  const t = useTranslations()

  const [contactData, setContactData] = useState<GetContactResponse | null>(
    null,
  )
  const [coupons, setCoupons] = useState<
    Array<{ id: string; topicName: string; code: string; usedAt: Date | null }>
  >([])
  const [appointments, setAppointments] = useState<
    ContactAppointmentResource[]
  >([])
  const [receivedLeadMagnets, setReceivedLeadMagnets] = useState<
    ReceivedLeadMagnetResource[]
  >([])

  // A lead magnet is received through its tag, so this also runs after the
  // contact's tags change. Responses for a contact no longer shown are dropped.
  const leadMagnetsContactIdRef = useRef<string | null>(null)
  const loadLeadMagnets = useCallback(
    (contactId: string) => {
      leadMagnetsContactIdRef.current = contactId
      const apply = (data: ReceivedLeadMagnetResource[]) => {
        if (leadMagnetsContactIdRef.current === contactId) {
          setReceivedLeadMagnets(data)
        }
      }
      client.leadMagnetsAPI
        .listContactLeadMagnetsAPI({ workspaceId, contactId })
        .then(({ data }) => apply(data))
        .catch(() => apply([]))
    },
    [workspaceId],
  )

  const onContactLoadedRef = useRef(onContactLoaded)
  onContactLoadedRef.current = onContactLoaded

  // Bumped by every local change to the card (tags, sequences, fields), so a
  // background refresh that started before it cannot bring back stale data.
  const localEditSeqRef = useRef(0)
  const markLocalEdit = useCallback(() => {
    localEditSeqRef.current += 1
  }, [])
  const contactDataRef = useRef(contactData)
  contactDataRef.current = contactData

  // Background refresh of what the bot, flows or teammates can change while
  // the card is open: fields, tags, notes, current step and lead magnets. The
  // history feed refreshes itself. Nothing shows a spinner, and a response
  // for a contact no longer shown or older than a local edit is dropped.
  const refreshContact = useCallback(async () => {
    const shown = contactDataRef.current
    if (!(contactId && shown?.id === contactId)) {
      return
    }
    const editSeq = localEditSeqRef.current
    const [contactResult, leadMagnetsResult] = await Promise.allSettled([
      client.contactsAPIs.getContactAuthenticatedAPI({
        workspaceId,
        contactId,
      }),
      client.leadMagnetsAPI.listContactLeadMagnetsAPI({
        workspaceId,
        contactId,
      }),
    ])
    const current = contactDataRef.current
    if (current?.id !== contactId || localEditSeqRef.current !== editSeq) {
      return
    }
    if (contactResult.status === "fulfilled") {
      const next = reuseUnchanged(current, contactResult.value)
      if (next !== current) {
        contactDataRef.current = next
        setContactData(next)
        onContactLoadedRef.current?.(next)
      }
    }
    if (
      leadMagnetsResult.status === "fulfilled" &&
      leadMagnetsContactIdRef.current === contactId
    ) {
      setReceivedLeadMagnets((previous) =>
        reconcileList(
          previous,
          leadMagnetsResult.value.data,
          (item) => item.id,
        ),
      )
    }
  }, [contactId, workspaceId])

  useVisibleInterval(refreshContact, undefined, {
    enabled: Boolean(contactId && contactData?.id === contactId),
  })

  useEffect(() => {
    if (!contactId) {
      setContactData(null)
      setCoupons([])
      setAppointments([])
      leadMagnetsContactIdRef.current = null
      setReceivedLeadMagnets([])
      return
    }

    // Responses for a contact no longer shown (fast peek navigation) are
    // dropped.
    let ignore = false
    setContactData(null)
    client.contactsAPIs
      .getContactAuthenticatedAPI({ workspaceId, contactId })
      .then((data) => {
        if (!ignore) {
          setContactData(data)
          onContactLoadedRef.current?.(data)
        }
      })
      .catch(() => {
        if (!ignore) {
          setContactData(null)
          onContactLoadedRef.current?.(null)
        }
      })

    client.couponsAPI
      .listContactCouponsAPI({ workspaceId, contactId })
      .then((data) => !ignore && setCoupons(data))
      .catch(() => !ignore && setCoupons([]))

    client.appointmentsAPI
      .listContactAppointmentsAPI({ workspaceId, contactId })
      .then((data) => !ignore && setAppointments(data))
      .catch(() => !ignore && setAppointments([]))

    loadLeadMagnets(contactId)
    return () => {
      ignore = true
    }
  }, [contactId, workspaceId, loadLeadMagnets])

  // The bot (flow step, trigger, API) changed this contact's tags: refresh
  // the tag list and received lead magnets without reopening the chat.
  // Only signals newer than the last handled one count, so switching chats
  // does not replay an old signal.
  const handledTagsChangeSeqRef = useRef(contactTagsChange?.seq ?? 0)
  useEffect(() => {
    if (
      !contactTagsChange ||
      contactTagsChange.seq === handledTagsChangeSeqRef.current
    ) {
      return
    }
    handledTagsChangeSeqRef.current = contactTagsChange.seq
    if (!contactId || contactTagsChange.contactId !== contactId) {
      return
    }
    markLocalEdit()
    loadLeadMagnets(contactId)
    client.contactsAPIs
      .getContactAuthenticatedAPI({ workspaceId, contactId })
      .then((data) => {
        setContactData((current) =>
          current?.id === contactId ? { ...current, tags: data.tags } : current,
        )
      })
      .catch(() => {
        // Keep the current tags; the next open refetches them.
      })
  }, [
    contactTagsChange,
    contactId,
    workspaceId,
    loadLeadMagnets,
    markLocalEdit,
  ])

  const accordionModules: AccordionModule[] = useMemo(() => {
    if (!contactData) {
      return []
    }

    return [
      {
        keyName: t("coupons.title"),
        content: (
          <div className="grid gap-2 px-2 text-sm">
            {coupons.length > 0 ? (
              coupons.map((coupon) => (
                <div className="rounded-md border p-2" key={coupon.id}>
                  <div className="font-medium">{coupon.topicName}</div>
                  <div className="font-mono">{coupon.code}</div>
                  <div className="text-muted-foreground">
                    {coupon.usedAt
                      ? t("coupons.usageStatuses.used")
                      : t("coupons.usageStatuses.notUsed")}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-muted-foreground">
                {t("coupons.messages.empty")}
              </div>
            )}
          </div>
        ),
      },
      {
        keyName: t("appointments.title"),
        content: <ContactAppointmentsList appointments={appointments} />,
      },
      {
        keyName: t("fields.tags.label"),
        content: (
          <UpdateContactTagField
            contact={contactData}
            onSuccess={(updatedTags: TagResource[]) => {
              markLocalEdit()
              setContactData({ ...contactData, tags: updatedTags })
              loadLeadMagnets(contactData.id)
            }}
            tags={contactData.tags}
            workspaceId={workspaceId}
          />
        ),
      },
      {
        keyName: t("sequences.title"),
        content: (
          <SequenceStoreProvider
            autoInitialize={true}
            workspaceId={workspaceId}
          >
            <UpdateContactSequenceField
              contact={contactData}
              onSuccess={(updatedSequences) => {
                markLocalEdit()
                setContactData({
                  ...contactData,
                  contactsOnSequences:
                    updatedSequences as ContactOnSequenceWithRelations[],
                })
              }}
              sequences={
                contactData.contactsOnSequences as ContactOnSequenceWithRelations[]
              }
            />
          </SequenceStoreProvider>
        ),
      },
    ]
  }, [
    contactData,
    workspaceId,
    t,
    coupons,
    appointments,
    loadLeadMagnets,
    markLocalEdit,
  ])

  if (!contactId) {
    return null
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <ContactDetail
        baseContact={baseContact}
        contact={contactData}
        contactInbox={contactInbox}
        onEdited={markLocalEdit}
      />

      {contactData ? (
        <CurrentStepBlock
          step={contactData.currentFlowStep}
          workspaceId={workspaceId}
        />
      ) : null}

      <ContactLeadMagnets leadMagnets={receivedLeadMagnets} />

      <ContactNotesManage
        contactId={contactData?.id ?? null}
        contactNotes={contactData?.contactNotes ?? []}
      />

      <ContactActivityFeed contactId={contactId} workspaceId={workspaceId} />

      <Accordion className="w-full">
        {accordionModules.map((module, index) => (
          <AccordionItem
            className="transition-all hover:data-[state=open]:rounded-none"
            key={module.keyName}
            value={module.keyName}
          >
            <AccordionTrigger
              className={`rounded-none p-2 transition-all ${index === 0 ? "border-t" : ""}`}
            >
              <div className="flex items-center gap-2">{module.keyName}</div>
            </AccordionTrigger>
            <AccordionContent>{module.content}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}

/** The contact card of the inbox's active chat. */
export const ContactInboxPanel = ({
  workspaceId,
  activeConversationId,
}: {
  workspaceId: string
  activeConversationId: string | null
}) => {
  const { conversations, contactTagsChange } = useChatStore((state) => state)
  const conversation = useMemo(
    () =>
      activeConversationId
        ? (conversations.find((c) => c.id === activeConversationId) ?? null)
        : null,
    [conversations, activeConversationId],
  )

  return (
    <ContactPanel
      baseContact={conversation?.contact ?? null}
      contactId={conversation?.contact?.id ?? null}
      contactInbox={conversation?.contactInboxes[0] ?? null}
      contactTagsChange={contactTagsChange}
      workspaceId={workspaceId}
    />
  )
}

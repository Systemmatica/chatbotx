import {
  type ContactActivityPayload,
  type ContactActivityType,
  type TriggerEventType,
  triggerEventTypes,
} from "@chatbotx.io/database/partials"
import {
  type ContactActivityActor,
  contactActivityRepository,
} from "@chatbotx.io/database/repositories"
import { BaseEventEmitter } from "../base-emitter"
import { getActivityActor } from "./context"

type EventData = {
  workspaceId: string
  contactId: string
  metadata?: Record<string, unknown>
}

const SUPPORTED_EVENT_TYPES: ReadonlySet<TriggerEventType> = new Set([
  triggerEventTypes.enum.tagApplied,
  triggerEventTypes.enum.tagRemoved,
  triggerEventTypes.enum.customFieldValueChanged,
  triggerEventTypes.enum.conversationAssigned,
  triggerEventTypes.enum.conversationUnassigned,
  triggerEventTypes.enum.archived,
])

const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 ? value : undefined

/** The explicit "done by" user of an event wins over the request context. */
const resolveActor = (byUserId: string | undefined): ContactActivityActor =>
  byUserId ? { type: "user", userId: byUserId } : getActivityActor()

/**
 * Maps a domain event onto a contact activity row. Exported for tests; tag
 * events are handled separately because they need the dedup guard.
 */
export function toContactActivity(
  eventType: TriggerEventType,
  metadata: Record<string, unknown>,
): {
  type: ContactActivityType
  payload: ContactActivityPayload
  byUserId?: string
} | null {
  switch (eventType) {
    case triggerEventTypes.enum.customFieldValueChanged:
      return {
        type: "customFieldChanged",
        payload: {
          customFieldId: asString(metadata.customFieldId),
          customFieldName: asString(metadata.customFieldName),
          oldValue: metadata.oldValue ?? null,
          newValue: metadata.newValue ?? null,
        },
      }
    case triggerEventTypes.enum.conversationAssigned:
      return {
        type: "assignmentChanged",
        payload: {
          conversationId: asString(metadata.conversationId),
          assignedTo: asString(metadata.assignedTo) ?? null,
        },
        byUserId: asString(metadata.assignedBy),
      }
    case triggerEventTypes.enum.conversationUnassigned:
      return {
        type: "assignmentChanged",
        payload: {
          conversationId: asString(metadata.conversationId),
          assignedTo: null,
        },
        byUserId: asString(metadata.unassignedBy),
      }
    case triggerEventTypes.enum.archived:
      return {
        type: "conversationClosed",
        payload: { conversationId: asString(metadata.conversationId) },
        byUserId: asString(metadata.archivedBy),
      }
    default:
      return null
  }
}

/**
 * Writes the contact activity log from the same domain events that feed
 * triggers and webhooks, so every code path that already emits them (builder
 * actions, flow steps, business services) is covered in one place. Runs in
 * the worker too (unlike the trigger emitter): bot changes are history as
 * well. Failures are isolated by the dispatcher (`allSettled` + log), so the
 * log can never fail the change itself.
 */
class ActivityEventEmitterImpl extends BaseEventEmitter {
  protected supportedEventTypes = SUPPORTED_EVENT_TYPES

  protected shouldEmitEvent(): Promise<boolean> {
    return Promise.resolve(true)
  }

  protected async emitToQueue(
    eventType: TriggerEventType,
    data: EventData,
  ): Promise<void> {
    const metadata = data.metadata ?? {}

    if (
      eventType === triggerEventTypes.enum.tagApplied ||
      eventType === triggerEventTypes.enum.tagRemoved
    ) {
      const tagId = asString(metadata.tagId)
      if (!tagId) {
        return
      }
      await contactActivityRepository.recordTagEvent({
        workspaceId: data.workspaceId,
        contactId: data.contactId,
        tagId,
        type:
          eventType === triggerEventTypes.enum.tagApplied
            ? "tagAdded"
            : "tagRemoved",
        actor: getActivityActor(),
      })
      return
    }

    const activity = toContactActivity(eventType, metadata)
    if (!activity) {
      return
    }
    await contactActivityRepository.record({
      workspaceId: data.workspaceId,
      contactId: data.contactId,
      type: activity.type,
      payload: activity.payload,
      actor: resolveActor(activity.byUserId),
    })
  }
}

export const ActivityEventEmitter = new ActivityEventEmitterImpl()

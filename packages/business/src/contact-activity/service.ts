import {
  and,
  asc,
  db,
  desc,
  eq,
  inArray,
  isNotNull,
  sql,
} from "@chatbotx.io/database/client"
import type {
  ContactActivityPayload,
  ContactActivityType,
} from "@chatbotx.io/database/partials"
import {
  type ContactActivityActor,
  contactActivityRepository,
} from "@chatbotx.io/database/repositories"
import {
  contactInboxModel,
  contactNoteModel,
  contactsToTagsModel,
  inboxModel,
  inboxTeamModel,
  leadMagnetModel,
  tagModel,
  userModel,
} from "@chatbotx.io/database/schema"
import type { ContactActivityModel } from "@chatbotx.io/database/types"
import { mentionsToPlainText } from "@chatbotx.io/utils/mentions"
import { BaseService } from "../base.service"
import type { ContactAccessScope } from "../contact"
import { contactService } from "../contact/service"
import { currentFlowStepService } from "../flow/current-step"
import { logger } from "../logger"
import { truncateText } from "../staff-notification/format"
import {
  type ContactActivityFeedActor,
  type ContactActivityFeedItem,
  type ContactActivityFeedPage,
  cursorToTableBefore,
  decodeFeedCursor,
  formatActivityValue,
  mergeFeedPage,
  tableEventKey,
} from "./feed"

export const CONTACT_ACTIVITY_PAGE_SIZE = 20
export const CONTACT_ACTIVITY_MAX_PAGE_SIZE = 50
/** Derived sources are per contact; cap them so a pathological contact stays cheap. */
const DERIVED_SOURCE_LIMIT = 500
const NOTE_PREVIEW_CHARS = 140
/**
 * A current tag link whose add was also logged in `ContactActivity` within
 * this window is shown once (the logged event carries the actor).
 */
const tagLogMatchWindow = () => sql`interval '5 minutes'`

type ResolvedNames = {
  users: Map<string, string | null>
  teams: Map<string, string>
  tags: Map<string, { name: string; leadMagnetName: string | null }>
}

class ContactActivityService extends BaseService {
  // ─── Writes (best-effort) ────────────────────────────────────────────────

  /** Never throws: losing a history row must not fail the change itself. */
  async record(input: {
    workspaceId: string
    contactId: string
    type: ContactActivityType
    actor: ContactActivityActor
    payload?: ContactActivityPayload
  }): Promise<void> {
    try {
      await contactActivityRepository.record(input)
    } catch (error) {
      logger.warn(
        {
          err: error,
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          type: input.type,
        },
        "[contact-activity] failed to record activity; ignoring",
      )
    }
  }

  /** Tag changes made outside the event emitters (e.g. trigger actions). */
  async recordTagEvents(input: {
    workspaceId: string
    contactId: string
    tagIds: readonly string[]
    type: "tagAdded" | "tagRemoved"
    actor: ContactActivityActor
  }): Promise<void> {
    for (const tagId of new Set(input.tagIds)) {
      try {
        await contactActivityRepository.recordTagEvent({
          workspaceId: input.workspaceId,
          contactId: input.contactId,
          tagId,
          type: input.type,
          actor: input.actor,
        })
      } catch (error) {
        logger.warn(
          {
            err: error,
            workspaceId: input.workspaceId,
            contactId: input.contactId,
            tagId,
          },
          "[contact-activity] failed to record tag activity; ignoring",
        )
      }
    }
  }

  // ─── Feed ────────────────────────────────────────────────────────────────

  /**
   * One page of the contact's history, newest first. Throws not-found when the
   * contact is outside the workspace or the caller's access scope.
   */
  async listFeed(input: {
    workspaceId: string
    contactId: string
    accessScope?: ContactAccessScope
    cursor?: string | null
    limit?: number
  }): Promise<ContactActivityFeedPage> {
    const { workspaceId } = input
    const contact = await contactService.findByIdOrFail({
      workspaceId,
      id: input.contactId,
      accessScope: input.accessScope,
    })
    const limit = Math.min(
      Math.max(1, input.limit ?? CONTACT_ACTIVITY_PAGE_SIZE),
      CONTACT_ACTIVITY_MAX_PAGE_SIZE,
    )
    const cursor = decodeFeedCursor(input.cursor)

    const [rows, derived] = await Promise.all([
      contactActivityRepository.listByContact({
        workspaceId,
        contactId: contact.id,
        before: cursorToTableBefore(cursor),
        limit: limit + 1,
      }),
      this.loadDerivedEvents({
        workspaceId,
        contactId: contact.id,
        contactCreatedAt: contact.createdAt,
      }),
    ])

    const table = await this.toTableItems(workspaceId, rows)
    return mergeFeedPage({ derived, table, cursor, limit })
  }

  private async loadDerivedEvents(props: {
    workspaceId: string
    contactId: string
    contactCreatedAt: Date
  }): Promise<ContactActivityFeedItem[]> {
    const { workspaceId, contactId } = props

    const [inboxes, tags, notes, step] = await Promise.all([
      db
        .select({
          id: contactInboxModel.id,
          createdAt: contactInboxModel.createdAt,
          channel: contactInboxModel.channel,
          source: contactInboxModel.source,
          inboxName: inboxModel.name,
        })
        .from(contactInboxModel)
        .leftJoin(inboxModel, eq(inboxModel.id, contactInboxModel.inboxId))
        .where(eq(contactInboxModel.contactId, contactId))
        .orderBy(asc(contactInboxModel.createdAt), asc(contactInboxModel.id))
        .limit(DERIVED_SOURCE_LIMIT),
      db
        .select({
          tagId: contactsToTagsModel.tagId,
          createdAt: contactsToTagsModel.createdAt,
          tagName: tagModel.name,
          leadMagnetName: leadMagnetModel.name,
        })
        .from(contactsToTagsModel)
        .innerJoin(
          tagModel,
          and(
            eq(tagModel.id, contactsToTagsModel.tagId),
            eq(tagModel.workspaceId, workspaceId),
          ),
        )
        .leftJoin(
          leadMagnetModel,
          and(
            eq(leadMagnetModel.tagId, tagModel.id),
            eq(leadMagnetModel.workspaceId, workspaceId),
          ),
        )
        .where(
          and(
            eq(contactsToTagsModel.contactId, contactId),
            isNotNull(contactsToTagsModel.createdAt),
            sql`NOT EXISTS (
              SELECT 1 FROM "ContactActivity" a
              WHERE a."contactId" = ${contactsToTagsModel.contactId}
                AND a."type" = 'tagAdded'
                AND a."payload"->>'tagId' = ${contactsToTagsModel.tagId}::text
                AND a."createdAt" BETWEEN ${contactsToTagsModel.createdAt} - ${tagLogMatchWindow()}
                  AND ${contactsToTagsModel.createdAt} + ${tagLogMatchWindow()}
            )`,
          ),
        )
        .orderBy(desc(contactsToTagsModel.createdAt))
        .limit(DERIVED_SOURCE_LIMIT),
      db
        .select({
          id: contactNoteModel.id,
          createdAt: contactNoteModel.createdAt,
          text: contactNoteModel.text,
          createdById: contactNoteModel.createdById,
          authorName: userModel.name,
        })
        .from(contactNoteModel)
        .leftJoin(userModel, eq(userModel.id, contactNoteModel.createdById))
        .where(eq(contactNoteModel.contactId, contactId))
        .orderBy(desc(contactNoteModel.createdAt))
        .limit(DERIVED_SOURCE_LIMIT),
      currentFlowStepService.resolveForContact({ workspaceId, contactId }),
    ])

    const items: ContactActivityFeedItem[] = []
    const [firstInbox, ...laterInboxes] = inboxes

    items.push({
      id: `contact:${contactId}`,
      type: "contactCreated",
      occurredAt: new Date(props.contactCreatedAt),
      actor: null,
      details: {
        channel: firstInbox?.channel ?? null,
        source: firstInbox?.source ?? null,
        inboxName: firstInbox?.inboxName ?? null,
      },
    })
    for (const inbox of laterInboxes) {
      items.push({
        id: `inbox:${inbox.id}`,
        type: "channelConnected",
        occurredAt: new Date(inbox.createdAt),
        actor: null,
        details: {
          channel: inbox.channel,
          source: inbox.source,
          inboxName: inbox.inboxName,
        },
      })
    }

    for (const tag of tags) {
      if (!tag.createdAt) {
        continue
      }
      items.push({
        id: `tag:${tag.tagId}`,
        type: tag.leadMagnetName ? "leadMagnetReceived" : "tagAdded",
        occurredAt: new Date(tag.createdAt),
        actor: null,
        details: {
          tagName: tag.tagName,
          leadMagnetName: tag.leadMagnetName,
        },
      })
    }

    for (const note of notes) {
      items.push({
        id: `note:${note.id}`,
        type: "noteAdded",
        occurredAt: new Date(note.createdAt),
        actor: note.createdById
          ? { type: "user", userId: note.createdById, name: note.authorName }
          : null,
        details: {
          notePreview: truncateText(
            mentionsToPlainText(note.text),
            NOTE_PREVIEW_CHARS,
          ),
        },
      })
    }

    if (step) {
      items.push({
        id: `step:${step.flowId}:${step.nodeId}`,
        type: "stepReached",
        occurredAt: new Date(step.reachedAt),
        actor: null,
        details: {
          flowId: step.flowId,
          flowName: step.flowName,
          nodeType: step.nodeType,
          nodeName: step.nodeName,
          nodePreview: step.nodePreview,
        },
      })
    }

    return items
  }

  private async toTableItems(
    workspaceId: string,
    rows: readonly ContactActivityModel[],
  ): Promise<ContactActivityFeedItem[]> {
    if (rows.length === 0) {
      return []
    }
    const [names, flowSteps] = await Promise.all([
      this.resolveNames(workspaceId, rows),
      currentFlowStepService.resolveMany({
        workspaceId,
        refs: rows.map((row) =>
          row.type === "flowStarted" && row.payload.flowId
            ? {
                currentFlowId: row.payload.flowId,
                currentNodeId: row.payload.nodeId ?? "",
                currentNodeAt: row.createdAt,
              }
            : null,
        ),
      }),
    ])

    return rows.map((row, index) => {
      const payload = row.payload ?? {}
      const actor: ContactActivityFeedActor = {
        type: row.actorType,
        userId: row.actorUserId,
        name: row.actorUserId
          ? (names.users.get(row.actorUserId) ?? null)
          : null,
      }
      const base = {
        id: tableEventKey(row.id),
        occurredAt: new Date(row.createdAt),
        actor,
      }

      switch (row.type) {
        case "tagAdded":
        case "tagRemoved": {
          const tag = payload.tagId ? names.tags.get(payload.tagId) : undefined
          const isLeadMagnet = row.type === "tagAdded" && tag?.leadMagnetName
          return {
            ...base,
            type: isLeadMagnet ? "leadMagnetReceived" : row.type,
            details: {
              tagName: tag?.name ?? null,
              leadMagnetName: tag?.leadMagnetName ?? null,
            },
          }
        }
        case "customFieldChanged":
          return {
            ...base,
            type: row.type,
            details: {
              customFieldName: payload.customFieldName ?? null,
              oldValue: formatActivityValue(payload.oldValue),
              newValue: formatActivityValue(payload.newValue),
            },
          }
        case "flowStarted": {
          const step = flowSteps[index]
          return {
            ...base,
            type: row.type,
            details: {
              flowId: payload.flowId ?? null,
              flowName: step?.flowName ?? null,
              nodeType: step?.nodeType ?? null,
              nodeName: step?.nodeName ?? null,
              nodePreview: step?.nodePreview ?? null,
            },
          }
        }
        case "assignmentChanged": {
          const assignedTo = payload.assignedTo ?? null
          let assigneeKind: "user" | "team" | null = null
          let assigneeName: string | null = null
          if (assignedTo && names.users.has(assignedTo)) {
            assigneeKind = "user"
            assigneeName = names.users.get(assignedTo) ?? null
          } else if (assignedTo && names.teams.has(assignedTo)) {
            assigneeKind = "team"
            assigneeName = names.teams.get(assignedTo) ?? null
          } else if (assignedTo) {
            // Assignee deleted since: still an assignment, name unknown.
            assigneeKind = "user"
          }
          return {
            ...base,
            type: row.type,
            details: { assigneeName, assigneeKind },
          }
        }
        default:
          return { ...base, type: row.type, details: {} }
      }
    })
  }

  private async resolveNames(
    workspaceId: string,
    rows: readonly ContactActivityModel[],
  ): Promise<ResolvedNames> {
    const userIds = new Set<string>()
    const tagIds = new Set<string>()
    const assigneeIds = new Set<string>()
    for (const row of rows) {
      if (row.actorUserId) {
        userIds.add(row.actorUserId)
      }
      if (row.payload?.tagId) {
        tagIds.add(row.payload.tagId)
      }
      if (row.payload?.assignedTo) {
        assigneeIds.add(row.payload.assignedTo)
        userIds.add(row.payload.assignedTo)
      }
    }

    const [users, teams, tags] = await Promise.all([
      userIds.size > 0
        ? db
            .select({ id: userModel.id, name: userModel.name })
            .from(userModel)
            .where(inArray(userModel.id, [...userIds]))
        : [],
      assigneeIds.size > 0
        ? db
            .select({ id: inboxTeamModel.id, name: inboxTeamModel.name })
            .from(inboxTeamModel)
            .where(
              and(
                inArray(inboxTeamModel.id, [...assigneeIds]),
                eq(inboxTeamModel.workspaceId, workspaceId),
              ),
            )
        : [],
      tagIds.size > 0
        ? db
            .select({
              id: tagModel.id,
              name: tagModel.name,
              leadMagnetName: leadMagnetModel.name,
            })
            .from(tagModel)
            .leftJoin(
              leadMagnetModel,
              and(
                eq(leadMagnetModel.tagId, tagModel.id),
                eq(leadMagnetModel.workspaceId, workspaceId),
              ),
            )
            .where(
              and(
                inArray(tagModel.id, [...tagIds]),
                eq(tagModel.workspaceId, workspaceId),
              ),
            )
        : [],
    ])

    return {
      users: new Map(users.map((user) => [user.id, user.name])),
      teams: new Map(teams.map((team) => [team.id, team.name])),
      tags: new Map(
        tags.map((tag) => [
          tag.id,
          { name: tag.name, leadMagnetName: tag.leadMagnetName },
        ]),
      ),
    }
  }
}

export const contactActivityService = new ContactActivityService()

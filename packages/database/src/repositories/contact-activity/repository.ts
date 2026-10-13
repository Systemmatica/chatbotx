import { createId } from "@chatbotx.io/utils"
import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  lt,
  or,
  sql,
} from "../../client"
import type {
  ContactActivityActorType,
  ContactActivityPayload,
  ContactActivityType,
} from "../../partials/contact-activity"
import { contactActivityModel } from "../../schema"
import type { ContactActivityModel } from "../../types"

export type ContactActivityActor = {
  type: ContactActivityActorType
  /** Set for `user` actors. */
  userId?: string | null
}

export type RecordContactActivityInput = {
  workspaceId: string
  contactId: string
  type: ContactActivityType
  actor: ContactActivityActor
  payload?: ContactActivityPayload
  tx?: DatabaseClient
}

/** Position in the feed: rows strictly older than this are returned. */
export type ContactActivityBefore = {
  createdAt: Date
  /** Absent when the cursor points at a derived (non-table) event at `createdAt`. */
  id?: string
}

/**
 * A re-added tag whose link is older than this is a no-op re-add (the insert
 * hit `ON CONFLICT DO NOTHING`), not a new event. Built lazily (not at module
 * load) so test suites that mock the db client can still import this file.
 */
const freshTagLink = () => sql`interval '5 minutes'`

const actorUserId = (actor: ContactActivityActor): string | null =>
  actor.type === "user" ? (actor.userId ?? null) : null

class ContactActivityRepository {
  async record(input: RecordContactActivityInput): Promise<void> {
    const { tx = db } = input
    await tx.insert(contactActivityModel).values({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      type: input.type,
      actorType: input.actor.type,
      actorUserId: actorUserId(input.actor),
      payload: input.payload ?? {},
    })
  }

  /**
   * Records a tag event unless it repeats the contact's current state for the
   * tag. Tag emitters fire for every *attempted* attach/detach (including
   * re-adding a tag the contact already holds), so the guard lives here, in
   * one statement:
   * - added: skipped when the link existed before (older than a few minutes,
   *   or predating `ContactToTag.createdAt`) or the last event for the tag is
   *   already "added";
   * - removed: skipped while the link still exists or the last event for the
   *   tag is already "removed".
   */
  async recordTagEvent(input: {
    workspaceId: string
    contactId: string
    tagId: string
    type: "tagAdded" | "tagRemoved"
    actor: ContactActivityActor
    tx?: DatabaseClient
  }): Promise<boolean> {
    const { tx = db, workspaceId, contactId, tagId, type } = input

    const linkGuard =
      type === "tagAdded"
        ? sql`NOT EXISTS (
            SELECT 1 FROM "ContactToTag" ctt
            WHERE ctt."contactId" = ${contactId}::int8
              AND ctt."tagId" = ${tagId}::int8
              AND (ctt."createdAt" IS NULL OR ctt."createdAt" < now() - ${freshTagLink()})
          )`
        : sql`NOT EXISTS (
            SELECT 1 FROM "ContactToTag" ctt
            WHERE ctt."contactId" = ${contactId}::int8
              AND ctt."tagId" = ${tagId}::int8
          )`

    const result = await tx.execute(sql`
      INSERT INTO "ContactActivity"
        ("id", "workspaceId", "contactId", "type", "actorType", "actorUserId", "payload")
      SELECT
        ${createId()}::int8,
        ${workspaceId}::int8,
        ${contactId}::int8,
        ${type}::"contactActivityType",
        ${input.actor.type}::"contactActivityActorType",
        ${actorUserId(input.actor)}::int8,
        ${JSON.stringify({ tagId })}::jsonb
      WHERE ${linkGuard}
        AND COALESCE((
          SELECT a."type"::text FROM "ContactActivity" a
          WHERE a."contactId" = ${contactId}::int8
            AND a."type" IN ('tagAdded', 'tagRemoved')
            AND a."payload"->>'tagId' = ${tagId}
          ORDER BY a."createdAt" DESC, a."id" DESC
          LIMIT 1
        ), '') <> ${type}
    `)
    return (result.rowCount ?? 0) > 0
  }

  /** Newest first, scoped to the workspace. */
  async listByContact(input: {
    workspaceId: string
    contactId: string
    before?: ContactActivityBefore
    limit: number
    tx?: DatabaseClient
  }): Promise<ContactActivityModel[]> {
    const { tx = db, workspaceId, contactId, before, limit } = input

    let cursorFilter: ReturnType<typeof and> | undefined
    if (before?.id) {
      cursorFilter = or(
        lt(contactActivityModel.createdAt, before.createdAt),
        and(
          eq(contactActivityModel.createdAt, before.createdAt),
          lt(contactActivityModel.id, before.id),
        ),
      )
    } else if (before) {
      // Derived events sort before table rows at the same instant, so every
      // row at exactly `createdAt` is still ahead.
      cursorFilter = sql`${contactActivityModel.createdAt} <= ${before.createdAt.toISOString()}::timestamptz`
    }

    return await tx
      .select()
      .from(contactActivityModel)
      .where(
        and(
          eq(contactActivityModel.contactId, contactId),
          eq(contactActivityModel.workspaceId, workspaceId),
          cursorFilter,
        ),
      )
      .orderBy(
        desc(contactActivityModel.createdAt),
        desc(contactActivityModel.id),
      )
      .limit(limit)
  }
}

export const contactActivityRepository = new ContactActivityRepository()

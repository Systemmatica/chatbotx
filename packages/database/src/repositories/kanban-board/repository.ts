import { and, type DatabaseClient, db, eq, type SQL, sql } from "../../client"
import type { KanbanStage } from "../../partials/kanban"
import { kanbanBoardModel } from "../../schema"
import type { KanbanBoardModel } from "../../types"
import { likeContains } from "../../utils"

/**
 * Filters shared by the card and count queries. `stageNames` are the exact
 * custom field values that map to a column; any other value (or no value) is
 * the "no status" bucket, represented as `null`.
 */
export type KanbanCardsFilter = {
  workspaceId: string
  customFieldId: string
  stageNames: string[]
  tagId?: string | null
  search?: string | null
  /** Members limited to their assigned conversations only see those contacts. */
  restrictToAssignedUserId?: string
}

export type KanbanCardRow = {
  contactId: string
  fullName: string | null
  avatar: string | null
  /** Stage name the contact belongs to, or `null` for the "no status" column. */
  bucket: string | null
  channel: string | null
  lastMessageAt: Date | null
  conversationId: string | null
}

export type KanbanBucketCount = {
  bucket: string | null
  count: number
}

type RawCardRow = {
  contactId: string | number
  fullName: string | null
  avatar: string | null
  bucket: string | null
  channel: string | null
  lastMessageAt: Date | string | null
  conversationId: string | number | null
}

type RawCountRow = {
  bucket: string | null
  count: string | number
}

const toDate = (value: Date | string | null): Date | null => {
  if (value === null) {
    return null
  }
  return value instanceof Date ? value : new Date(value)
}

const bucketExpression = (stageNames: string[]): SQL => {
  if (stageNames.length === 0) {
    return sql`NULL::text`
  }
  const names = sql.join(
    stageNames.map((name) => sql`${name}`),
    sql`, `,
  )
  return sql`CASE WHEN ccf."value" IN (${names}) THEN ccf."value" ELSE NULL END`
}

const contactConditions = (filter: KanbanCardsFilter): SQL => {
  const conditions: SQL[] = [sql`c."workspaceId" = ${filter.workspaceId}`]

  if (filter.tagId) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM "ContactToTag" ctt WHERE ctt."contactId" = c."id" AND ctt."tagId" = ${filter.tagId})`,
    )
  }

  const search = filter.search?.trim()
  if (search) {
    const pattern = likeContains(search)
    conditions.push(
      sql`(c."firstName" ILIKE ${pattern} OR c."lastName" ILIKE ${pattern} OR c."fullName" ILIKE ${pattern})`,
    )
  }

  if (filter.restrictToAssignedUserId) {
    conditions.push(
      sql`EXISTS (SELECT 1 FROM "Conversation" cv WHERE cv."contactId" = c."id" AND cv."assignedUserId" = ${filter.restrictToAssignedUserId})`,
    )
  }

  return sql.join(conditions, sql` AND `)
}

class KanbanBoardRepository {
  async listByWorkspace(input: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<KanbanBoardModel[]> {
    const { workspaceId, tx = db } = input
    return await tx.query.kanbanBoardModel.findMany({
      where: { workspaceId },
      orderBy: { id: "asc" },
    })
  }

  async findById(input: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<KanbanBoardModel | undefined> {
    const { workspaceId, id, tx = db } = input
    return await tx.query.kanbanBoardModel.findFirst({
      where: { workspaceId, id },
    })
  }

  async insert(input: {
    workspaceId: string
    name: string
    customFieldId: string
    stages: KanbanStage[]
    tx?: DatabaseClient
  }): Promise<KanbanBoardModel> {
    const { tx = db, ...values } = input
    const [board] = await tx.insert(kanbanBoardModel).values(values).returning()
    return board
  }

  async update(input: {
    workspaceId: string
    id: string
    data: Partial<Pick<KanbanBoardModel, "name" | "customFieldId" | "stages">>
    tx?: DatabaseClient
  }): Promise<KanbanBoardModel | undefined> {
    const { workspaceId, id, data, tx = db } = input
    const [board] = await tx
      .update(kanbanBoardModel)
      .set(data)
      .where(
        and(
          eq(kanbanBoardModel.workspaceId, workspaceId),
          eq(kanbanBoardModel.id, id),
        ),
      )
      .returning()
    return board
  }

  async delete(input: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<boolean> {
    const { workspaceId, id, tx = db } = input
    const deleted = await tx
      .delete(kanbanBoardModel)
      .where(
        and(
          eq(kanbanBoardModel.workspaceId, workspaceId),
          eq(kanbanBoardModel.id, id),
        ),
      )
      .returning({ id: kanbanBoardModel.id })
    return deleted.length > 0
  }

  /**
   * Returns up to `limit` cards per bucket (skipping `offset`), ordered by the
   * most recent message first. When `onlyBucket` is set, only that bucket is
   * returned (`null` = the "no status" column) — used for "load more".
   */
  async listCards(
    input: KanbanCardsFilter & {
      limit: number
      offset: number
      onlyBucket?: { value: string | null }
      tx?: DatabaseClient
    },
  ): Promise<KanbanCardRow[]> {
    const { limit, offset, onlyBucket, tx = db } = input
    const bucket = bucketExpression(input.stageNames)
    const conditions = [contactConditions(input)]
    if (onlyBucket) {
      conditions.push(
        sql`(${bucket}) IS NOT DISTINCT FROM ${onlyBucket.value}::text`,
      )
    }

    const result = await tx.execute<RawCardRow>(sql`
      SELECT
        ranked."contactId",
        ranked."fullName",
        ranked."avatar",
        ranked."bucket",
        ranked."channel",
        ranked."lastMessageAt",
        conv."id" AS "conversationId"
      FROM (
        SELECT
          c."id" AS "contactId",
          c."fullName" AS "fullName",
          c."avatar" AS "avatar",
          ${bucket} AS "bucket",
          lm."channel" AS "channel",
          lm."lastMessageAt" AS "lastMessageAt",
          ROW_NUMBER() OVER (
            PARTITION BY ${bucket}
            ORDER BY lm."lastMessageAt" DESC NULLS LAST, c."id" DESC
          ) AS "rowNumber"
        FROM "Contact" c
        LEFT JOIN "ContactCustomField" ccf
          ON ccf."contactId" = c."id"
          AND ccf."customFieldId" = ${input.customFieldId}
        LEFT JOIN LATERAL (
          SELECT ci."channel", ci."lastMessageAt"
          FROM "ContactInbox" ci
          WHERE ci."contactId" = c."id"
          ORDER BY ci."lastMessageAt" DESC NULLS LAST
          LIMIT 1
        ) lm ON true
        WHERE ${sql.join(conditions, sql` AND `)}
      ) ranked
      LEFT JOIN LATERAL (
        SELECT cv."id"
        FROM "Conversation" cv
        WHERE cv."contactId" = ranked."contactId"
        ORDER BY (cv."sourceId" IS NULL) DESC, cv."lastActivityAt" DESC NULLS LAST
        LIMIT 1
      ) conv ON true
      WHERE ranked."rowNumber" > ${offset}
        AND ranked."rowNumber" <= ${offset + limit}
      ORDER BY ranked."bucket" NULLS FIRST, ranked."rowNumber"
    `)

    return result.rows.map((row) => ({
      contactId: String(row.contactId),
      fullName: row.fullName,
      avatar: row.avatar,
      bucket: row.bucket,
      channel: row.channel,
      lastMessageAt: toDate(row.lastMessageAt),
      conversationId:
        row.conversationId === null ? null : String(row.conversationId),
    }))
  }

  /** Number of contacts per bucket (`null` = the "no status" column). */
  async countCards(
    input: KanbanCardsFilter & { tx?: DatabaseClient },
  ): Promise<KanbanBucketCount[]> {
    const { tx = db } = input
    const bucket = bucketExpression(input.stageNames)

    const result = await tx.execute<RawCountRow>(sql`
      SELECT ${bucket} AS "bucket", COUNT(*) AS "count"
      FROM "Contact" c
      LEFT JOIN "ContactCustomField" ccf
        ON ccf."contactId" = c."id"
        AND ccf."customFieldId" = ${input.customFieldId}
      WHERE ${contactConditions(input)}
      GROUP BY 1
    `)

    return result.rows.map((row) => ({
      bucket: row.bucket,
      count: Number(row.count),
    }))
  }
}

export const kanbanBoardRepository = new KanbanBoardRepository()

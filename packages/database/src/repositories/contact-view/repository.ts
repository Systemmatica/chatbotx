import {
  and,
  asc,
  type DatabaseClient,
  db,
  eq,
  inArray,
  relationsWhereToSQL,
  type SQL,
  sql,
} from "../../client"
import type { ContactViewConfig } from "../../partials/contact-view"
import { contactModel, contactViewModel } from "../../schema"
import type { ContactViewModel } from "../../types"

/** Contacts per group of the contacts table (`key: null` = no value). */
export type ContactGroupCount = { key: string | null; count: number }

/**
 * Grouped count over the contacts matching `where` (the same relational
 * filter the list uses), in one query:
 * - `customField`: by the raw value of one custom field;
 * - `stage`: by Kanban stage name, mapped like the board does (blocked
 *   contacts go to the blocked stage, unknown values to `null`);
 * - `leadMagnet`: by lead magnet id; a contact counts in each lead magnet it
 *   received, contacts with none under `null`.
 */
export type ContactGroupCountQuery =
  | { kind: "customField"; customFieldId: string }
  | {
      kind: "stage"
      customFieldId: string
      stageNames: string[]
      blockedStageName?: string | null
    }
  | { kind: "leadMagnet" }

/** A free-text field can have a value per contact; headers need far fewer. */
const MAX_GROUPS = 1000

type RawGroupRow = { key: string | number | null; count: string | number }

class ContactViewRepository {
  async listByWorkspace(input: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<ContactViewModel[]> {
    const { workspaceId, tx = db } = input
    return await tx
      .select()
      .from(contactViewModel)
      .where(eq(contactViewModel.workspaceId, workspaceId))
      .orderBy(asc(contactViewModel.position), asc(contactViewModel.id))
  }

  async findById(input: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<ContactViewModel | undefined> {
    const { workspaceId, id, tx = db } = input
    const [view] = await tx
      .select()
      .from(contactViewModel)
      .where(
        and(
          eq(contactViewModel.workspaceId, workspaceId),
          eq(contactViewModel.id, id),
        ),
      )
      .limit(1)
    return view
  }

  async countByWorkspace(input: {
    workspaceId: string
    tx?: DatabaseClient
  }): Promise<{ count: number; maxPosition: number }> {
    const { workspaceId, tx = db } = input
    const [row] = await tx
      .select({
        count: sql<number>`COUNT(*)::int`,
        maxPosition: sql<number>`COALESCE(MAX(${contactViewModel.position}), -1)::int`,
      })
      .from(contactViewModel)
      .where(eq(contactViewModel.workspaceId, workspaceId))
    return { count: row?.count ?? 0, maxPosition: row?.maxPosition ?? -1 }
  }

  async insert(input: {
    workspaceId: string
    name: string
    position: number
    config: ContactViewConfig
    createdById?: string | null
    tx?: DatabaseClient
  }): Promise<ContactViewModel> {
    const { tx = db, ...values } = input
    const [view] = await tx.insert(contactViewModel).values(values).returning()
    return view
  }

  async update(input: {
    workspaceId: string
    id: string
    data: Partial<Pick<ContactViewModel, "name" | "config" | "position">>
    tx?: DatabaseClient
  }): Promise<ContactViewModel | undefined> {
    const { workspaceId, id, data, tx = db } = input
    const [view] = await tx
      .update(contactViewModel)
      .set({ ...data, updatedAt: new Date() })
      .where(
        and(
          eq(contactViewModel.workspaceId, workspaceId),
          eq(contactViewModel.id, id),
        ),
      )
      .returning()
    return view
  }

  async delete(input: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<boolean> {
    const { workspaceId, id, tx = db } = input
    const deleted = await tx
      .delete(contactViewModel)
      .where(
        and(
          eq(contactViewModel.workspaceId, workspaceId),
          eq(contactViewModel.id, id),
        ),
      )
      .returning({ id: contactViewModel.id })
    return deleted.length > 0
  }

  /**
   * Sets `position` to the index in `orderedIds` in one statement. Ids of
   * other workspaces are left alone by the workspace condition.
   */
  async reorder(input: {
    workspaceId: string
    orderedIds: string[]
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, orderedIds, tx = db } = input
    if (orderedIds.length === 0) {
      return
    }
    const cases = sql.join(
      orderedIds.map(
        (id, index) =>
          sql`WHEN ${contactViewModel.id} = ${id} THEN ${index}::int`,
      ),
      sql` `,
    )
    await tx
      .update(contactViewModel)
      .set({
        position: sql`CASE ${cases} ELSE ${contactViewModel.position} END`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(contactViewModel.workspaceId, workspaceId),
          inArray(contactViewModel.id, orderedIds),
        ),
      )
  }

  async countContactsByGroup(input: {
    workspaceId: string
    where: Record<string, unknown>
    group: ContactGroupCountQuery
    tx?: DatabaseClient
  }): Promise<ContactGroupCount[]> {
    const { workspaceId, where, group, tx = db } = input
    const filter = relationsWhereToSQL({
      client: tx,
      table: contactModel,
      tsName: "contactModel",
      where,
    })
    // The filter runs in a single-table subquery so its column references
    // cannot clash with the joined tables.
    const filtered = sql`(SELECT ${contactModel.id} AS "id", ${contactModel.blockedAt} AS "blockedAt" FROM ${contactModel} ${filter ? sql`WHERE ${filter}` : sql``}) c`

    let query: SQL
    if (group.kind === "leadMagnet") {
      const received = sql`SELECT ctt."contactId", lm."id" AS "leadMagnetId"
        FROM "ContactToTag" ctt
        JOIN "LeadMagnet" lm ON lm."tagId" = ctt."tagId" AND lm."workspaceId" = ${workspaceId}
        JOIN "Tag" tg ON tg."id" = lm."tagId" AND tg."deletedAt" IS NULL`
      query = sql`
        SELECT r."leadMagnetId"::text AS "key", COUNT(DISTINCT c."id") AS "count"
        FROM ${filtered}
        JOIN (${received}) r ON r."contactId" = c."id"
        GROUP BY 1
        UNION ALL
        SELECT NULL AS "key", COUNT(*) AS "count"
        FROM ${filtered}
        WHERE NOT EXISTS (SELECT 1 FROM (${received}) r WHERE r."contactId" = c."id")
      `
    } else {
      const value = sql`ccf."value"`
      let key: SQL = value
      if (group.kind === "stage") {
        const blocked = group.blockedStageName
          ? sql`WHEN c."blockedAt" IS NOT NULL THEN ${group.blockedStageName}::text `
          : sql``
        const names =
          group.stageNames.length > 0
            ? sql`WHEN ${value} IN (${sql.join(
                group.stageNames.map((name) => sql`${name}`),
                sql`, `,
              )}) THEN ${value} `
            : sql``
        key = sql`CASE ${blocked}${names}ELSE NULL END`
      }
      query = sql`
        SELECT ${key} AS "key", COUNT(*) AS "count"
        FROM ${filtered}
        LEFT JOIN "ContactCustomField" ccf
          ON ccf."contactId" = c."id"
          AND ccf."customFieldId" = ${group.customFieldId}
        GROUP BY 1
        ORDER BY 2 DESC
        LIMIT ${MAX_GROUPS}
      `
    }

    const result = await tx.execute<RawGroupRow>(query)
    return result.rows
      .map((row) => ({
        key: row.key === null ? null : String(row.key),
        count: Number(row.count),
      }))
      .filter((row) => row.count > 0)
  }
}

export const contactViewRepository = new ContactViewRepository()

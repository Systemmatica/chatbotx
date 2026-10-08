import {
  and,
  type DatabaseClient,
  db,
  desc,
  eq,
  isNull,
  type SQL,
  sql,
} from "../../client"
import type { LeadMagnetKind } from "../../partials/lead-magnet"
import { folderModel, leadMagnetModel, tagModel } from "../../schema"
import type { LeadMagnetModel } from "../../types"

export type LeadMagnetWithStats = LeadMagnetModel & {
  /** Name of the live tag, `null` when the tag was deleted. */
  tagName: string | null
  /** Contacts that hold the lead magnet's tag. */
  recipients: number
}

type LeadMagnetValues = {
  name: string
  kind: LeadMagnetKind
  url: string | null
  description: string | null
}

const recipientsExpression = (restrictToAssignedUserId?: string): SQL => {
  const assigned = restrictToAssignedUserId
    ? sql` AND EXISTS (SELECT 1 FROM "Conversation" cv WHERE cv."contactId" = ctt."contactId" AND cv."assignedUserId" = ${restrictToAssignedUserId})`
    : sql``
  return sql`(SELECT COUNT(*) FROM "ContactToTag" ctt WHERE ctt."tagId" = ${tagModel.id}${assigned})`
}

class LeadMagnetRepository {
  /**
   * Lead magnets with the number of contacts holding their tag. Members limited
   * to their assigned conversations only count those contacts.
   */
  async listWithStats(input: {
    workspaceId: string
    restrictToAssignedUserId?: string
    tx?: DatabaseClient
  }): Promise<LeadMagnetWithStats[]> {
    const { workspaceId, restrictToAssignedUserId, tx = db } = input
    return await tx
      .select({
        id: leadMagnetModel.id,
        createdAt: leadMagnetModel.createdAt,
        updatedAt: leadMagnetModel.updatedAt,
        name: leadMagnetModel.name,
        kind: leadMagnetModel.kind,
        url: leadMagnetModel.url,
        description: leadMagnetModel.description,
        tagId: leadMagnetModel.tagId,
        workspaceId: leadMagnetModel.workspaceId,
        tagName: tagModel.name,
        recipients: sql<number>`COALESCE(${recipientsExpression(
          restrictToAssignedUserId,
        )}, 0)`.mapWith(Number),
      })
      .from(leadMagnetModel)
      .leftJoin(
        tagModel,
        and(eq(tagModel.id, leadMagnetModel.tagId), isNull(tagModel.deletedAt)),
      )
      .where(eq(leadMagnetModel.workspaceId, workspaceId))
      .orderBy(desc(leadMagnetModel.createdAt), desc(leadMagnetModel.id))
  }

  async findById(input: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<LeadMagnetModel | undefined> {
    const { workspaceId, id, tx = db } = input
    return await tx.query.leadMagnetModel.findFirst({
      where: { workspaceId, id },
    })
  }

  async findByName(input: {
    workspaceId: string
    name: string
    tx?: DatabaseClient
  }): Promise<LeadMagnetModel | undefined> {
    const { workspaceId, name, tx = db } = input
    return await tx.query.leadMagnetModel.findFirst({
      where: { workspaceId, name },
    })
  }

  async insert(
    input: LeadMagnetValues & {
      workspaceId: string
      tagId: string
      tx?: DatabaseClient
    },
  ): Promise<LeadMagnetModel> {
    const { tx = db, ...values } = input
    const [leadMagnet] = await tx
      .insert(leadMagnetModel)
      .values(values)
      .returning()
    return leadMagnet
  }

  async update(input: {
    workspaceId: string
    id: string
    data: Partial<LeadMagnetValues & { tagId: string }>
    tx?: DatabaseClient
  }): Promise<LeadMagnetModel | undefined> {
    const { workspaceId, id, data, tx = db } = input
    const [leadMagnet] = await tx
      .update(leadMagnetModel)
      .set(data)
      .where(
        and(
          eq(leadMagnetModel.workspaceId, workspaceId),
          eq(leadMagnetModel.id, id),
        ),
      )
      .returning()
    return leadMagnet
  }

  async delete(input: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<boolean> {
    const { workspaceId, id, tx = db } = input
    const deleted = await tx
      .delete(leadMagnetModel)
      .where(
        and(
          eq(leadMagnetModel.workspaceId, workspaceId),
          eq(leadMagnetModel.id, id),
        ),
      )
      .returning({ id: leadMagnetModel.id })
    return deleted.length > 0
  }

  /** Root, non-trash tag folder with this name; created when missing. */
  async findOrCreateTagFolder(input: {
    workspaceId: string
    name: string
    tx?: DatabaseClient
  }): Promise<string> {
    const { workspaceId, name, tx = db } = input
    const existing = await tx.query.folderModel.findFirst({
      where: {
        workspaceId,
        name,
        folderType: "tag",
        parentId: { isNull: true as const },
        isTrash: false,
      },
      columns: { id: true },
      orderBy: { createdAt: "asc" },
    })
    if (existing) {
      return existing.id
    }
    const [folder] = await tx
      .insert(folderModel)
      .values({
        workspaceId,
        name,
        folderType: "tag",
        parentId: null,
        paths: [],
      })
      .returning({ id: folderModel.id })
    return folder.id
  }

  /**
   * Live tag with this name, created inside `folderId` when missing. An
   * existing tag outside any folder is moved into `folderId`.
   */
  async findOrCreateTag(input: {
    workspaceId: string
    name: string
    folderId: string | null
    tx?: DatabaseClient
  }): Promise<{ id: string; created: boolean }> {
    const { workspaceId, name, folderId, tx = db } = input
    const [inserted] = await tx
      .insert(tagModel)
      .values({ workspaceId, name, folderId })
      .onConflictDoNothing({
        target: [tagModel.workspaceId, tagModel.name],
        where: isNull(tagModel.deletedAt),
      })
      .returning({ id: tagModel.id })
    if (inserted) {
      return { id: inserted.id, created: true }
    }

    const existing = await this.findLiveTagByName({ workspaceId, name, tx })
    if (!existing) {
      throw new Error(`Failed to resolve tag "${name}"`)
    }
    if (folderId && !existing.folderId) {
      await tx
        .update(tagModel)
        .set({ folderId })
        .where(eq(tagModel.id, existing.id))
    }
    return { id: existing.id, created: false }
  }

  async findLiveTag(input: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<{ id: string; name: string } | undefined> {
    const { workspaceId, id, tx = db } = input
    return await tx.query.tagModel.findFirst({
      where: { workspaceId, id, deletedAt: { isNull: true as const } },
      columns: { id: true, name: true },
    })
  }

  async findLiveTagByName(input: {
    workspaceId: string
    name: string
    tx?: DatabaseClient
  }): Promise<
    { id: string; name: string; folderId: string | null } | undefined
  > {
    const { workspaceId, name, tx = db } = input
    return await tx.query.tagModel.findFirst({
      where: { workspaceId, name, deletedAt: { isNull: true as const } },
      columns: { id: true, name: true, folderId: true },
    })
  }

  async renameTag(input: {
    workspaceId: string
    id: string
    name: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { workspaceId, id, name, tx = db } = input
    await tx
      .update(tagModel)
      .set({ name })
      .where(and(eq(tagModel.workspaceId, workspaceId), eq(tagModel.id, id)))
  }
}

export const leadMagnetRepository = new LeadMagnetRepository()

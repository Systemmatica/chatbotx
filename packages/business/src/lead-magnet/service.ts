import {
  type DatabaseClient,
  db,
  isUniqueViolationError,
} from "@chatbotx.io/database/client"
import {
  LEAD_MAGNET_TAG_FOLDER_NAME,
  type LeadMagnetKind,
  leadMagnetTagName,
} from "@chatbotx.io/database/partials"
import {
  type LeadMagnetWithStats,
  leadMagnetRepository,
} from "@chatbotx.io/database/repositories"
import type { LeadMagnetModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import type { ContactAccessScope } from "../contact"
import { ChatbotXException, notFoundException } from "../errors"
import { tagSyncService } from "../tag/sync.service"

export type CreateLeadMagnetInput = {
  workspaceId: string
  name: string
  kind: LeadMagnetKind
  url?: string | null
  description?: string | null
}

export type UpdateLeadMagnetInput = {
  workspaceId: string
  id: string
  name?: string
  kind?: LeadMagnetKind
  url?: string | null
  description?: string | null
}

const nameTakenException = () =>
  new ChatbotXException(
    "A lead magnet with this name already exists",
    "leadMagnetNameTaken",
    409,
  )

const tagNameTakenException = () =>
  new ChatbotXException(
    "Another tag already uses this lead magnet name",
    "leadMagnetTagNameTaken",
    409,
  )

const emptyToNull = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

class LeadMagnetService extends BaseService {
  async list(input: {
    workspaceId: string
    accessScope?: ContactAccessScope
  }): Promise<LeadMagnetWithStats[]> {
    return await leadMagnetRepository.listWithStats({
      workspaceId: input.workspaceId,
      restrictToAssignedUserId: input.accessScope?.restrictToAssignedUserId,
    })
  }

  async findOrFail(input: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<LeadMagnetModel> {
    const leadMagnet = await leadMagnetRepository.findById(input)
    if (!leadMagnet) {
      throw notFoundException("Lead magnet not found")
    }
    return leadMagnet
  }

  /**
   * Creates the lead magnet together with its `ЛМ: <name>` tag (an existing
   * live tag with that name is reused) inside the "Лид-магниты" tag folder.
   */
  async create(input: CreateLeadMagnetInput): Promise<LeadMagnetModel> {
    const { workspaceId } = input
    const name = input.name.trim()
    await this.assertNameFree({ workspaceId, name })

    let createdTagId: string | undefined
    let leadMagnet: LeadMagnetModel
    try {
      leadMagnet = await db.transaction(async (tx) => {
        const tag = await this.resolveTag({ workspaceId, name, tx })
        createdTagId = tag.created ? tag.id : undefined
        return await leadMagnetRepository.insert({
          workspaceId,
          name,
          kind: input.kind,
          url: emptyToNull(input.url),
          description: emptyToNull(input.description),
          tagId: tag.id,
          tx,
        })
      })
    } catch (error) {
      // A concurrent create with the same name lost the race.
      if (isUniqueViolationError(error)) {
        throw nameTakenException()
      }
      throw error
    }

    await this.afterTagChange({ workspaceId, createdTagId })
    return leadMagnet
  }

  /**
   * Renaming also renames the live tag (contacts keep it). A tag deleted in
   * the meantime is re-created so the lead magnet is trackable again.
   */
  async update(input: UpdateLeadMagnetInput): Promise<LeadMagnetModel> {
    const { workspaceId, id } = input
    const current = await this.findOrFail({ workspaceId, id })
    const name = input.name?.trim()
    const renamed = name !== undefined && name !== current.name
    if (renamed) {
      await this.assertNameFree({ workspaceId, name, exceptId: id })
    }
    const targetName = renamed ? name : current.name

    let createdTagId: string | undefined
    let leadMagnet: LeadMagnetModel | undefined
    try {
      leadMagnet = await db.transaction(async (tx) => {
        const liveTag = current.tagId
          ? await leadMagnetRepository.findLiveTag({
              workspaceId,
              id: current.tagId,
              tx,
            })
          : undefined

        let tagId = liveTag?.id
        if (liveTag && renamed) {
          await this.renameTag({
            workspaceId,
            tagId: liveTag.id,
            name: leadMagnetTagName(targetName),
            tx,
          })
        }
        if (!liveTag) {
          const tag = await this.resolveTag({
            workspaceId,
            name: targetName,
            tx,
          })
          tagId = tag.id
          createdTagId = tag.created ? tag.id : undefined
        }

        return await leadMagnetRepository.update({
          workspaceId,
          id,
          data: {
            ...(renamed ? { name: targetName } : {}),
            ...(input.kind === undefined ? {} : { kind: input.kind }),
            ...(input.url === undefined ? {} : { url: emptyToNull(input.url) }),
            ...(input.description === undefined
              ? {}
              : { description: emptyToNull(input.description) }),
            ...(tagId && tagId !== current.tagId ? { tagId } : {}),
          },
          tx,
        })
      })
    } catch (error) {
      if (isUniqueViolationError(error)) {
        throw nameTakenException()
      }
      throw error
    }
    if (!leadMagnet) {
      throw notFoundException("Lead magnet not found")
    }

    await this.afterTagChange({
      workspaceId,
      createdTagId,
      tagsChanged: renamed,
    })
    return leadMagnet
  }

  /** The tag stays: contacts keep the record of what they received. */
  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const deleted = await leadMagnetRepository.delete(input)
    if (!deleted) {
      throw notFoundException("Lead magnet not found")
    }
  }

  private async assertNameFree(input: {
    workspaceId: string
    name: string
    exceptId?: string
  }): Promise<void> {
    const existing = await leadMagnetRepository.findByName({
      workspaceId: input.workspaceId,
      name: input.name,
    })
    if (existing && existing.id !== input.exceptId) {
      throw nameTakenException()
    }
  }

  private async resolveTag(input: {
    workspaceId: string
    name: string
    tx: DatabaseClient
  }): Promise<{ id: string; created: boolean }> {
    const { workspaceId, tx } = input
    const folderId = await leadMagnetRepository.findOrCreateTagFolder({
      workspaceId,
      name: LEAD_MAGNET_TAG_FOLDER_NAME,
      tx,
    })
    return await leadMagnetRepository.findOrCreateTag({
      workspaceId,
      name: leadMagnetTagName(input.name),
      folderId,
      tx,
    })
  }

  private async renameTag(input: {
    workspaceId: string
    tagId: string
    name: string
    tx: DatabaseClient
  }): Promise<void> {
    const { workspaceId, tagId, name, tx } = input
    const clash = await leadMagnetRepository.findLiveTagByName({
      workspaceId,
      name,
      tx,
    })
    if (clash && clash.id !== tagId) {
      throw tagNameTakenException()
    }
    await leadMagnetRepository.renameTag({ workspaceId, id: tagId, name, tx })
  }

  private async afterTagChange(input: {
    workspaceId: string
    createdTagId?: string
    tagsChanged?: boolean
  }): Promise<void> {
    const { workspaceId, createdTagId } = input
    if (createdTagId) {
      await tagSyncService.enqueueCreate({ workspaceId, tagId: createdTagId })
    }
    if (createdTagId || input.tagsChanged) {
      await this.invalidateCacheTags([
        `workspaces:${workspaceId}#tags`,
        `tags:${workspaceId}`,
      ])
    }
  }
}

export const leadMagnetService = new LeadMagnetService()

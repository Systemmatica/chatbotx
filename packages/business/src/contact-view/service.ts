import {
  CONTACT_VIEWS_PER_WORKSPACE_MAX,
  type ContactViewConfig,
  type ContactViewGroupBy,
  contactViewConfigSchema,
} from "@chatbotx.io/database/partials"
import {
  type ContactGroupCount,
  contactViewRepository,
  kanbanBoardRepository,
} from "@chatbotx.io/database/repositories"
import type { ContactViewModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { ChatbotXException, notFoundException } from "../errors"

export type CreateContactViewInput = {
  workspaceId: string
  name: string
  config: ContactViewConfig
  createdById?: string | null
}

export type UpdateContactViewInput = {
  workspaceId: string
  id: string
  name?: string
  config?: ContactViewConfig
}

const tooManyViewsException = () =>
  new ChatbotXException(
    `A workspace can have at most ${CONTACT_VIEWS_PER_WORKSPACE_MAX} contact views`,
    "contactViewLimitReached",
    400,
  )

/** Saved views of the contacts table, shared by the whole workspace. */
class ContactViewService extends BaseService {
  async list(input: { workspaceId: string }): Promise<ContactViewModel[]> {
    return await contactViewRepository.listByWorkspace(input)
  }

  async findOrFail(input: {
    workspaceId: string
    id: string
  }): Promise<ContactViewModel> {
    const view = await contactViewRepository.findById(input)
    if (!view) {
      throw notFoundException("Contact view not found")
    }
    return view
  }

  /** Appends the view as the last tab. */
  async create(input: CreateContactViewInput): Promise<ContactViewModel> {
    const config = contactViewConfigSchema.parse(input.config)
    const { count, maxPosition } = await contactViewRepository.countByWorkspace(
      { workspaceId: input.workspaceId },
    )
    if (count >= CONTACT_VIEWS_PER_WORKSPACE_MAX) {
      throw tooManyViewsException()
    }
    return await contactViewRepository.insert({
      workspaceId: input.workspaceId,
      name: input.name.trim(),
      position: maxPosition + 1,
      config,
      createdById: input.createdById ?? null,
    })
  }

  async update(input: UpdateContactViewInput): Promise<ContactViewModel> {
    const data: Partial<Pick<ContactViewModel, "name" | "config">> = {}
    if (input.name !== undefined) {
      data.name = input.name.trim()
    }
    if (input.config !== undefined) {
      data.config = contactViewConfigSchema.parse(input.config)
    }
    const view = await contactViewRepository.update({
      workspaceId: input.workspaceId,
      id: input.id,
      data,
    })
    if (!view) {
      throw notFoundException("Contact view not found")
    }
    return view
  }

  /** A copy of the view as the last tab, named `name`. */
  async duplicate(input: {
    workspaceId: string
    id: string
    name: string
    createdById?: string | null
  }): Promise<ContactViewModel> {
    const source = await this.findOrFail({
      workspaceId: input.workspaceId,
      id: input.id,
    })
    return await this.create({
      workspaceId: input.workspaceId,
      name: input.name,
      config: source.config,
      createdById: input.createdById,
    })
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const deleted = await contactViewRepository.delete(input)
    if (!deleted) {
      throw notFoundException("Contact view not found")
    }
  }

  /** Tabs follow `orderedIds`; returns the views in their new order. */
  async reorder(input: {
    workspaceId: string
    orderedIds: string[]
  }): Promise<ContactViewModel[]> {
    const orderedIds = [...new Set(input.orderedIds)]
    await contactViewRepository.reorder({
      workspaceId: input.workspaceId,
      orderedIds,
    })
    return await this.list({ workspaceId: input.workspaceId })
  }

  /**
   * Contacts per group over the whole filtered list (not just the shown
   * page), in one query. A stage grouping uses the board's status field and
   * stages; a board that no longer exists yields no groups.
   */
  async countGroups(input: {
    workspaceId: string
    where: Record<string, unknown>
    groupBy: ContactViewGroupBy
  }): Promise<ContactGroupCount[]> {
    const { workspaceId, where, groupBy } = input
    switch (groupBy.kind) {
      case "customField":
        return await contactViewRepository.countContactsByGroup({
          workspaceId,
          where,
          group: { kind: "customField", customFieldId: groupBy.customFieldId },
        })
      case "leadMagnet":
        return await contactViewRepository.countContactsByGroup({
          workspaceId,
          where,
          group: { kind: "leadMagnet" },
        })
      case "stage": {
        const board = await kanbanBoardRepository.findById({
          workspaceId,
          id: groupBy.boardId,
        })
        if (!board) {
          return []
        }
        return await contactViewRepository.countContactsByGroup({
          workspaceId,
          where,
          group: {
            kind: "stage",
            customFieldId: board.customFieldId,
            stageNames: board.stages.map((stage) => stage.name),
            blockedStageName:
              board.stages.find((stage) => stage.matchBlocked)?.name ?? null,
          },
        })
      }
      default: {
        const exhaustive: never = groupBy
        return exhaustive
      }
    }
  }
}

export const contactViewService = new ContactViewService()

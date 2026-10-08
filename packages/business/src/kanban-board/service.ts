import { type DatabaseClient, db } from "@chatbotx.io/database/client"
import {
  type KanbanStage,
  kanbanStagesSchema,
} from "@chatbotx.io/database/partials"
import { kanbanBoardRepository } from "@chatbotx.io/database/repositories"
import type { KanbanBoardModel } from "@chatbotx.io/database/types"
import { BaseService } from "../base.service"
import { type ContactAccessScope, contactService } from "../contact"
import { contactCustomFieldService } from "../contact-custom-field"
import { customFieldService } from "../custom-field"
import { ChatbotXException, notFoundException } from "../errors"
import { currentFlowStepService } from "../flow/current-step"
import { flowService } from "../flow/service"
import {
  buildKanbanColumns,
  type KanbanColumn,
  resolveKanbanStageValue,
} from "./grouping"

/** The status field of a board must be a plain single-line text field. */
const KANBAN_FIELD_TYPE = "shortText" as const

export const KANBAN_DEFAULT_CARDS_PER_COLUMN = 50
export const KANBAN_MAX_CARDS_PER_COLUMN = 200

export type CreateKanbanBoardInput = {
  workspaceId: string
  name: string
  stages: KanbanStage[]
  /** An existing `shortText` field to use as the status... */
  customFieldId?: string | null
  /** ...or the name of a `shortText` field to find or create. */
  newCustomFieldName?: string | null
  /** The flow whose funnel this board shows. */
  flowId?: string | null
}

/** Stage of a contact on the board of the flow they are in (inbox label). */
export type ContactFlowStage = {
  boardId: string
  stageId: string
  name: string
  color: string | null
  outcome: KanbanStage["outcome"]
}

export type UpdateKanbanBoardInput = {
  workspaceId: string
  id: string
  name?: string
  stages?: KanbanStage[]
  customFieldId?: string
}

export type GetKanbanBoardCardsInput = {
  workspaceId: string
  boardId: string
  tagId?: string | null
  search?: string | null
  perColumn?: number | null
  /** Load more of a single column (stage id or the "no status" id). */
  stageId?: string | null
  offset?: number | null
  accessScope?: ContactAccessScope
}

export type KanbanBoardCards = {
  board: KanbanBoardModel
  columns: KanbanColumn[]
}

class KanbanBoardService extends BaseService {
  async list(input: {
    workspaceId: string
    flowId?: string | null
  }): Promise<KanbanBoardModel[]> {
    return await kanbanBoardRepository.listByWorkspace(input)
  }

  /**
   * For each `{ contactId, flowId }` ref, the stage the contact holds on the
   * first board of that flow (`null` when the flow has no board or the value
   * matches no stage). Two queries for the whole page.
   */
  async resolveFlowStages(input: {
    workspaceId: string
    refs: { contactId: string; flowId: string | null; blocked?: boolean }[]
  }): Promise<(ContactFlowStage | null)[]> {
    const flowIds = [
      ...new Set(input.refs.flatMap((ref) => (ref.flowId ? [ref.flowId] : []))),
    ]
    const boards = await kanbanBoardRepository.listByFlowIds({
      workspaceId: input.workspaceId,
      flowIds,
    })
    const boardByFlow = new Map<string, KanbanBoardModel>()
    for (const board of boards) {
      if (board.flowId && !boardByFlow.has(board.flowId)) {
        boardByFlow.set(board.flowId, board)
      }
    }
    if (boardByFlow.size === 0) {
      return input.refs.map(() => null)
    }

    const values = await kanbanBoardRepository.listStatusValues({
      customFieldIds: [
        ...new Set([...boardByFlow.values()].map((b) => b.customFieldId)),
      ],
      contactIds: [...new Set(input.refs.map((ref) => ref.contactId))],
    })
    const valueByKey = new Map(
      values.map((row) => [`${row.contactId}:${row.customFieldId}`, row.value]),
    )

    return input.refs.map((ref) => {
      const board = ref.flowId ? boardByFlow.get(ref.flowId) : undefined
      if (!board) {
        return null
      }
      const value = valueByKey.get(`${ref.contactId}:${board.customFieldId}`)
      const stage =
        (ref.blocked
          ? board.stages.find((candidate) => candidate.matchBlocked)
          : undefined) ??
        board.stages.find((candidate) => candidate.name === value)
      if (!stage) {
        return null
      }
      return {
        boardId: board.id,
        stageId: stage.id,
        name: stage.name,
        color: stage.color ?? null,
        outcome: stage.outcome ?? null,
      }
    })
  }

  async findOrFail(input: {
    workspaceId: string
    id: string
    tx?: DatabaseClient
  }): Promise<KanbanBoardModel> {
    const board = await kanbanBoardRepository.findById(input)
    if (!board) {
      throw notFoundException("Kanban board not found")
    }
    return board
  }

  async create(input: CreateKanbanBoardInput): Promise<KanbanBoardModel> {
    const stages = kanbanStagesSchema.parse(input.stages)
    const { customFieldId: existingFieldId } = input
    const newFieldName = input.newCustomFieldName?.trim()
    if (!(existingFieldId || newFieldName)) {
      throw new ChatbotXException(
        "Either a custom field or a new field name is required",
        "badRequest",
        400,
      )
    }

    if (input.flowId) {
      await this.assertFlow({
        workspaceId: input.workspaceId,
        flowId: input.flowId,
      })
    }

    let createdFieldId: string | undefined
    const board = await db.transaction(async (tx) => {
      const customFieldId = existingFieldId
        ? await this.assertStatusField({
            workspaceId: input.workspaceId,
            customFieldId: existingFieldId,
            tx,
          })
        : await this.resolveStatusFieldByName({
            workspaceId: input.workspaceId,
            name: newFieldName as string,
            tx,
          }).then((resolved) => {
            createdFieldId = resolved.created ? resolved.id : undefined
            return resolved.id
          })

      return await kanbanBoardRepository.insert({
        workspaceId: input.workspaceId,
        name: input.name.trim(),
        customFieldId,
        stages,
        flowId: input.flowId ?? null,
        tx,
      })
    })

    if (createdFieldId) {
      await customFieldService.invalidate({
        workspaceId: input.workspaceId,
        ids: [createdFieldId],
      })
    }
    return board
  }

  async update(input: UpdateKanbanBoardInput): Promise<KanbanBoardModel> {
    const { workspaceId, id } = input
    await this.findOrFail({ workspaceId, id })

    const data: Partial<
      Pick<KanbanBoardModel, "name" | "customFieldId" | "stages">
    > = {}
    if (input.name !== undefined) {
      data.name = input.name.trim()
    }
    if (input.stages !== undefined) {
      data.stages = kanbanStagesSchema.parse(input.stages)
    }
    if (input.customFieldId !== undefined) {
      data.customFieldId = await this.assertStatusField({
        workspaceId,
        customFieldId: input.customFieldId,
      })
    }

    const board = await kanbanBoardRepository.update({ workspaceId, id, data })
    if (!board) {
      throw notFoundException("Kanban board not found")
    }
    return board
  }

  async delete(input: { workspaceId: string; id: string }): Promise<void> {
    const deleted = await kanbanBoardRepository.delete(input)
    if (!deleted) {
      throw notFoundException("Kanban board not found")
    }
  }

  async getCards(input: GetKanbanBoardCardsInput): Promise<KanbanBoardCards> {
    const board = await this.findOrFail({
      workspaceId: input.workspaceId,
      id: input.boardId,
    })
    const perColumn = Math.min(
      Math.max(input.perColumn ?? KANBAN_DEFAULT_CARDS_PER_COLUMN, 1),
      KANBAN_MAX_CARDS_PER_COLUMN,
    )
    const filter = {
      workspaceId: input.workspaceId,
      customFieldId: board.customFieldId,
      stageNames: board.stages.map((stage) => stage.name),
      blockedStageName:
        board.stages.find((stage) => stage.matchBlocked)?.name ?? null,
      flowId: board.flowId,
      tagId: input.tagId,
      search: input.search,
      restrictToAssignedUserId: input.accessScope?.restrictToAssignedUserId,
    }

    const onlyBucket = input.stageId
      ? { value: this.resolveStageValueOrFail(board.stages, input.stageId) }
      : undefined

    const [cards, counts] = await Promise.all([
      kanbanBoardRepository.listCards({
        ...filter,
        limit: perColumn,
        offset: Math.max(input.offset ?? 0, 0),
        onlyBucket,
      }),
      kanbanBoardRepository.countCards(filter),
    ])

    // One batched lookup for the whole page (no per-card queries).
    const steps = await currentFlowStepService.resolveMany({
      workspaceId: input.workspaceId,
      refs: cards,
    })
    const cardsWithSteps = cards.map(
      ({ currentFlowId, currentNodeId, currentNodeAt, ...card }, index) => ({
        ...card,
        currentFlowStep: steps[index] ?? null,
      }),
    )

    const columns = buildKanbanColumns({
      stages: board.stages,
      cards: cardsWithSteps,
      counts,
    })
    return {
      board,
      columns: input.stageId
        ? columns.filter((column) => column.id === input.stageId)
        : columns,
    }
  }

  /**
   * Moves a contact to a stage by writing the board's custom field through the
   * regular contact custom field service, so `customFieldChanged` triggers and
   * webhooks fire exactly as for a manual field edit. Dropping on the "no
   * status" column clears the value.
   */
  async moveCard(input: {
    workspaceId: string
    boardId: string
    contactId: string
    stageId: string
    accessScope?: ContactAccessScope
  }): Promise<void> {
    const { workspaceId, contactId } = input
    const board = await this.findOrFail({ workspaceId, id: input.boardId })
    const value = this.resolveStageValueOrFail(board.stages, input.stageId)

    await contactService.findByIdOrFail({
      workspaceId,
      id: contactId,
      accessScope: input.accessScope,
    })

    if (value === null) {
      // deleteByKey emits `value -> null` and stays silent when nothing was set.
      await contactCustomFieldService.deleteByKey({
        workspaceId,
        contactId,
        keyword: board.customFieldId,
      })
      return
    }

    await contactCustomFieldService.setValues({
      workspaceId,
      contactId,
      fields: [{ customFieldId: board.customFieldId, value }],
    })
  }

  private resolveStageValueOrFail(
    stages: KanbanStage[],
    stageId: string,
  ): string | null {
    try {
      return resolveKanbanStageValue(stages, stageId)
    } catch {
      throw notFoundException("Kanban stage not found")
    }
  }

  private async assertFlow(input: {
    workspaceId: string
    flowId: string
  }): Promise<void> {
    const exists = await flowService.exists(input.workspaceId, input.flowId)
    if (!exists) {
      throw notFoundException("Flow not found")
    }
  }

  private async assertStatusField(input: {
    workspaceId: string
    customFieldId: string
    tx?: DatabaseClient
  }): Promise<string> {
    const { workspaceId, customFieldId, tx = db } = input
    const field = await tx.query.customFieldModel.findFirst({
      where: { workspaceId, id: customFieldId },
      columns: { id: true, type: true },
    })
    if (!field) {
      throw notFoundException("Custom field not found")
    }
    if (field.type !== KANBAN_FIELD_TYPE) {
      throw new ChatbotXException(
        "Kanban status field must be a short text custom field",
        "badRequest",
        400,
      )
    }
    return field.id
  }

  private async resolveStatusFieldByName(input: {
    workspaceId: string
    name: string
    tx: DatabaseClient
  }): Promise<{ id: string; created: boolean }> {
    const name = input.name.trim()
    const { idMap, createdIds } = await customFieldService.resolveByNameAndType(
      {
        workspaceId: input.workspaceId,
        fields: [{ name, type: KANBAN_FIELD_TYPE }],
        tx: input.tx,
      },
    )
    const id = [...idMap.values()][0]
    if (!id) {
      throw new ChatbotXException("Failed to resolve the Kanban status field")
    }
    return { id, created: createdIds.includes(id) }
  }
}

export const kanbanBoardService = new KanbanBoardService()

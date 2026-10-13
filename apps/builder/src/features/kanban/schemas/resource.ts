import {
  kanbanCardPropertySchema,
  kanbanStageOutcomes,
  kanbanStageSchema,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import { currentFlowStepResource } from "@/features/flow-steps/schemas/resource"

export const kanbanBoardResource = z.object({
  id: z.string(),
  name: z.string(),
  customFieldId: z.string(),
  flowId: z.string().nullable(),
  stages: z.array(kanbanStageSchema),
  /** `null` = the default card (see `resolveKanbanCardProperties`). */
  cardProperties: z.array(kanbanCardPropertySchema).nullish(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type KanbanBoardResource = z.infer<typeof kanbanBoardResource>

const namedItem = z.object({ id: z.string(), name: z.string() })

/** Data for the board's card properties; only the configured ones are set. */
export const kanbanCardPropertiesDataResource = z.object({
  customFields: z.record(z.string(), z.string()).optional(),
  tags: z.array(namedItem).optional(),
  leadMagnets: z.array(namedItem).optional(),
  phone: z.string().nullish(),
  lastMessage: z
    .object({
      text: z.string().nullable(),
      messageType: z.string(),
      attachmentCount: z.number(),
      createdAt: z.coerce.date(),
    })
    .nullish(),
  stageSince: z.coerce.date().nullish(),
})

export type KanbanCardPropertiesData = z.infer<
  typeof kanbanCardPropertiesDataResource
>

export const kanbanCardResource = z.object({
  contactId: z.string(),
  fullName: z.string().nullable(),
  avatar: z.string().nullable(),
  channel: z.string().nullable(),
  lastMessageAt: z.date().nullable(),
  conversationId: z.string().nullable(),
  currentFlowStep: currentFlowStepResource.nullable().optional(),
  properties: kanbanCardPropertiesDataResource.optional(),
})

export type KanbanCardResource = z.infer<typeof kanbanCardResource>

export const kanbanColumnResource = z.object({
  id: z.string(),
  name: z.string().nullable(),
  color: z.string().nullable(),
  outcome: kanbanStageOutcomes.nullable().optional(),
  matchBlocked: z.boolean().optional(),
  isNoStatus: z.boolean(),
  total: z.number(),
  cards: z.array(kanbanCardResource),
})

export type KanbanColumnResource = z.infer<typeof kanbanColumnResource>

export const listKanbanBoardsResponse = z.object({
  data: z.array(kanbanBoardResource),
})

export const getKanbanBoardCardsResponse = z.object({
  board: kanbanBoardResource,
  columns: z.array(kanbanColumnResource),
})

export type GetKanbanBoardCardsResponse = z.infer<
  typeof getKanbanBoardCardsResponse
>

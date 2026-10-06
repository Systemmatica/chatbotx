import { kanbanStageSchema } from "@chatbotx.io/database/partials"
import { z } from "zod"

export const kanbanBoardResource = z.object({
  id: z.string(),
  name: z.string(),
  customFieldId: z.string(),
  stages: z.array(kanbanStageSchema),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type KanbanBoardResource = z.infer<typeof kanbanBoardResource>

export const kanbanCardResource = z.object({
  contactId: z.string(),
  fullName: z.string().nullable(),
  avatar: z.string().nullable(),
  channel: z.string().nullable(),
  lastMessageAt: z.date().nullable(),
  conversationId: z.string().nullable(),
})

export type KanbanCardResource = z.infer<typeof kanbanCardResource>

export const kanbanColumnResource = z.object({
  id: z.string(),
  name: z.string().nullable(),
  color: z.string().nullable(),
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

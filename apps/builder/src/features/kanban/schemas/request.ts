import { kanbanStagesSchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

const boardName = z.string().trim().min(1).max(255)

export const kanbanBoardIdRequest = withWorkspaceIdSchema.and(
  z.object({ boardId: zodBigintAsString() }),
)

export const listKanbanBoardsRequest = withWorkspaceIdSchema.and(
  z.object({ flowId: zodBigintAsString().optional().nullable() }),
)

export const createKanbanBoardRequest = withWorkspaceIdSchema.and(
  z
    .object({
      name: boardName,
      flowId: zodBigintAsString().optional().nullable(),
      stages: kanbanStagesSchema,
      customFieldId: zodBigintAsString().optional().nullable(),
      newCustomFieldName: z
        .string()
        .trim()
        .min(1)
        .max(255)
        .optional()
        .nullable(),
    })
    .refine(
      (value) => Boolean(value.customFieldId || value.newCustomFieldName),
      {
        message: "Choose a custom field or enter a new field name",
        path: ["customFieldId"],
      },
    ),
)

export type CreateKanbanBoardRequest = z.infer<typeof createKanbanBoardRequest>

export const updateKanbanBoardRequest = kanbanBoardIdRequest.and(
  z.object({
    name: boardName.optional(),
    stages: kanbanStagesSchema.optional(),
    customFieldId: zodBigintAsString().optional(),
  }),
)

export const getKanbanBoardCardsRequest = kanbanBoardIdRequest.and(
  z.object({
    tagId: zodBigintAsString().optional().nullable(),
    search: z.string().trim().max(255).optional().nullable(),
    perColumn: z.coerce.number().int().min(1).max(200).optional().nullable(),
    stageId: z.string().min(1).max(64).optional().nullable(),
    offset: z.coerce.number().int().min(0).optional().nullable(),
  }),
)

export const moveKanbanCardRequest = kanbanBoardIdRequest.and(
  z.object({
    contactId: zodBigintAsString(),
    stageId: z.string().min(1).max(64),
  }),
)

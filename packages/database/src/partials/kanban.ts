import z from "zod"

/**
 * Id of the virtual first column of every Kanban board. It collects contacts
 * whose status field is empty or holds a value that matches no stage. It is
 * never persisted inside `KanbanBoard.stages`.
 */
export const KANBAN_NO_STATUS_STAGE_ID = "__no_status__"

export const KANBAN_MAX_STAGES = 50
export const KANBAN_STAGE_NAME_MAX_LENGTH = 100

const hexColorRegex = /^#[0-9a-fA-F]{6}$/

/**
 * A board column. `name` is the exact custom field value that places a contact
 * in this column, so renaming a stage does not move contacts by itself.
 */
export const kanbanStageSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .refine((id) => id !== KANBAN_NO_STATUS_STAGE_ID, {
      message: "Reserved stage id",
    }),
  name: z.string().trim().min(1).max(KANBAN_STAGE_NAME_MAX_LENGTH),
  color: z.string().regex(hexColorRegex).nullish(),
})

export type KanbanStage = z.infer<typeof kanbanStageSchema>

/**
 * Ordered list of stages. Ids must be unique (they are the drag targets) and
 * names must be unique (each name is the field value a column matches).
 */
export const kanbanStagesSchema = z
  .array(kanbanStageSchema)
  .min(1)
  .max(KANBAN_MAX_STAGES)
  .superRefine((stages, ctx) => {
    const seenIds = new Set<string>()
    const seenNames = new Set<string>()

    stages.forEach((stage, index) => {
      if (seenIds.has(stage.id)) {
        ctx.addIssue({
          code: "custom",
          message: "Stage ids must be unique",
          path: [index, "id"],
        })
      }
      seenIds.add(stage.id)

      if (seenNames.has(stage.name)) {
        ctx.addIssue({
          code: "custom",
          message: "Stage names must be unique",
          path: [index, "name"],
        })
      }
      seenNames.add(stage.name)
    })
  })

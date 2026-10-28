import {
  createSelectSchema,
  sequenceModel,
  sequenceStepModel,
} from "@chatbotx.io/database/schema"
import z from "zod"

export const sequenceResource = createSelectSchema(sequenceModel, {
  id: z.string(),
  workspaceId: z.string(),
  folderId: z.string().nullable(),
})
export type SequenceResource = typeof sequenceModel.$inferSelect

export const sequenceStepResource = createSelectSchema(sequenceStepModel, {
  id: z.string(),
  sequenceId: z.string(),
  flowId: z.string().nullable(),
})
export type SequenceStepResource = typeof sequenceStepModel.$inferSelect

export const sequenceWithStepsResource = sequenceResource.extend({
  steps: z.array(sequenceStepResource),
})

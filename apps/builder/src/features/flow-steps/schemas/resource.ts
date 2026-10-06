import { z } from "zod"

/**
 * The flow step a contact is on (last node the bot entered for them), as
 * resolved by `currentFlowStepService` from the published flow version.
 */
export const currentFlowStepResource = z.object({
  flowId: z.string(),
  flowName: z.string(),
  nodeId: z.string(),
  /** `null` when the node is no longer in the flow. */
  nodeType: z.string().nullable(),
  nodeName: z.string().nullable(),
  nodePreview: z.string().nullable(),
  reachedAt: z.coerce.date(),
})

export type CurrentFlowStepResource = z.infer<typeof currentFlowStepResource>

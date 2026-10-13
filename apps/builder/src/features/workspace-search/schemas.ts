import { SEARCH_QUERY_MAX_LENGTH } from "@chatbotx.io/business/workspace-search/matching"
import z from "zod"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"

export const searchWorkspaceRequest = withWorkspaceIdSchema.extend({
  query: z.string().max(SEARCH_QUERY_MAX_LENGTH * 2),
})

export const searchWorkspaceResponse = z.object({
  contacts: z.array(
    z.object({
      id: z.string(),
      name: z.string().nullable(),
      phoneNumber: z.string().nullable(),
      username: z.string().nullable(),
      avatar: z.string().nullable(),
      conversationId: z.string().nullable(),
    }),
  ),
  flows: z.array(z.object({ id: z.string(), name: z.string() })),
  flowNodes: z.array(
    z.object({
      flowId: z.string(),
      flowName: z.string(),
      nodeId: z.string(),
      nodeName: z.string(),
    }),
  ),
  leadMagnets: z.array(z.object({ id: z.string(), name: z.string() })),
})

export type SearchWorkspaceResponse = z.infer<typeof searchWorkspaceResponse>

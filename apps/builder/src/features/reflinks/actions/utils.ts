import { customFieldService, flowService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"

/**
 * A ref link starts a flow and may store its payload in a custom field; both
 * ids come from the request, so make sure they belong to the same workspace
 * before persisting them.
 */
export const assertReflinkTargetsInWorkspace = async (input: {
  workspaceId: string
  flowId?: string | null
  customFieldId?: string | null
}): Promise<void> => {
  if (input.flowId) {
    const exists = await flowService.exists(input.workspaceId, input.flowId)
    if (!exists) {
      throw notFoundException("Flow not found")
    }
  }

  if (input.customFieldId) {
    const customField = await customFieldService.findBy({
      where: { id: input.customFieldId, workspaceId: input.workspaceId },
    })
    if (!customField) {
      throw notFoundException("Custom field not found")
    }
  }
}

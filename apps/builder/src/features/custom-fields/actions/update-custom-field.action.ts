"use server"

import { customFieldService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateCustomFieldRequest,
  updateCustomFieldRequest,
} from "../schemas/action"

export const updateCustomFieldAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateCustomFieldRequest)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    await updateCustomField({ workspaceId, id }, parsedInput)
  })

/**
 * Delegates to the business service, which checks the folder, scopes the
 * field to the workspace, migrates values of renamed select options and
 * invalidates the custom-field and contact caches.
 */
export const updateCustomField = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: UpdateCustomFieldRequest,
) => await customFieldService.update(ctx, parsedInput)

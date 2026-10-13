"use server"

import { customFieldService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import { isDatabaseError } from "@chatbotx.io/database/client"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateCustomFieldRequest,
  createCustomFieldFormRequest,
  createCustomFieldRequest,
} from "../schemas/action"
import type { CustomFieldResource } from "../schemas/resource"

export const createCustomFieldAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createCustomFieldFormRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateCustomFieldRequest
    }) => {
      await createCustomField(workspaceId, parsedInput)
    },
  )

export const createCustomField = async (
  workspaceId: string,
  parsedInput: CreateCustomFieldRequest,
): Promise<CustomFieldResource> => {
  try {
    // The service checks the folder, stores options only for select types
    // and invalidates the workspace custom-field cache.
    return await customFieldService.create({ workspaceId, data: parsedInput })
  } catch (error) {
    // Folder / validation errors from the service keep their own message.
    if (!isDatabaseError(error)) {
      throw error
    }
    if (error.cause.code === "23505") {
      return returnValidationErrors(createCustomFieldRequest, {
        _errors: ["Validation Exception"],
        name: { _errors: ["Name is already taken"] },
      })
    }

    throw new ChatbotXException("Failed to create custom field")
  }
}

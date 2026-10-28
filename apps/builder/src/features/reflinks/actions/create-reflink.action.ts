"use server"

import { db, isUniqueViolationError } from "@chatbotx.io/database/client"
import { reflinkModel } from "@chatbotx.io/database/schema"
import { createId } from "@chatbotx.io/utils"
import { returnValidationErrors } from "next-safe-action"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type CreateReflinkRequest,
  createReflinkRequest,
} from "../schemas/action"
import { assertReflinkTargetsInWorkspace } from "./utils"

export const createReflinkAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(createReflinkRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: CreateReflinkRequest
    }) => await createReflink(workspaceId, parsedInput),
  )

export const createReflink = async (
  workspaceId: string,
  parsedInput: CreateReflinkRequest,
) => {
  await assertReflinkTargetsInWorkspace({ workspaceId, ...parsedInput })

  try {
    const [reflink] = await db
      .insert(reflinkModel)
      .values({
        id: createId(),
        workspaceId,
        type: "refLink",
        ...parsedInput,
      })
      .returning()

    return reflink
  } catch (error) {
    if (isUniqueViolationError(error)) {
      return returnValidationErrors(createReflinkRequest, {
        _errors: ["Validation Exception"],
        name: { _errors: ["Name is already taken"] },
      })
    }

    throw error
  }
}

"use server"

import { notFoundException } from "@chatbotx.io/business/errors"
import { db, eq, findOrFail } from "@chatbotx.io/database/client"
import { sequenceModel, sequenceStepModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import {
  type WorkspaceIdRequestParams,
  workspaceIdrequestParams,
} from "@/features/common/schemas"
import { recalculateAllContactsInSequence } from "@/features/contact-sequences/utils/calculate-next-run-at"
import { workspaceActionClient } from "@/lib/safe-action"

const deleteSequenceStepRequest = z.object({
  stepId: zodBigintAsString(),
  sequenceId: zodBigintAsString(),
})

type DeleteSequenceStepRequest = z.infer<typeof deleteSequenceStepRequest>

async function validateSequenceOwnership(
  sequenceId: string,
  workspaceId: string,
) {
  await findOrFail({
    table: sequenceModel,
    where: {
      id: sequenceId,
      workspaceId,
    },
    message: "Sequence not found",
  })
}

async function deleteStep(stepId: string, workspaceId: string) {
  const step = await db.query.sequenceStepModel.findFirst({
    where: {
      id: stepId,
    },
    with: {
      sequence: true,
    },
  })

  if (!step) {
    throw notFoundException("Step not found")
  }

  if (step.sequence.workspaceId !== workspaceId) {
    throw new Error("Unauthorized: Step does not belong to this workspace")
  }

  await db.delete(sequenceStepModel).where(eq(sequenceStepModel.id, stepId))
}

export const deleteSequenceStepAction = workspaceActionClient
  .bindArgsSchemas(workspaceIdrequestParams)
  .inputSchema(deleteSequenceStepRequest)
  .action(
    async ({
      bindArgsParsedInputs: [workspaceId],
      parsedInput,
    }: {
      bindArgsParsedInputs: WorkspaceIdRequestParams
      parsedInput: DeleteSequenceStepRequest
    }) => {
      await deleteSequenceStep(workspaceId, parsedInput)

      return { success: true }
    },
  )

export const deleteSequenceStep = async (
  workspaceId: string,
  { stepId, sequenceId }: DeleteSequenceStepRequest,
) => {
  await validateSequenceOwnership(sequenceId, workspaceId)
  await deleteStep(stepId, workspaceId)
  await recalculateAllContactsInSequence(sequenceId, workspaceId)
}

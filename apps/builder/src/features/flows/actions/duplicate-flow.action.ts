"use server"

import { flowService } from "@chatbotx.io/business"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

const FLOW_NAME_MAX = 255

const duplicateFlowSchema = z
  .object({
    // "<name> (copy)" can outgrow the column limit; trim instead of failing.
    name: z
      .string()
      .trim()
      .min(1)
      .transform((name) => name.slice(0, FLOW_NAME_MAX))
      .optional(),
  })
  .optional()

export const duplicateFlowAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(duplicateFlowSchema)
  .action(({ bindArgsParsedInputs: [workspaceId, id], parsedInput }) =>
    flowService.duplicate({ workspaceId, id, name: parsedInput?.name }),
  )

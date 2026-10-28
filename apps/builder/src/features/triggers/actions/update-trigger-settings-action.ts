"use server"

import { notFoundException } from "@chatbotx.io/business/errors"
import { db, eq } from "@chatbotx.io/database/client"
import { triggerModel } from "@chatbotx.io/database/schema"
import { updateTriggerCache } from "@chatbotx.io/events"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { workspaceActionClient } from "@/lib/safe-action"
import {
  type UpdateTriggerSettingsSchema,
  updateTriggerSettingsSchema,
} from "../schema/mutation"

export const updateTriggerSettingsAction = workspaceActionClient
  .bindArgsSchemas([zodBigintAsString(), zodBigintAsString()])
  .inputSchema(updateTriggerSettingsSchema)
  .action(async (props) => {
    const {
      bindArgsParsedInputs: [workspaceId, id],
      parsedInput,
    } = props

    return await updateTriggerSettings(
      {
        workspaceId,
        id,
      },
      parsedInput,
    )
  })

export const updateTriggerSettings = async (
  ctx: {
    workspaceId: string
    id: string
  },
  parsedInput: UpdateTriggerSettingsSchema,
) => {
  const trigger = await db.query.triggerModel.findFirst({
    where: {
      id: ctx.id,
      workspaceId: ctx.workspaceId,
    },
  })

  if (!trigger) {
    throw notFoundException("Trigger not found")
  }

  await db
    .update(triggerModel)
    .set(parsedInput)
    .where(eq(triggerModel.id, trigger.id))

  // The trigger cache answers "does this workspace have an active trigger for
  // event X", so an activation change must refresh it like any other edit.
  await updateTriggerCache(ctx.workspaceId)
}

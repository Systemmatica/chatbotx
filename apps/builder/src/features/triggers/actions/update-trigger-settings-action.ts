"use server"

import { auditService } from "@chatbotx.io/business/audit"
import { db, eq } from "@chatbotx.io/database/client"
import { triggerModel } from "@chatbotx.io/database/schema"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { workspaceActionClient } from "@/lib/safe-action"

const updateTriggerSettingsSchema = z.object({
  name: z.optional(z.string().trim().min(1).max(255)),
  active: z.optional(z.boolean()),
})

type UpdateTriggerSettingsSchema = z.infer<typeof updateTriggerSettingsSchema>

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
    throw new Error("Trigger not found")
  }

  await db
    .update(triggerModel)
    .set(parsedInput)
    .where(eq(triggerModel.id, trigger.id))

  const changedKeys = Object.keys(parsedInput)
  let detail = `updated a trigger (#${trigger.id})`
  if (changedKeys.length === 1 && changedKeys[0] === "active") {
    detail = parsedInput.active
      ? `enabled a trigger (#${trigger.id})`
      : `disabled a trigger (#${trigger.id})`
  }

  await auditService.record({
    workspaceId: ctx.workspaceId,
    action: "update",
    detail,
  })
}

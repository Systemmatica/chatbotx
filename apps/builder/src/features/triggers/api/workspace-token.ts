import { triggerService } from "@chatbotx.io/business"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createTrigger } from "../actions/create-trigger-action"
import { deleteTriggers } from "../actions/delete-triggers-action"
import { updateTrigger } from "../actions/update-trigger-action"
import { updateTriggerSettings } from "../actions/update-trigger-settings-action"
import { findTrigger } from "../queries"
import {
  createTriggerSchema,
  updateTriggerSchema,
  updateTriggerSettingsSchema,
} from "../schema/mutation"
import { triggerResource } from "../schema/resource"

const triggerIdInput = z.object({ id: zodBigintAsString() })

const findTriggerOrFail = async (workspaceId: string, id: string) => {
  const trigger = await findTrigger({ workspaceId, id })
  if (!trigger) {
    throw notFoundException("Trigger not found")
  }
  // `findTrigger` loads `conditions` but its return type does not declare them.
  const { conditions } = trigger as typeof trigger & { conditions?: unknown[] }
  return { ...trigger, conditions: conditions ?? [] }
}

const listTriggersWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/triggers",
    summary: "List triggers",
    tags: ["Triggers"],
  })
  .output(z.object({ data: z.array(triggerResource) }))
  .handler(async ({ context }) => {
    const triggers = await triggerService.listByWorkspaceId(
      context.workspace.id,
    )
    return {
      data: triggers.map((trigger) => ({
        ...trigger,
        conditions: [],
        actions: [],
      })),
    }
  })

const getTriggerWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/triggers/{id}",
    summary: "Get a trigger with its conditions and actions",
    tags: ["Triggers"],
  })
  .input(triggerIdInput)
  .output(triggerResource)
  .errors(possibleErrorsOnFindingResource)
  .handler(
    async ({ context, input }) =>
      await findTriggerOrFail(context.workspace.id, input.id),
  )

const createTriggerWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "POST",
    path: "/v1/triggers",
    summary: "Create a trigger (add conditions and actions with PUT /rules)",
    successStatus: 201,
    tags: ["Triggers"],
  })
  .input(
    createTriggerSchema.extend({
      folderId: createTriggerSchema.shape.folderId.optional().default(null),
    }),
  )
  .output(triggerResource)
  .errors(possibleErrorsOnCreatingResource)
  .handler(async ({ context, input }) => {
    const trigger = await createTrigger(context.workspace.id, input)
    return await findTriggerOrFail(context.workspace.id, trigger.id)
  })

const updateTriggerWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "PATCH",
    path: "/v1/triggers/{id}",
    summary: "Rename, activate or deactivate a trigger",
    tags: ["Triggers"],
  })
  .input(updateTriggerSettingsSchema.extend(triggerIdInput.shape))
  .output(triggerResource)
  .errors(possibleErrorsOnUpdatingResource)
  .handler(async ({ context, input }) => {
    const { id, ...rest } = input
    await updateTriggerSettings({ workspaceId: context.workspace.id, id }, rest)
    return await findTriggerOrFail(context.workspace.id, id)
  })

const updateTriggerRulesWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "PUT",
    path: "/v1/triggers/{id}/rules",
    summary:
      "Replace the conditions and actions of a trigger. Conditions without an id are created, missing ones are removed",
    tags: ["Triggers"],
  })
  .input(updateTriggerSchema.extend(triggerIdInput.shape))
  .output(triggerResource)
  .errors(possibleErrorsOnUpdatingResource)
  .handler(async ({ context, input }) => {
    const { id, ...rest } = input
    await updateTrigger({ workspaceId: context.workspace.id, id }, rest)
    return await findTriggerOrFail(context.workspace.id, id)
  })

const deleteTriggerWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "DELETE",
    path: "/v1/triggers/{id}",
    summary: "Delete a trigger",
    successStatus: 204,
    tags: ["Triggers"],
  })
  .input(triggerIdInput)
  .errors(possibleErrorsOnDeletingResource)
  .handler(async ({ context, input }) => {
    const deletedIds = await deleteTriggers(context.workspace.id, [input.id])
    if (deletedIds.length === 0) {
      throw notFoundException("Trigger not found")
    }
  })

const getTriggerStatsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/triggers/{id}/stats",
    summary: "Daily execution counters of a trigger",
    tags: ["Triggers", "Analytics"],
  })
  .input(
    triggerIdInput.extend({
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }),
  )
  .output(
    z.object({
      data: z.array(
        z.object({
          date: z.date(),
          totalExecutions: z.number(),
          totalContacts: z.number(),
          successCount: z.number(),
          failureCount: z.number(),
        }),
      ),
    }),
  )
  .errors(possibleErrorsOnListingResource)
  .handler(async ({ context, input }) => {
    const trigger = await findTriggerOrFail(context.workspace.id, input.id)
    return {
      data: await triggerService.listDailyStats({
        workspaceId: context.workspace.id,
        triggerId: trigger.id,
        from: input.from,
        to: input.to,
      }),
    }
  })

export const triggersWorkspaceTokenAPIs = {
  listTriggersWorkspaceTokenAPI,
  getTriggerWorkspaceTokenAPI,
  createTriggerWorkspaceTokenAPI,
  updateTriggerWorkspaceTokenAPI,
  updateTriggerRulesWorkspaceTokenAPI,
  deleteTriggerWorkspaceTokenAPI,
  getTriggerStatsWorkspaceTokenAPI,
}

export default triggersWorkspaceTokenAPIs

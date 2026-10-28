import {
  broadcastAnalyticsService,
  getBroadcastStatsResponse,
} from "@chatbotx.io/analytics"
import { broadcastService } from "@chatbotx.io/business"
import { ChatbotXException } from "@chatbotx.io/business/errors"
import z from "zod"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createBroadcast } from "../actions/create-broadcast.action"
import { updateBroadcast } from "../actions/update-broadcast.action"
import {
  listBroadcastAudience,
  listWorkspaceBroadcasts,
  publicGetBroadcast,
} from "../queries"
import {
  createBroadcastRequest,
  updateBroadcastSchema,
} from "../schemas/action"
import {
  listBroadcastAudienceResponse,
  publicListBroadcastsResponse,
} from "../schemas/query"
import { publicBroadcastResource } from "../schemas/resource"

const broadcastKeyInput = z.object({ idOrName: z.string() })

const notScheduledException = () =>
  new ChatbotXException(
    "Only a broadcast that has not started sending can be changed",
    "broadcastNotScheduled",
    409,
  )

export const broadcastWorkspaceTokenAPIs = {
  listBroadcastsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts",
      summary: "Get all broadcasts",
      tags: ["Broadcasts"],
    })
    .output(publicListBroadcastsResponse)
    .handler(async ({ context }) => {
      const { data } = await listWorkspaceBroadcasts({
        workspaceId: context.workspace.id,
        page: 1,
        perPage: 100,
        sort: [{ id: "createdAt", desc: true }],
        name: null,
      })

      return { data }
    }),

  getBroadcastWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{idOrName}",
      summary: "Get broadcast by id or name",
      tags: ["Broadcasts"],
    })
    .input(z.object({ idOrName: z.string() }))
    .output(publicBroadcastResource)
    .handler(
      async ({ context, input }) =>
        await publicGetBroadcast(context.workspace.id, input.idOrName),
    ),

  getBroadcastAudienceWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{idOrName}/audience",
      summary: "Get broadcast audience",
      tags: ["Broadcasts"],
    })
    .input(
      z.object({
        idOrName: z.string(),
        page: z.coerce.number().int().min(1).optional(),
        perPage: z.coerce.number().int().min(1).optional(),
      }),
    )
    .output(listBroadcastAudienceResponse)
    .handler(async ({ context, input }) => {
      const broadcast = await publicGetBroadcast(
        context.workspace.id,
        input.idOrName,
      )
      return await listBroadcastAudience({
        broadcastId: broadcast.id,
        workspaceId: context.workspace.id,
        page: input.page,
        perPage: input.perPage,
      })
    }),
  createBroadcastWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts",
      summary:
        "Create a broadcast: send now (schedulesType now) or at schedulesAt (schedulesType future)",
      successStatus: 201,
      tags: ["Broadcasts"],
    })
    .input(createBroadcastRequest)
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        // A workspace token acts with full workspace access, so the
        // email/phone audience conditions are kept as sent.
        await createBroadcast(context.workspace.id, input, {
          canViewEmailAndPhone: true,
        }),
    ),

  renameBroadcastWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/broadcasts/{idOrName}",
      summary: "Rename a broadcast",
      tags: ["Broadcasts"],
    })
    .input(updateBroadcastSchema.extend(broadcastKeyInput.shape))
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const broadcast = await publicGetBroadcast(workspaceId, input.idOrName)
      await updateBroadcast(
        { workspaceId, id: broadcast.id },
        { name: input.name },
      )
      return await publicGetBroadcast(workspaceId, broadcast.id)
    }),

  rescheduleBroadcastWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PUT",
      path: "/v1/broadcasts/{idOrName}/schedule",
      summary: "Move the send time of a broadcast that has not started sending",
      tags: ["Broadcasts"],
    })
    .input(
      broadcastKeyInput.extend({
        schedulesAt: z.coerce.date().refine((date) => date > new Date(), {
          message: "Schedules must be after now.",
        }),
      }),
    )
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const broadcast = await publicGetBroadcast(workspaceId, input.idOrName)
      const updated = await broadcastService.reschedule({
        workspaceId,
        id: broadcast.id,
        schedulesAt: input.schedulesAt,
      })
      if (!updated) {
        throw notScheduledException()
      }
      return updated
    }),

  cancelBroadcastWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/broadcasts/{idOrName}/cancel",
      summary: "Cancel a broadcast that has not started sending",
      tags: ["Broadcasts"],
    })
    .input(broadcastKeyInput)
    .output(publicBroadcastResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const workspaceId = context.workspace.id
      const broadcast = await publicGetBroadcast(workspaceId, input.idOrName)
      const cancelled = await broadcastService.cancelScheduled({
        workspaceId,
        id: broadcast.id,
      })
      if (!cancelled) {
        throw notScheduledException()
      }
      return cancelled
    }),

  getBroadcastStatsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/broadcasts/{idOrName}/stats",
      summary:
        "Delivery stats of a broadcast (sent, delivered, seen, clicked, failed)",
      tags: ["Broadcasts", "Analytics"],
    })
    .input(broadcastKeyInput)
    .output(getBroadcastStatsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const broadcast = await publicGetBroadcast(
        context.workspace.id,
        input.idOrName,
      )
      return await broadcastAnalyticsService.getStats({
        workspaceId: context.workspace.id,
        broadcastId: broadcast.id,
      })
    }),
}

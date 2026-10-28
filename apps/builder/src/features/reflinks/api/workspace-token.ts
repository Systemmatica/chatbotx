import {
  listFlowNodeContactsResponse,
  refLinkAnalyticsService,
  refLinkTimeseriesRow,
} from "@chatbotx.io/analytics"
import { notFoundException } from "@chatbotx.io/business/errors"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { publicTimeRangeQuery } from "@/features/analytics/schemas/public-time-range"
import {
  possibleErrorsOnCreatingResource,
  possibleErrorsOnDeletingResource,
  possibleErrorsOnFindingResource,
  possibleErrorsOnListingResource,
  possibleErrorsOnUpdatingResource,
} from "@/lib/orpc/orpc-error-helper"
import { workspaceTokenAuthAPI } from "@/orpc"
import { createReflink } from "../actions/create-reflink.action"
import { deleteReflinks } from "../actions/delete-reflinks.action"
import { updateReflink } from "../actions/update-reflink.action"
import { findReflink, listWorkspaceReflinks } from "../queries"
import { createReflinkRequest, updateReflinkRequest } from "../schemas/action"
import { listReflinksResponse } from "../schemas/query"
import { reflinkResource } from "../schemas/resource"

const refLinkIdInput = z.object({ id: zodBigintAsString() })

const findReflinkOrFail = async (workspaceId: string, id: string) => {
  const reflink = await findReflink({ workspaceId, id })
  if (!reflink) {
    throw notFoundException("Ref link not found")
  }
  return reflink
}

export const refLinksWorkspaceTokenAPIs = {
  listRefLinksWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ref-links",
      summary: "List ref links",
      tags: ["Ref Links"],
    })
    .input(
      z.object({
        page: z.coerce.number().int().min(1).default(1),
        perPage: z.coerce.number().int().min(1).max(100).default(50),
        keyword: z.string().nullish(),
      }),
    )
    .output(listReflinksResponse)
    .errors(possibleErrorsOnListingResource)
    .handler(
      async ({ context, input }) =>
        await listWorkspaceReflinks({
          workspaceId: context.workspace.id,
          page: input.page,
          perPage: input.perPage,
          keyword: input.keyword ?? null,
          sort: [{ id: "createdAt", desc: true }],
        }),
    ),

  getRefLinkWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ref-links/{id}",
      summary: "Get a specific ref link",
      tags: ["Ref Links"],
    })
    .input(refLinkIdInput)
    .output(reflinkResource)
    .errors(possibleErrorsOnFindingResource)
    .handler(
      async ({ context, input }) =>
        await findReflinkOrFail(context.workspace.id, input.id),
    ),

  createRefLinkWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "POST",
      path: "/v1/ref-links",
      summary: "Create a ref link that starts a flow",
      successStatus: 201,
      tags: ["Ref Links"],
    })
    .input(
      createReflinkRequest.extend({
        customFieldId: createReflinkRequest.shape.customFieldId
          .optional()
          .default(null),
      }),
    )
    .output(reflinkResource)
    .errors(possibleErrorsOnCreatingResource)
    .handler(
      async ({ context, input }) =>
        await createReflink(context.workspace.id, input),
    ),

  updateRefLinkWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "PATCH",
      path: "/v1/ref-links/{id}",
      summary: "Update a ref link (name, flow, custom field)",
      tags: ["Ref Links"],
    })
    .input(updateReflinkRequest.extend(refLinkIdInput.shape))
    .output(reflinkResource)
    .errors(possibleErrorsOnUpdatingResource)
    .handler(async ({ context, input }) => {
      const { id, ...rest } = input
      await updateReflink({ workspaceId: context.workspace.id, id }, rest)
      return await findReflinkOrFail(context.workspace.id, id)
    }),

  deleteRefLinkWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "DELETE",
      path: "/v1/ref-links/{id}",
      summary: "Delete a ref link",
      successStatus: 204,
      tags: ["Ref Links"],
    })
    .input(refLinkIdInput)
    .errors(possibleErrorsOnDeletingResource)
    .handler(async ({ context, input }) => {
      const deletedIds = await deleteReflinks(context.workspace.id, [input.id])
      if (deletedIds.length === 0) {
        throw notFoundException("Ref link not found")
      }
    }),

  getRefLinkStatsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ref-links/{id}/stats",
      summary: "Daily ref link opens for a date range",
      tags: ["Ref Links", "Analytics"],
    })
    .input(publicTimeRangeQuery.extend(refLinkIdInput.shape))
    .output(z.object({ data: z.array(refLinkTimeseriesRow) }))
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const reflink = await findReflinkOrFail(context.workspace.id, input.id)
      const data = await refLinkAnalyticsService.getRefLinkStatsByDateRange({
        workspaceId: context.workspace.id,
        linkId: reflink.id,
        startDate: input.from.toISOString(),
        endDate: input.to.toISOString(),
        timezone: input.timezone,
      })
      return { data }
    }),

  listRefLinkContactsWorkspaceTokenAPI: workspaceTokenAuthAPI
    .route({
      method: "GET",
      path: "/v1/ref-links/{id}/contacts",
      summary: "Contacts that opened a ref link",
      tags: ["Ref Links", "Analytics"],
    })
    .input(
      refLinkIdInput.extend({
        page: z.coerce.number().int().min(1).default(1),
        perPage: z.coerce.number().int().min(1).max(100).default(20),
      }),
    )
    .output(listFlowNodeContactsResponse)
    .errors(possibleErrorsOnFindingResource)
    .handler(async ({ context, input }) => {
      const reflink = await findReflinkOrFail(context.workspace.id, input.id)
      return await refLinkAnalyticsService.getRefLinkContactStats({
        workspaceId: context.workspace.id,
        linkId: reflink.id,
        page: input.page,
        perPage: input.perPage,
      })
    }),
}

export default refLinksWorkspaceTokenAPIs

import {
  contactAnalyticsService,
  getContactCountsResponseSchema,
  getContactsByDimensionStatsResponseSchema,
  getMessagesBySenderStatsResponseSchema,
  granularityDayMonthSchema,
  macAnalyticsService,
  messageAnalyticsService,
} from "@chatbotx.io/analytics"
import z from "zod"
import { listTags } from "@/features/tags/queries"
import { possibleErrorsOnListingResource } from "@/lib/orpc/orpc-error-helper"
import { maxPerPage } from "@/lib/shared-request"
import { workspaceTokenAuthAPI } from "@/orpc"
import { publicTimeRangeQuery } from "../schemas/public-time-range"

const contactsSummaryAnalyticsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/analytics/contacts/summary",
    summary:
      "Contact totals for a date range: all, new, blocked and monthly-active contacts",
    tags: ["Analytics"],
  })
  .input(publicTimeRangeQuery)
  .output(
    z.object({
      data: z.object({
        total: z.number(),
        new: z.number(),
        blocked: z.number(),
        active: z.number(),
      }),
    }),
  )
  .errors(possibleErrorsOnListingResource)
  .handler(async ({ context, input }) => {
    const query = { ...input, workspaceId: context.workspace.id }
    const [total, created, blocked, active] = await Promise.all([
      contactAnalyticsService.getContactsCount(query),
      contactAnalyticsService.getNewContactsCount(query),
      contactAnalyticsService.getBlockedContactsCount(query),
      macAnalyticsService.getActiveContactsByWorkspaceForRange(query),
    ])

    return { data: { total, new: created, blocked, active } }
  })

const contactsPerDayAnalyticsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/analytics/contacts/per-day",
    summary: "Daily contact counts for a date range (all, new or blocked)",
    tags: ["Analytics"],
  })
  .input(
    publicTimeRangeQuery.extend({
      metric: z.enum(["total", "new", "blocked"]).default("total"),
    }),
  )
  .output(getContactCountsResponseSchema)
  .errors(possibleErrorsOnListingResource)
  .handler(async ({ context, input }) => {
    const { metric, ...range } = input
    const query = { ...range, workspaceId: context.workspace.id }

    switch (metric) {
      case "new":
        return {
          data: await contactAnalyticsService.getNewContactsPerDay(query),
        }
      case "blocked":
        return {
          data: await contactAnalyticsService.getBlockedContactsPerDay(query),
        }
      default:
        return {
          data: await contactAnalyticsService.getContactCountsPerDay(query),
        }
    }
  })

const contactsByDimensionAnalyticsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/analytics/contacts/by-dimension",
    summary: "Contacts in a date range grouped by country, channel or source",
    tags: ["Analytics"],
  })
  .input(
    publicTimeRangeQuery.extend({
      dimension: z.enum(["country", "channel", "source"]),
    }),
  )
  .output(getContactsByDimensionStatsResponseSchema)
  .errors(possibleErrorsOnListingResource)
  .handler(async ({ context, input }) => {
    const { dimension, ...range } = input
    const query = { ...range, workspaceId: context.workspace.id }

    switch (dimension) {
      case "country":
        return {
          data: await contactAnalyticsService.getContactsByCountry(query),
        }
      case "channel":
        return {
          data: await contactAnalyticsService.getContactsByChannel(query),
        }
      default:
        return {
          data: await contactAnalyticsService.getContactsBySource(query),
        }
    }
  })

const messagesBySenderAnalyticsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/analytics/messages/by-sender",
    summary:
      "Message counts in a date range per day or month, split by sender and channel",
    tags: ["Analytics"],
  })
  .input(
    publicTimeRangeQuery.extend({
      granularity: granularityDayMonthSchema.default("day"),
    }),
  )
  .output(getMessagesBySenderStatsResponseSchema)
  .errors(possibleErrorsOnListingResource)
  .handler(async ({ context, input }) => ({
    data: await messageAnalyticsService.getMessagesBySender({
      ...input,
      workspaceId: context.workspace.id,
    }),
  }))

const tagDistributionAnalyticsWorkspaceTokenAPI = workspaceTokenAuthAPI
  .route({
    method: "GET",
    path: "/v1/analytics/tags",
    summary: "Number of contacts carrying each tag (current state)",
    tags: ["Analytics"],
  })
  .output(
    z.object({
      data: z.array(
        z.object({
          id: z.string(),
          name: z.string(),
          contactsCount: z.number(),
        }),
      ),
    }),
  )
  .errors(possibleErrorsOnListingResource)
  .handler(async ({ context }) => {
    const { data } = await listTags({
      workspaceId: context.workspace.id,
      sort: [{ id: "createdAt", desc: true }],
      perPage: maxPerPage,
    })

    return {
      // `listTags` computes `contactsCount` as a query extra that the shared
      // tag resource type does not declare.
      data: data.map((tag) => ({
        id: tag.id,
        name: tag.name,
        contactsCount:
          (tag as typeof tag & { contactsCount?: number }).contactsCount ?? 0,
      })),
    }
  })

export const analyticsWorkspaceTokenAPIs = {
  contactsSummaryAnalyticsWorkspaceTokenAPI,
  contactsPerDayAnalyticsWorkspaceTokenAPI,
  contactsByDimensionAnalyticsWorkspaceTokenAPI,
  messagesBySenderAnalyticsWorkspaceTokenAPI,
  tagDistributionAnalyticsWorkspaceTokenAPI,
}

export default analyticsWorkspaceTokenAPIs

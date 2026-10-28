import { timeRangeQuerySchema } from "@chatbotx.io/analytics"
import z from "zod"

const isValidTimeZone = (value: string): boolean => {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value })
    return true
  } catch {
    return false
  }
}

/**
 * Date range accepted by the public analytics endpoints. Same shape as the
 * dashboard's `timeRangeQuerySchema` minus `workspaceId`, which always comes
 * from the workspace token.
 */
export const publicTimeRangeQuery = timeRangeQuerySchema
  .omit({ workspaceId: true })
  .extend({
    from: timeRangeQuerySchema.shape.from.describe(
      "Range start, ISO 8601 (e.g. 2026-01-01T00:00:00Z)",
    ),
    to: timeRangeQuerySchema.shape.to.describe("Range end, ISO 8601"),
    timezone: z
      .string()
      .default("UTC")
      .refine(isValidTimeZone, { message: "Unknown IANA time zone" })
      .describe("IANA time zone used to bucket days, default UTC"),
  })
export type PublicTimeRangeQuery = z.infer<typeof publicTimeRangeQuery>

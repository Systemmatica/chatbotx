import { leadMagnetKinds } from "@chatbotx.io/database/partials"
import { z } from "zod"

export const leadMagnetResource = z.object({
  id: z.string(),
  name: z.string(),
  kind: leadMagnetKinds,
  url: z.string().nullable(),
  description: z.string().nullable(),
  tagId: z.string().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type LeadMagnetResource = z.infer<typeof leadMagnetResource>

export const leadMagnetWithStatsResource = leadMagnetResource.extend({
  /** `null` when the tag was deleted; the next save re-creates it. */
  tagName: z.string().nullable(),
  /** Contacts holding the lead magnet's tag. */
  recipients: z.number(),
})

export type LeadMagnetWithStatsResource = z.infer<
  typeof leadMagnetWithStatsResource
>

export const listLeadMagnetsResponse = z.object({
  data: z.array(leadMagnetWithStatsResource),
})

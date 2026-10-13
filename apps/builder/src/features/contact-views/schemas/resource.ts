import { z } from "zod"

export const contactViewResource = z.object({
  id: z.string(),
  name: z.string(),
  position: z.number(),
  /** Raw stored config; read it with `resolveContactViewConfig`. */
  config: z.record(z.string(), z.unknown()),
  createdAt: z.date(),
  updatedAt: z.date(),
})
export type ContactViewResource = z.infer<typeof contactViewResource>

export const listContactViewsResponse = z.object({
  data: z.array(contactViewResource),
})

export const contactGroupCountResource = z.object({
  key: z.string().nullable(),
  count: z.number(),
})
export type ContactGroupCountResource = z.infer<
  typeof contactGroupCountResource
>

export const countContactGroupsResponse = z.object({
  data: z.array(contactGroupCountResource),
})

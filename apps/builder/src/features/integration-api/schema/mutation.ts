import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"

// The form submits an empty input as "", which `z.url()` rejects, so an
// untouched optional field kept the submit button disabled. Treat "" as
// "no callback URL" on both create and update.
const optionalCallbackUrl = z
  .union([z.literal("").transform(() => null), z.url()])
  .nullish()

export const createApiRequest = z.object({
  name: z.string().min(1).max(40),
  workspaceId: zodBigintAsString().nullish(),
  callbackUrl: optionalCallbackUrl,
})
export type CreateApiRequest = z.infer<typeof createApiRequest>

export const updateApiRequest = z.object({
  name: z.string().min(1).max(40).optional(),
  callbackUrl: optionalCallbackUrl,
})
export type UpdateApiRequest = z.infer<typeof updateApiRequest>

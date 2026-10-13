import { customFieldTypes } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { customFieldIconSchema } from "../lib/custom-field-icon-names"

export const createCustomFieldRequest = z.object({
  name: z.string().trim().min(1).max(255),
  type: customFieldTypes,
  folderId: zodBigintAsString().nullish(),
  description: z.string().nullish(),
  /** Lucide icon name; `null` uses the icon of the field type. */
  icon: customFieldIconSchema.nullish(),
})
export type CreateCustomFieldRequest = z.infer<typeof createCustomFieldRequest>

export const createCustomFieldResponse = z.object({
  id: zodBigintAsString(),
})
export type CreateCustomFieldResponse = z.infer<
  typeof createCustomFieldResponse
>

export const updateCustomFieldRequest = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().optional(),
  folderId: zodBigintAsString().nullish(),
  /** Lucide icon name; `null` resets to the icon of the field type. */
  icon: customFieldIconSchema.nullish(),
})
export type UpdateCustomFieldRequest = z.infer<typeof updateCustomFieldRequest>

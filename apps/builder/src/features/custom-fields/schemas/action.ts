import {
  customFieldOptionsSchema,
  customFieldTypes,
  isSelectCustomFieldType,
} from "@chatbotx.io/database/partials"
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
  /** Choices of a select / multiSelect field; ignored for other types. */
  options: customFieldOptionsSchema.nullish(),
})
export type CreateCustomFieldRequest = z.infer<typeof createCustomFieldRequest>

/**
 * UI/action variant: a select field needs at least one option to be usable.
 * Kept separate so `createCustomFieldRequest.pick()` (public API) still works —
 * zod refuses `pick` on refined objects.
 */
export const createCustomFieldFormRequest =
  createCustomFieldRequest.superRefine((data, ctx) => {
    if (isSelectCustomFieldType(data.type) && !data.options?.length) {
      ctx.addIssue({
        code: "custom",
        message: "Add at least one option",
        path: ["options"],
      })
    }
  })

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
  /**
   * Full option list of a select / multiSelect field (omitted = unchanged).
   * Options are matched by `id`, so a changed label renames stored values.
   */
  options: customFieldOptionsSchema.optional(),
})
export type UpdateCustomFieldRequest = z.infer<typeof updateCustomFieldRequest>

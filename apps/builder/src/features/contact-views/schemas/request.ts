import { contactViewGroupBySchema } from "@chatbotx.io/database/partials"
import { zodBigintAsString } from "@chatbotx.io/utils"
import { z } from "zod"
import { contactFilterCriteriaSchema } from "@/features/contact-filter/schemas"
import { withWorkspaceIdSchema } from "@/features/workspaces/schema/resource"
import { contactViewConfigInputSchema, contactViewNameSchema } from "./config"

export const contactViewIdRequest = withWorkspaceIdSchema.extend({
  viewId: zodBigintAsString(),
})

export const createContactViewRequest = withWorkspaceIdSchema.extend({
  name: contactViewNameSchema,
  config: contactViewConfigInputSchema,
})
export type CreateContactViewRequest = z.infer<typeof createContactViewRequest>

export const updateContactViewRequest = contactViewIdRequest.extend({
  name: contactViewNameSchema.optional(),
  config: contactViewConfigInputSchema.optional(),
})
export type UpdateContactViewRequest = z.infer<typeof updateContactViewRequest>

export const duplicateContactViewRequest = contactViewIdRequest.extend({
  name: contactViewNameSchema,
})

export const reorderContactViewsRequest = withWorkspaceIdSchema.extend({
  orderedIds: z.array(zodBigintAsString()).min(1).max(100),
})

/** Grouped counts over the same filter the contacts list uses. */
export const countContactGroupsRequest = withWorkspaceIdSchema.extend({
  keyword: z.string().max(255).optional(),
  contactFilter: contactFilterCriteriaSchema.optional(),
  groupBy: contactViewGroupBySchema,
})
export type CountContactGroupsRequest = z.infer<
  typeof countContactGroupsRequest
>

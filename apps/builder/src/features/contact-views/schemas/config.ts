import {
  CONTACT_VIEW_NAME_MAX_LENGTH,
  contactViewConfigSchema,
  contactViewGroupBySchema,
  contactViewSortSchema,
} from "@chatbotx.io/database/partials"
import { z } from "zod"
import {
  type ContactFilterCriteria,
  contactFilterCriteriaSchema,
} from "@/features/contact-filter/schemas"

export const contactViewNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(CONTACT_VIEW_NAME_MAX_LENGTH)

/** A view's table state as the API accepts it: the filter is validated too. */
export const contactViewConfigInputSchema = contactViewConfigSchema.extend({
  filter: contactFilterCriteriaSchema.optional(),
})
export type ContactViewConfigInput = z.infer<
  typeof contactViewConfigInputSchema
>

export type ContactViewGroupBy = z.infer<typeof contactViewGroupBySchema>
export type ContactViewSort = z.infer<typeof contactViewSortSchema>

/** A view's table state with every default filled in. */
export type ResolvedContactViewConfig = {
  filter: ContactFilterCriteria | null
  sort: ContactViewSort[]
  visibleColumns: string[] | null
  groupBy: ContactViewGroupBy | null
}

/**
 * Reads a stored view config leniently: each part that no longer validates
 * (e.g. a filter written by an older version) falls back to the default
 * instead of breaking the whole view.
 */
export function resolveContactViewConfig(
  raw: unknown,
): ResolvedContactViewConfig {
  const source =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const filter = contactFilterCriteriaSchema.safeParse(source.filter)
  const sort = z.array(contactViewSortSchema).safeParse(source.sort)
  const visibleColumns = z
    .array(z.string().min(1))
    .safeParse(source.visibleColumns)
  const groupBy = contactViewGroupBySchema.safeParse(source.groupBy)

  return {
    filter: filter.success ? filter.data : null,
    sort: sort.success ? sort.data : [],
    visibleColumns: visibleColumns.success ? visibleColumns.data : null,
    groupBy: groupBy.success ? groupBy.data : null,
  }
}

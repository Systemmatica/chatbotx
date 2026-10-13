import z from "zod"

export const CONTACT_VIEW_NAME_MAX_LENGTH = 100
export const CONTACT_VIEWS_PER_WORKSPACE_MAX = 50
const MAX_VIEW_COLUMNS = 200
const MAX_VIEW_SORTS = 5

/** One sort of the contacts table (`id` is a table column id). */
export const contactViewSortSchema = z.object({
  id: z.string().min(1).max(64),
  desc: z.boolean(),
})
export type ContactViewSort = z.infer<typeof contactViewSortSchema>

/**
 * What the contacts table of a view is grouped by: a custom field's values,
 * the lead magnets contacts received, or the stages of a Kanban board.
 */
export const contactViewGroupBySchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("customField"),
    customFieldId: z.string().regex(/^\d+$/),
  }),
  z.object({ kind: z.literal("leadMagnet") }),
  z.object({
    kind: z.literal("stage"),
    boardId: z.string().regex(/^\d+$/),
  }),
])
export type ContactViewGroupBy = z.infer<typeof contactViewGroupBySchema>

/**
 * A saved contacts view's table state. `filter` holds the contact filter JSON
 * (validated by the builder's contact filter schema, which lives there);
 * missing keys mean "the table default".
 */
export const contactViewConfigSchema = z.object({
  filter: z.unknown().optional(),
  sort: z.array(contactViewSortSchema).max(MAX_VIEW_SORTS).optional(),
  visibleColumns: z
    .array(z.string().min(1).max(80))
    .max(MAX_VIEW_COLUMNS)
    .optional(),
  groupBy: contactViewGroupBySchema.nullish(),
})
export type ContactViewConfig = z.infer<typeof contactViewConfigSchema>

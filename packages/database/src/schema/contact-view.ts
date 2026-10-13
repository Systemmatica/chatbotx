import { index, integer, jsonb, pgTable, text } from "drizzle-orm/pg-core"
import type { ContactViewConfig } from "../partials/contact-view"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { workspaceModel } from "./workspace"

/**
 * A saved view of the contacts table (Notion-style tab): filter, sort,
 * visible columns and grouping. Shared by the whole workspace; tabs are
 * ordered by `position`.
 */
export const contactViewModel = pgTable(
  "ContactView",
  {
    ...sharedColumns,
    name: text().notNull(),
    position: integer().default(0).notNull(),
    config: jsonb().$type<ContactViewConfig>().default({}).notNull(),
    createdById: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    index("ContactView_workspaceId_position_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.position.asc().nullsLast(),
    ),
  ],
)

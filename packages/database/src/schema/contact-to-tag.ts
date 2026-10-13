import { pgTable, primaryKey, timestamp } from "drizzle-orm/pg-core"
import { bigintAsString, timestampConfig } from "../partials/shared"
import { contactModel } from "./contact"
import { tagModel } from "./tag"

export const contactsToTagsModel = pgTable(
  "ContactToTag",
  {
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    tagId: bigintAsString()
      .notNull()
      .references(() => tagModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    /**
     * When the tag was attached. `null` for links that existed before this
     * column was added (their real date is unknown; the column was added
     * without a default so they are not stamped with the migration time,
     * then the default was set in a follow-up migration). Inserts use
     * `onConflictDoNothing`, so re-adding a tag keeps the original date.
     */
    createdAt: timestamp(timestampConfig).defaultNow(),
  },
  (table) => [
    primaryKey({
      columns: [table.contactId, table.tagId],
    }),
  ],
)

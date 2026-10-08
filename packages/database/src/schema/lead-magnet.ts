import { index, pgEnum, pgTable, text, uniqueIndex } from "drizzle-orm/pg-core"
import { type LeadMagnetKind, leadMagnetKinds } from "../partials/lead-magnet"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { tagModel } from "./tag"
import { workspaceModel } from "./workspace"

export const leadMagnetKind = pgEnum(
  "leadMagnetKind",
  leadMagnetKinds.options as [LeadMagnetKind, ...LeadMagnetKind[]],
)

/**
 * A lead magnet of the marketing funnel (book, article, checklist...). A
 * contact "received" it when the lead magnet's tag is on the contact, so the
 * bot hands it out with the regular "Add tag" step and every tag filter
 * (contacts, segments, broadcasts) works on it.
 *
 * `tagId` is `set null` rather than `restrict`: tags are soft-deleted in the
 * app, so a hard delete only happens through the workspace cascade, where a
 * `restrict` check could fire before this row is cascaded away. A lost tag is
 * re-created by the service on the next update.
 */
export const leadMagnetModel = pgTable(
  "LeadMagnet",
  {
    ...sharedColumns,
    name: text().notNull(),
    kind: leadMagnetKind().default("other").notNull(),
    url: text(),
    description: text(),
    tagId: bigintAsString().references(() => tagModel.id, {
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
    uniqueIndex("LeadMagnet_workspaceId_name_key").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
      table.name.asc().nullsLast(),
    ),
    index("LeadMagnet_tagId_idx").using("btree", table.tagId.asc().nullsLast()),
  ],
)

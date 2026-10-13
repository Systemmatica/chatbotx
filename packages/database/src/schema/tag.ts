import { isNull } from "drizzle-orm"
import {
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { type LabelColor, labelColors } from "../partials/label-color"
import {
  bigintAsString,
  sharedColumns,
  timestampConfig,
} from "../partials/shared"
import { folderModel } from "./folder"
import { workspaceModel } from "./workspace"

export const labelColor = pgEnum(
  "labelColor",
  labelColors.options as [string, ...string[]],
)

export const tagModel = pgTable(
  "Tag",
  {
    ...sharedColumns,
    name: text().notNull(),
    /**
     * Palette token; `null` renders the deterministic color of `name`
     * (`resolveLabelColor`), so tags created without a color still look stable.
     */
    color: labelColor().$type<LabelColor>(),
    deletedAt: timestamp(timestampConfig),
    folderId: bigintAsString().references(() => folderModel.id, {
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
    uniqueIndex("Tag_workspaceId_name_key")
      .using(
        "btree",
        table.workspaceId.asc().nullsLast(),
        table.name.asc().nullsLast(),
      )
      .where(isNull(table.deletedAt)),
    index("Tag_folderId_idx").using("btree", table.folderId.asc().nullsLast()),
  ],
)

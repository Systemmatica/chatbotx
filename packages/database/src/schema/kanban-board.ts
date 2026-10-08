import { index, jsonb, pgTable, text } from "drizzle-orm/pg-core"
import type { KanbanStage } from "../partials/kanban"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { customFieldModel } from "./custom-field"
import { flowModel } from "./flow"
import { workspaceModel } from "./workspace"

/**
 * A Kanban board of contacts. Each column is a stage whose `name` is a value of
 * the board's `shortText` custom field; moving a card writes that value.
 */
export const kanbanBoardModel = pgTable(
  "KanbanBoard",
  {
    ...sharedColumns,
    name: text().notNull(),
    stages: jsonb().$type<KanbanStage[]>().default([]).notNull(),
    customFieldId: bigintAsString()
      .notNull()
      .references(() => customFieldModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    flowId: bigintAsString().references(() => flowModel.id, {
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
    index("KanbanBoard_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
    index("KanbanBoard_flowId_idx").using(
      "btree",
      table.flowId.asc().nullsLast(),
    ),
    index("KanbanBoard_customFieldId_idx").using(
      "btree",
      table.customFieldId.asc().nullsLast(),
    ),
  ],
)

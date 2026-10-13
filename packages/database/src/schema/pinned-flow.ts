import { index, pgTable, uniqueIndex } from "drizzle-orm/pg-core"
import { bigintAsString, sharedColumns } from "../partials/shared"
import { userModel } from "./auth-user"
import { flowModel } from "./flow"
import { workspaceModel } from "./workspace"

/**
 * A flow a member starred for quick access from the sidebar. Personal: the
 * same flow can be pinned by several members of a workspace, each sees only
 * their own pins. `createdAt` is the pin time and defines the order.
 */
export const pinnedFlowModel = pgTable(
  "PinnedFlow",
  {
    ...sharedColumns,
    userId: bigintAsString()
      .notNull()
      .references(() => userModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    flowId: bigintAsString()
      .notNull()
      .references(() => flowModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
  },
  (table) => [
    uniqueIndex("PinnedFlow_userId_workspaceId_flowId_key").using(
      "btree",
      table.userId.asc().nullsLast(),
      table.workspaceId.asc().nullsLast(),
      table.flowId.asc().nullsLast(),
    ),
    index("PinnedFlow_flowId_idx").using(
      "btree",
      table.flowId.asc().nullsLast(),
    ),
  ],
)

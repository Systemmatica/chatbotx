import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const pinnedFlowRelations = defineRelationsPart(schema, (r) => ({
  pinnedFlowModel: {
    user: r.one.userModel({
      from: r.pinnedFlowModel.userId,
      to: r.userModel.id,
      optional: false,
    }),
    workspace: r.one.workspaceModel({
      from: r.pinnedFlowModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    flow: r.one.flowModel({
      from: r.pinnedFlowModel.flowId,
      to: r.flowModel.id,
      optional: false,
    }),
  },
}))

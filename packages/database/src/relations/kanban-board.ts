import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const kanbanBoardRelations = defineRelationsPart(schema, (r) => ({
  kanbanBoardModel: {
    workspace: r.one.workspaceModel({
      from: r.kanbanBoardModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    customField: r.one.customFieldModel({
      from: r.kanbanBoardModel.customFieldId,
      to: r.customFieldModel.id,
      optional: false,
    }),
    flow: r.one.flowModel({
      from: r.kanbanBoardModel.flowId,
      to: r.flowModel.id,
    }),
  },
}))

import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const leadMagnetRelations = defineRelationsPart(schema, (r) => ({
  leadMagnetModel: {
    workspace: r.one.workspaceModel({
      from: r.leadMagnetModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    tag: r.one.tagModel({
      from: r.leadMagnetModel.tagId,
      to: r.tagModel.id,
    }),
  },
}))

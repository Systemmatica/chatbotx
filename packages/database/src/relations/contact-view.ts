import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactViewRelations = defineRelationsPart(schema, (r) => ({
  contactViewModel: {
    workspace: r.one.workspaceModel({
      from: r.contactViewModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    createdBy: r.one.userModel({
      from: r.contactViewModel.createdById,
      to: r.userModel.id,
    }),
  },
}))

import { defineRelationsPart } from "drizzle-orm"
// biome-ignore lint/performance/noNamespaceImport: drizzle schema
import * as schema from "../schema"

export const contactActivityRelations = defineRelationsPart(schema, (r) => ({
  contactActivityModel: {
    workspace: r.one.workspaceModel({
      from: r.contactActivityModel.workspaceId,
      to: r.workspaceModel.id,
      optional: false,
    }),
    contact: r.one.contactModel({
      from: r.contactActivityModel.contactId,
      to: r.contactModel.id,
      optional: false,
    }),
    actorUser: r.one.userModel({
      from: r.contactActivityModel.actorUserId,
      to: r.userModel.id,
    }),
  },
}))

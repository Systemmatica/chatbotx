import { createId } from "@chatbotx.io/utils"
import { index, jsonb, pgEnum, pgTable, timestamp } from "drizzle-orm/pg-core"
import {
  type ContactActivityActorType,
  type ContactActivityPayload,
  type ContactActivityType,
  contactActivityActorTypes,
  contactActivityTypes,
} from "../partials/contact-activity"
import { bigintAsString } from "../partials/shared"
import { userModel } from "./auth-user"
import { contactModel } from "./contact"
import { workspaceModel } from "./workspace"

export const contactActivityType = pgEnum(
  "contactActivityType",
  contactActivityTypes.options as [
    ContactActivityType,
    ...ContactActivityType[],
  ],
)

export const contactActivityActorType = pgEnum(
  "contactActivityActorType",
  contactActivityActorTypes.options as [
    ContactActivityActorType,
    ...ContactActivityActorType[],
  ],
)

/**
 * Append-only history of contact changes that leave no other trace (a removed
 * tag, an overwritten custom field value, a started flow, an assignment).
 * Written best-effort: a failed insert is logged and never fails the change.
 *
 * `createdAt` has millisecond precision on purpose: it is the feed's cursor,
 * and a JS `Date` round-trips milliseconds exactly.
 */
export const contactActivityModel = pgTable(
  "ContactActivity",
  {
    id: bigintAsString()
      .primaryKey()
      .$defaultFn(() => createId()),
    createdAt: timestamp({ precision: 3, withTimezone: true })
      .defaultNow()
      .notNull(),
    workspaceId: bigintAsString()
      .notNull()
      .references(() => workspaceModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    contactId: bigintAsString()
      .notNull()
      .references(() => contactModel.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),
    type: contactActivityType().notNull(),
    actorType: contactActivityActorType().default("bot").notNull(),
    actorUserId: bigintAsString().references(() => userModel.id, {
      onDelete: "set null",
      onUpdate: "cascade",
    }),
    payload: jsonb().$type<ContactActivityPayload>().default({}).notNull(),
  },
  (table) => [
    index("ContactActivity_contactId_createdAt_idx").using(
      "btree",
      table.contactId.asc().nullsLast(),
      table.createdAt.desc().nullsFirst(),
      table.id.desc().nullsFirst(),
    ),
    index("ContactActivity_workspaceId_idx").using(
      "btree",
      table.workspaceId.asc().nullsLast(),
    ),
  ],
)

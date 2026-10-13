import {
  and,
  type DatabaseClient,
  db,
  eq,
  inArray,
  type SQL,
  sql,
} from "@chatbotx.io/database/client"
import { isSelectCustomFieldType } from "@chatbotx.io/database/partials"
import { contactCustomFieldModel } from "@chatbotx.io/database/schema"
import { emitCustomFieldChanged } from "@chatbotx.io/events"
import { createId, isNumericId } from "@chatbotx.io/utils"
import {
  type SourceTimezoneStrategy,
  TemporalInputParsing,
} from "@chatbotx.io/utils/datetime"
import { BaseService } from "../base.service"
import { notFoundException } from "../errors"
import { logger } from "../logger"
import {
  createSourceTimezoneResolver,
  normalizeCustomFieldValueForStorage,
} from "./normalize"
import { contactCustomFieldValueService } from "./value-service"

type SetValuesInput = {
  workspaceId: string
  contactId: string
  fields: Array<{ customFieldId: string; value: string }>
  /** Browser zone captured at form submit; anchors naive `date` values. */
  sourceTimezone?: string
  /**
   * Strict (default): accept only canonical ISO temporal input. Lenient: run
   * the multi-format parser first (spreadsheet/import-style sources).
   */
  temporalInputParsing?: TemporalInputParsing
  /**
   * Which zone anchors naive temporal values. Defaults to contact -> workspace;
   * the spreadsheet step uses `workspace` to skip the contact lookup.
   */
  sourceTimezoneStrategy?: SourceTimezoneStrategy
  /**
   * An explicit source zone that anchors EVERY temporal type (both `date` and
   * naive `datetime`), short-circuiting the contact/workspace lookup. The flow
   * "set custom field" step passes its captured editor browser zone here so
   * both types resolve against the flow author's zone. Overrides the strategy.
   */
  sourceTimezoneOverride?: string
  /**
   * When a temporal value is blank, stamp the current date/datetime in the
   * resolved source zone instead of persisting an empty string. Used by the
   * flow "set custom field" step so an empty date/datetime records "now".
   */
  fillEmptyTemporalWithNow?: boolean
}

/**
 * A single persisted custom-field change awaiting its post-commit side effects.
 * `setValuesInTransaction` returns these so a caller that owns an outer
 * transaction can emit the trigger/webhook events only AFTER it commits.
 */
export type PendingContactCustomFieldChange = {
  customFieldId: string
  customFieldName: string
  oldValue: string | null
  newValue: string
}

type EmitCustomFieldChangesInput = {
  workspaceId: string
  contactId: string
  changes: PendingContactCustomFieldChange[]
}

type DeleteByKeyInput = {
  workspaceId: string
  contactId: string
  keyword: string
}

type DeleteByCustomFieldIdInput = {
  workspaceId: string
  contactIds: string[]
  customFieldId: string
  tx?: DatabaseClient
}

type InsertNormalizedValuesForNewContactsInput = {
  workspaceId: string
  entries: Array<{
    contactId: string
    fields: Array<{ customFieldId: string; value: string }>
  }>
  tx?: DatabaseClient
}

type SetValueByKeyInput = DeleteByKeyInput & {
  value: string
  /**
   * Explicit source zone anchoring naive `date`/`datetime` values (e.g. a flow
   * step's captured editor browser zone). Forwarded to `setValues`.
   */
  sourceTimezoneOverride?: string
  /** Strict (default) or Lenient multi-format parsing for temporal input. */
  temporalInputParsing?: TemporalInputParsing
  /** Blank temporal value -> stamp "now" in the resolved source zone. */
  fillEmptyTemporalWithNow?: boolean
}

// Cache tags for contact-scoped invalidation. Building the full set in one call
// lets a bulk operation invalidate N contacts with a single cache round-trip
// instead of N awaited calls.
const contactCacheTags = (
  workspaceId: string,
  contactIds: string[],
): string[] => [
  "contacts",
  `contacts:${workspaceId}`,
  ...contactIds.map((contactId) => `contacts:${contactId}`),
]

class ContactCustomFieldService extends BaseService {
  async listValues(input: { contactId: string }) {
    return await db.query.contactCustomFieldModel.findMany({
      where: { contactId: input.contactId },
      columns: { customFieldId: true, value: true },
    })
  }

  async findValue(input: {
    contactId: string
    customFieldId: string
  }): Promise<string | null> {
    return await contactCustomFieldValueService.findValue(input)
  }

  async listWithDefinitions(input: {
    contactId: string
    tx?: DatabaseClient
  }): Promise<{ name: string; value: string }[]> {
    const { contactId, tx = db } = input
    const rows = await tx.query.contactCustomFieldModel.findMany({
      where: { contactId },
      columns: { value: true },
      with: {
        customField: {
          columns: { name: true },
        },
      },
      orderBy: { id: "asc" },
    })
    return rows.map((row) => ({
      name: row.customField.name,
      value: row.value,
    }))
  }

  /**
   * Persists the changed field values against `client` and returns the changes
   * as pending side effects. This is write-only: it never emits events or
   * invalidates caches, so it is safe to run inside a caller's transaction.
   */
  private async writeValues(
    input: SetValuesInput,
    client: DatabaseClient,
  ): Promise<PendingContactCustomFieldChange[]> {
    const {
      workspaceId,
      contactId,
      fields,
      sourceTimezone,
      temporalInputParsing,
      sourceTimezoneStrategy,
      sourceTimezoneOverride,
      fillEmptyTemporalWithNow,
    } = input
    const customFieldIds = fields.map((f) => f.customFieldId)
    const fieldById = new Map(
      fields.map((field) => [field.customFieldId, field] as const),
    )

    const customFields = await client.query.customFieldModel.findMany({
      where: { workspaceId, id: { in: customFieldIds } },
      columns: { id: true, name: true, type: true, options: true },
    })

    if (customFields.length === 0) {
      return []
    }

    const existingValues = await client.query.contactCustomFieldModel.findMany({
      where: { contactId, customFieldId: { in: customFieldIds } },
    })
    const existingById = new Map(
      existingValues.map((value) => [value.customFieldId, value] as const),
    )
    const resolveSourceTimezone = createSourceTimezoneResolver({
      workspaceId,
      contactId,
      strategy: sourceTimezoneStrategy,
      explicitSourceTimezone: sourceTimezoneOverride,
      tx: client,
    })

    const changedFields = await Promise.all(
      customFields.map(async (customField) => {
        const field = fieldById.get(customField.id)
        if (!field) {
          return null
        }

        const normalizedValue = await normalizeCustomFieldValueForStorage({
          type: customField.type,
          value: field.value,
          options: customField.options,
          resolveSourceTimezone,
          explicitTimezone: sourceTimezone,
          temporalInputParsing,
          fillEmptyTemporalWithNow,
        })
        // Un-normalizable temporal value or a value that is not an option of
        // a select field: skip rather than persist garbage.
        if (normalizedValue === null) {
          if (isSelectCustomFieldType(customField.type)) {
            logger.warn(
              {
                workspaceId,
                contactId,
                customFieldId: customField.id,
                type: customField.type,
              },
              "Skipped a select custom-field value that matches no option",
            )
          } else if (temporalInputParsing === TemporalInputParsing.Lenient) {
            logger.warn(
              {
                workspaceId,
                contactId,
                customFieldId: customField.id,
                type: customField.type,
              },
              "Skipped unparseable temporal custom-field value from a lenient source",
            )
          }
          return null
        }
        const existing = existingById.get(customField.id)
        if (existing?.value === normalizedValue) {
          return null
        }

        return {
          customField,
          existing,
          oldValue: existing?.value ?? null,
          value: normalizedValue,
        }
      }),
    )

    const valuesToPersist = changedFields.filter(
      (field) => field !== null,
    ) as NonNullable<(typeof changedFields)[number]>[]

    if (valuesToPersist.length === 0) {
      return []
    }

    await Promise.all(
      valuesToPersist.map(({ customField, value, existing }) => {
        if (existing) {
          return client
            .update(contactCustomFieldModel)
            .set({ value })
            .where(eq(contactCustomFieldModel.id, existing.id))
        }
        return client
          .insert(contactCustomFieldModel)
          .values({
            id: createId(),
            contactId,
            customFieldId: customField.id,
            value,
          })
          .onConflictDoUpdate({
            target: [
              contactCustomFieldModel.contactId,
              contactCustomFieldModel.customFieldId,
            ],
            set: { value },
          })
      }),
    )

    return valuesToPersist.map(({ customField, oldValue, value }) => ({
      customFieldId: customField.id,
      customFieldName: customField.name,
      oldValue,
      newValue: value,
    }))
  }

  async setValues(
    input: SetValuesInput,
    tx: DatabaseClient = db,
  ): Promise<void> {
    // No caller transaction: own one so the reads and writes are consistent.
    // A caller-supplied `tx` writes inside their transaction and — like the
    // legacy behavior — emits before it commits; callers that need commit-safe
    // ordering use setValuesInTransaction + emitCustomFieldChanges instead.
    const changes =
      tx === db
        ? await tx.transaction((innerTx) => this.writeValues(input, innerTx))
        : await this.writeValues(input, tx)

    await this.emitCustomFieldChanges({
      workspaceId: input.workspaceId,
      contactId: input.contactId,
      changes,
    })
  }

  /**
   * Write-only variant for callers that own an outer transaction. Persists the
   * values inside `tx` and returns the pending changes; the caller MUST call
   * `emitCustomFieldChanges` once the transaction commits. Emitting inside the
   * transaction would let the trigger worker (which re-reads the value) observe
   * uncommitted or rolled-back data.
   */
  async setValuesInTransaction(
    input: SetValuesInput,
    tx: DatabaseClient,
  ): Promise<PendingContactCustomFieldChange[]> {
    return await this.writeValues(input, tx)
  }

  /**
   * Emits one customFieldChanged event per change, then invalidates the contact
   * cache once. Cache invalidation is unconditional (cheap and idempotent) so a
   * no-op write still refreshes any stale cache. Emission is fire-and-forget:
   * a failed enqueue is logged, not thrown, so it never blocks the caller.
   */
  async emitCustomFieldChanges(
    input: EmitCustomFieldChangesInput,
  ): Promise<void> {
    const { workspaceId, contactId, changes } = input

    for (const change of changes) {
      emitCustomFieldChanged(
        workspaceId,
        contactId,
        change.customFieldId,
        change.customFieldName,
        change.oldValue,
        change.newValue,
      ).catch((error: unknown) => {
        logger.warn(
          {
            err: error,
            workspaceId,
            contactId,
            customFieldId: change.customFieldId,
          },
          "Failed to emit customFieldChanged event",
        )
      })
    }

    await this.invalidate({ workspaceId, contactId })
  }

  async clearByContactId(input: {
    workspaceId: string
    contactId: string
    tx?: DatabaseClient
  }): Promise<void> {
    const { tx = db } = input
    await tx
      .delete(contactCustomFieldModel)
      .where(eq(contactCustomFieldModel.contactId, input.contactId))
    await this.invalidate(input)
  }

  async deleteByCustomFieldId(
    input: DeleteByCustomFieldIdInput,
  ): Promise<void> {
    const { workspaceId, contactIds, customFieldId, tx = db } = input
    if (contactIds.length === 0) {
      return
    }

    await tx
      .delete(contactCustomFieldModel)
      .where(
        and(
          inArray(contactCustomFieldModel.contactId, contactIds),
          eq(contactCustomFieldModel.customFieldId, customFieldId),
        ),
      )

    // Bulk delete stays event-free by design: emitting customFieldChanged per
    // contact would enqueue one trigger/webhook job per affected contact, so
    // clearing a field across a large audience could burst the queues. The
    // single-contact clear (deleteByKey / flow-step clearContactCustomField) is
    // the only delete that emits. Cache is invalidated in one batched call.
    await this.invalidateCacheTags(contactCacheTags(workspaceId, contactIds))
  }

  /**
   * Rewrites stored values after select / multiSelect options were renamed so
   * contacts keep their choice. All renames run as ONE statement through an
   * index lookup (`from[i] -> to[i]`), so swapping two labels cannot cascade.
   * Event-free like the other bulk writes. Write-only so it can run inside the
   * caller's transaction: returns the affected contact ids, which the caller
   * passes to `invalidateContacts` once committed.
   */
  async renameSelectOptionValues(input: {
    customFieldId: string
    type: string
    renames: { from: string; to: string }[]
    tx?: DatabaseClient
  }): Promise<string[]> {
    const { customFieldId, type, renames, tx = db } = input
    if (renames.length === 0 || !isSelectCustomFieldType(type)) {
      return []
    }

    const toArray = (values: string[]) =>
      sql`ARRAY[${sql.join(
        values.map((value) => sql`${value}`),
        sql`, `,
      )}]::text[]`
    const from = toArray(renames.map((rename) => rename.from))
    const to = toArray(renames.map((rename) => rename.to))
    const column = contactCustomFieldModel.value
    const renamePart = (part: SQL) =>
      sql`COALESCE((${to})[array_position(${from}, ${part})], ${part})`

    const nextValue =
      type === "select"
        ? renamePart(sql`${column}`)
        : sql`(SELECT string_agg(${renamePart(sql`btrim(part)`)}, ', ' ORDER BY ord) FROM unnest(string_to_array(${column}, ',')) WITH ORDINALITY AS parts(part, ord) WHERE btrim(part) <> '')`
    const matches =
      type === "select"
        ? sql`${column} = ANY(${from})`
        : sql`EXISTS (SELECT 1 FROM unnest(string_to_array(${column}, ',')) AS parts(part) WHERE btrim(part) = ANY(${from}))`

    const updated = await tx
      .update(contactCustomFieldModel)
      .set({ value: nextValue })
      .where(
        and(eq(contactCustomFieldModel.customFieldId, customFieldId), matches),
      )
      .returning({ contactId: contactCustomFieldModel.contactId })

    return updated.map((row) => row.contactId)
  }

  async invalidateContacts(input: {
    workspaceId: string
    contactIds: string[]
  }): Promise<void> {
    if (input.contactIds.length === 0) {
      return
    }
    await this.invalidateCacheTags(
      contactCacheTags(input.workspaceId, input.contactIds),
    )
  }

  async insertNormalizedValuesForNewContacts(
    input: InsertNormalizedValuesForNewContactsInput,
  ): Promise<void> {
    const { entries, tx = db } = input
    const values = entries.flatMap(({ contactId, fields }) =>
      fields.map((field) => ({
        id: createId(),
        contactId,
        customFieldId: field.customFieldId,
        value: field.value,
      })),
    )

    if (values.length === 0) {
      return
    }

    await tx.insert(contactCustomFieldModel).values(values)
  }

  async setValueByKey(input: SetValueByKeyInput): Promise<void> {
    const {
      workspaceId,
      contactId,
      keyword,
      value,
      sourceTimezoneOverride,
      temporalInputParsing,
      fillEmptyTemporalWithNow,
    } = input

    let customField: { id: string } | undefined

    if (isNumericId(keyword)) {
      customField = await db.query.customFieldModel.findFirst({
        where: { id: keyword, workspaceId },
        columns: { id: true },
      })
    }

    if (!customField) {
      customField = await db.query.customFieldModel.findFirst({
        where: { name: keyword, workspaceId },
        columns: { id: true },
      })
    }

    if (!customField) {
      throw notFoundException("Custom field not found")
    }

    await this.setValues({
      workspaceId,
      contactId,
      fields: [{ customFieldId: customField.id, value }],
      sourceTimezoneOverride,
      temporalInputParsing,
      fillEmptyTemporalWithNow,
    })
  }

  async deleteByKey(input: DeleteByKeyInput): Promise<void> {
    const { workspaceId, contactId, keyword } = input

    let customField: { id: string; name: string } | undefined

    if (isNumericId(keyword)) {
      customField = await db.query.customFieldModel.findFirst({
        where: { id: keyword, workspaceId },
        columns: { id: true, name: true },
      })
    }

    if (!customField) {
      customField = await db.query.customFieldModel.findFirst({
        where: { name: keyword, workspaceId },
        columns: { id: true, name: true },
      })
    }

    if (!customField) {
      throw notFoundException("Custom field not found")
    }

    // Single-contact clear is the only delete that emits a change event. Snapshot
    // the value BEFORE deleting so we emit an accurate value -> null and stay
    // silent on a no-op delete (the contact never held the field). The bulk path
    // owns the delete + batched cache invalidation; emission is bounded to one
    // event here, which is queue-safe unlike a per-contact fan-out.
    const oldValue = await this.findValue({
      contactId,
      customFieldId: customField.id,
    })

    await this.deleteByCustomFieldId({
      workspaceId,
      contactIds: [contactId],
      customFieldId: customField.id,
    })

    if (oldValue === null) {
      return
    }

    emitCustomFieldChanged(
      workspaceId,
      contactId,
      customField.id,
      customField.name,
      oldValue,
      null,
    ).catch((error: unknown) => {
      logger.warn(
        { err: error, workspaceId, contactId, customFieldId: customField.id },
        "Failed to emit customFieldChanged event",
      )
    })
  }

  async invalidate(props: {
    workspaceId: string
    contactId: string
  }): Promise<void> {
    await this.invalidateCacheTags(
      contactCacheTags(props.workspaceId, [props.contactId]),
    )
  }
}

export const contactCustomFieldService = new ContactCustomFieldService()

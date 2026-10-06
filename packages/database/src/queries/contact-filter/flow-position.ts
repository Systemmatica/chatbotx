import { type SQL, sql } from "drizzle-orm"
import { operatorTypes } from "../../partials"
import { contactInboxModel } from "../../schema"
import { existsWhere } from "./exists"
import { buildLatestContactInboxMinutesAgoWhere } from "./predicates"
import type { ContactWhere } from "./types"

/**
 * Flow-position filter fields (`currentFlow`, `currentFlowNode`,
 * `currentNodeMinutesAgo`) read the position the worker records on
 * `ContactInbox` (`currentFlowId` / `currentNodeId` / `currentNodeAt`).
 *
 * A contact may have several inboxes. All three fields evaluate the SAME row:
 * the inbox with the most recent `currentNodeAt` — the contact's "current
 * step", exactly what the inbox list / contact panel show
 * (`pickLatestCurrentFlowNode`, `currentFlowStepService.resolveForContact`).
 * `currentNodeMinutesAgo` uses `MAX(currentNodeAt)`, which is that row's
 * timestamp. Evaluating per "latest row" instead of "any inbox" keeps
 * `currentFlowNode = X AND currentNodeMinutesAgo > N` correlated: with an
 * any-inbox EXISTS the two conditions could be satisfied by two different
 * inboxes (stale position on one channel, fresh activity on another) and a
 * contact who is actively moving would be reported as stuck.
 */

const FLOW_ID_PATTERN = /^\d+$/

/** Fails closed: a malformed value must never widen a broadcast audience. */
const MATCH_NOTHING: ContactWhere = { RAW: (): SQL => sql`FALSE` }

const POSITIVE_OPERATORS = new Set<string>([operatorTypes.enum.eq])
const NEGATIVE_OPERATORS = new Set<string>([operatorTypes.enum.ne])

/**
 * `EXISTS` over the contact's latest recorded position, filtered by
 * `predicate`; negated, it also matches contacts that never entered a flow
 * (no position = "is not" anything), so `ne` keeps three-valued-logic
 * semantics without a NULL check.
 */
const latestPositionWhere = (predicate: SQL, negate: boolean): ContactWhere =>
  existsWhere(
    (contactId) => sql`SELECT 1 FROM (
        SELECT ${contactInboxModel.currentFlowId} AS "flowId", ${contactInboxModel.currentNodeId} AS "nodeId"
        FROM ${contactInboxModel}
        WHERE ${contactInboxModel.contactId} = ${contactId}
          AND ${contactInboxModel.currentNodeAt} IS NOT NULL
        ORDER BY ${contactInboxModel.currentNodeAt} DESC
        LIMIT 1
      ) AS "currentPosition"
      WHERE ${predicate}`,
    negate,
  )

const resolvePolarity = (operator: string): boolean | undefined => {
  if (POSITIVE_OPERATORS.has(operator)) {
    return false
  }
  if (NEGATIVE_OPERATORS.has(operator)) {
    return true
  }
  return
}

const isFlowId = (value: unknown): value is string =>
  typeof value === "string" && FLOW_ID_PATTERN.test(value)

const isNodeId = (value: unknown): value is string =>
  typeof value === "string" && value.trim() !== ""

/** `currentFlow` is / is not `<flowId>`. */
export function buildCurrentFlowWhere(
  operator: string,
  value: unknown,
): ContactWhere {
  const negate = resolvePolarity(operator)
  if (negate === undefined) {
    return {}
  }
  if (!isFlowId(value)) {
    return MATCH_NOTHING
  }
  return latestPositionWhere(
    sql`"currentPosition"."flowId" = ${value}::int8`,
    negate,
  )
}

/**
 * Splits a `currentFlowNode` condition value: `[flowId, nodeId]` (what the
 * builder stores).
 */
export const parseFlowNodeValue = (
  value: unknown,
): { flowId: string; nodeId: string } | undefined => {
  if (!(Array.isArray(value) && value.length === 2)) {
    return
  }
  const [flowId, nodeId] = value
  return isFlowId(flowId) && isNodeId(nodeId) ? { flowId, nodeId } : undefined
}

/** `currentFlowNode` is / is not `[flowId, nodeId]`. */
export function buildCurrentFlowNodeWhere(
  operator: string,
  value: unknown,
): ContactWhere {
  const negate = resolvePolarity(operator)
  if (negate === undefined) {
    return {}
  }
  const parsed = parseFlowNodeValue(value)
  if (!parsed) {
    return MATCH_NOTHING
  }
  return latestPositionWhere(
    sql`"currentPosition"."flowId" = ${parsed.flowId}::int8 AND "currentPosition"."nodeId" = ${parsed.nodeId}`,
    negate,
  )
}

/**
 * Minutes the contact has been on its current step: `NOW() - MAX(currentNodeAt)`
 * across its inboxes. Same operator semantics and SQL shape as
 * `lastInteractionMinutesAgo`.
 */
export function buildCurrentNodeMinutesAgoWhere(
  operator: string,
  value: unknown,
): ContactWhere {
  return buildLatestContactInboxMinutesAgoWhere(
    contactInboxModel.currentNodeAt,
    operator,
    value,
  )
}

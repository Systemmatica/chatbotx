/**
 * Re-entering the same node within this window does not rewrite
 * `ContactInbox.currentNodeAt`. Writes for a *different* node are never
 * skipped — that change is the whole point of the column.
 *
 * Why 60 s: same-node re-entries come in bursts (a cyclic flow tripping the
 * MAX_NODE_EXECUTIONS loop guard, repeated taps on a button that routes back
 * to its own node, a contact spamming a keyword that restarts the same
 * flow). Skipping them inside a minute removes the write storm, while the
 * timestamp stays accurate enough for "stuck for N hours/days" — the only
 * question the column answers.
 */
export const CURRENT_FLOW_NODE_REFRESH_MS = 60_000

export type CurrentFlowNodeState = {
  currentFlowId?: string | null
  currentNodeId?: string | null
  /** May arrive as an ISO string when the row was serialized into a job. */
  currentNodeAt?: Date | string | null
}

export type NextFlowNode = {
  flowId: string
  nodeId: string
}

const toTime = (value: Date | string | null | undefined): number | null => {
  if (value === null || value === undefined) {
    return null
  }
  const time = value instanceof Date ? value.getTime() : Date.parse(value)
  return Number.isNaN(time) ? null : time
}

/**
 * Whether entering `next` must be recorded on top of the `previous` state.
 *
 * The worker calls this with the ContactInbox row it loaded at job start to
 * skip the DB round trip entirely in the burst case. The same rule is
 * repeated as a SQL guard in `ContactInboxService.recordCurrentFlowNode`, so
 * when the snapshot says "write" but the DB already holds a fresh identical
 * value, the UPDATE matches no row and writes nothing.
 */
export function shouldRecordCurrentFlowNode(
  previous: CurrentFlowNodeState | null | undefined,
  next: NextFlowNode,
  now: Date = new Date(),
  refreshMs: number = CURRENT_FLOW_NODE_REFRESH_MS,
): boolean {
  if (!previous) {
    return true
  }
  if (
    previous.currentFlowId !== next.flowId ||
    previous.currentNodeId !== next.nodeId
  ) {
    return true
  }
  const previousAt = toTime(previous.currentNodeAt)
  if (previousAt === null) {
    return true
  }
  // A clock-skewed future timestamp counts as fresh (no rewrite needed).
  return now.getTime() - previousAt >= refreshMs
}

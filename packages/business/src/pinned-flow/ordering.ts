/** How many pinned flows a member keeps per workspace (sidebar quick links). */
export const MAX_PINNED_FLOWS = 8

export type PinnedFlowEntry = {
  flowId: string
  name: string
  pinnedAt: Date
}

/**
 * Sidebar order: oldest pin first (a new pin goes to the bottom, so links do
 * not jump around), ties broken by flow id, capped at `max`.
 */
export const orderPinnedFlows = <T extends PinnedFlowEntry>(
  entries: readonly T[],
  max: number = MAX_PINNED_FLOWS,
): T[] =>
  [...entries]
    .sort(
      (a, b) =>
        a.pinnedAt.getTime() - b.pinnedAt.getTime() ||
        a.flowId.localeCompare(b.flowId),
    )
    .slice(0, Math.max(0, max))

/** Whether one more pin fits under the limit. */
export const canPinMoreFlows = (
  pinnedCount: number,
  max: number = MAX_PINNED_FLOWS,
): boolean => pinnedCount < max

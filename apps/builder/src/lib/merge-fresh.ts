/**
 * Helpers that apply a background refetch over data already on screen without
 * needless re-renders: unchanged objects keep their identity (memoized rows
 * and cards skip rendering) and an unchanged result returns the current value
 * itself (React bails out of the state update).
 */

/** Structural equality for JSON-shaped API data (dates compare as ISO). */
export const isSameData = (a: unknown, b: unknown): boolean =>
  a === b || JSON.stringify(a) === JSON.stringify(b)

const sameItems = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item, index) => item === b[index])

/**
 * `fresh` with every top-level field that did not change taken from
 * `current`; `current` itself when nothing changed.
 */
export function reuseUnchanged<T extends object>(current: T, fresh: T): T {
  if (current === fresh) {
    return current
  }
  let changed = false
  const result = { ...fresh }
  for (const key of Object.keys(fresh) as (keyof T)[]) {
    if (isSameData(current[key], fresh[key])) {
      result[key] = current[key]
    } else {
      changed = true
    }
  }
  if (!changed && Object.keys(current).length === Object.keys(fresh).length) {
    return current
  }
  return result
}

/**
 * Replaces a list with a refetched one (same page, server order), reusing the
 * current objects that did not change. Returns `current` when nothing did.
 */
export function reconcileList<T>(
  current: readonly T[],
  fresh: readonly T[],
  getId: (item: T) => string,
): T[] {
  const byId = new Map(current.map((item) => [getId(item), item]))
  const result = fresh.map((item) => {
    const previous = byId.get(getId(item))
    return previous !== undefined && isSameData(previous, item)
      ? previous
      : item
  })
  return sameItems(result, current) ? (current as T[]) : result
}

/**
 * Merges a refetched first page into a list that may hold more pages:
 *
 * - items of the fresh page come in server order (new ones included);
 * - current items missing from the fresh page stay: those listed before the
 *   first item both lists share (pinned on top, e.g. a deep-linked chat) keep
 *   their place, the rest (later pages) follow the fresh page;
 * - `pick` decides between the current and the fresh copy of an item (e.g. to
 *   keep a realtime update newer than the refetch); unchanged items keep
 *   their identity, and an unchanged list returns `current`.
 */
export function mergeFreshHead<T>(
  current: readonly T[],
  freshHead: readonly T[],
  getId: (item: T) => string,
  pick: (current: T, fresh: T) => T = (_current, fresh) => fresh,
): T[] {
  const freshIds = new Set(freshHead.map(getId))
  const byId = new Map(current.map((item) => [getId(item), item]))
  const firstShared = current.findIndex((item) => freshIds.has(getId(item)))
  const pinned =
    firstShared === -1
      ? []
      : current
          .slice(0, firstShared)
          .filter((item) => !freshIds.has(getId(item)))
  const rest = current
    .slice(firstShared === -1 ? 0 : firstShared)
    .filter((item) => !freshIds.has(getId(item)))

  const head = freshHead.map((item) => {
    const previous = byId.get(getId(item))
    if (previous === undefined) {
      return item
    }
    const chosen = pick(previous, item)
    return isSameData(previous, chosen) ? previous : chosen
  })

  const result = [...pinned, ...head, ...rest]
  return sameItems(result, current) ? (current as T[]) : result
}

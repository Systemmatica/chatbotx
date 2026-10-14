/**
 * How often screens showing server data that can change while they are open
 * (inbox list, contact card, kanban board, contacts table) refetch it in the
 * background, and how often relative time labels ("5 минут назад") re-render.
 * Background refreshes run only while the tab is visible.
 */
export const LIVE_REFRESH_INTERVAL_MS = 5000

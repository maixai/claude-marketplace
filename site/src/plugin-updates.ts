export const RECENT_UPDATE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000

export function isRecentlyUpdated(updatedAt: string | null, now = Date.now()): boolean {
  if (!updatedAt) return false

  const updatedTimestamp = Date.parse(updatedAt)
  if (!Number.isFinite(updatedTimestamp)) return false

  const elapsed = now - updatedTimestamp
  return elapsed >= 0 && elapsed <= RECENT_UPDATE_WINDOW_MS
}

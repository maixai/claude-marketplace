import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { isRecentlyUpdated, RECENT_UPDATE_WINDOW_MS } from './plugin-updates.ts'

const NOW = Date.parse('2026-11-10T12:00:00.000Z')

describe('isRecentlyUpdated', () => {
  it('accepts updates within the last seven days', () => {
    assert.equal(isRecentlyUpdated(new Date(NOW).toISOString(), NOW), true)
    assert.equal(isRecentlyUpdated('2026-11-10T11:59:59.000Z', NOW), true)
    assert.equal(isRecentlyUpdated(new Date(NOW - RECENT_UPDATE_WINDOW_MS).toISOString(), NOW), true)
  })

  it('rejects updates older than seven days', () => {
    assert.equal(isRecentlyUpdated(new Date(NOW - RECENT_UPDATE_WINDOW_MS - 1).toISOString(), NOW), false)
  })

  it('rejects missing, invalid and future timestamps', () => {
    assert.equal(isRecentlyUpdated(null, NOW), false)
    assert.equal(isRecentlyUpdated('', NOW), false)
    assert.equal(isRecentlyUpdated('not-a-date', NOW), false)
    assert.equal(isRecentlyUpdated('2026-11-10T12:00:01.000Z', NOW), false)
  })
})

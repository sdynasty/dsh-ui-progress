import { describe, expect, it } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CompletionLogStorage } from '../src/client/completion-log.ts'
import { createRunClock, RUN_CLOCK_STORAGE_KEY } from '../src/client/run-clock.ts'

const sid = (id: string): SessionId => id as SessionId

function memoryStorage(initial?: string): CompletionLogStorage & { readonly writes: string[] } {
  const writes: string[] = []
  let value = initial ?? null
  return {
    writes,
    getItem: () => value,
    setItem: (_key, next) => { value = next; writes.push(next) },
  }
}

function summary(id: string, over: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id: sid(id),
    displayTitle: `title-${id}`,
    running: false,
    retainedBy: {},
    blank: false,
    updatedAt: 1000,
    ...over,
  }
}

function listOf(rows: SessionSummary[], phase: 'pending' | 'ready' = 'ready'): SessionListState {
  const byId: SessionListState['byId'] = {}
  for (const row of rows) byId[row.id] = row
  return { ids: rows.map(row => row.id), byId, phase, projectionsBySession: {} }
}

describe('createRunClock', () => {
  it('starts timing when a run is first seen and stops when it ends', () => {
    let now = 1000
    const storage = memoryStorage()
    const clock = createRunClock(storage, () => now)
    const list = listOf([summary('a', { running: true })])
    clock.observe(list, new Map())
    expect(clock.source.getSnapshot().get(sid('a'))).toBe(1000)
    // A later observation of the same run keeps the original start.
    now = 1600
    clock.observe(list, new Map())
    expect(clock.source.getSnapshot().get(sid('a'))).toBe(1000)
    // The run ends: the entry leaves the clock and the persisted map.
    clock.observe(listOf([summary('a')]), new Map())
    expect(clock.source.getSnapshot().size).toBe(0)
    expect(storage.writes.at(-1)).toBe('[]')
  })

  it('counts pending interaction as running and ignores blank/subagent rows', () => {
    const clock = createRunClock(memoryStorage(), () => 1000)
    const pending = new Map([[sid('p'), { running: false, pendingInteraction: { key: 'k', kind: 'approval', sessionId: sid('p') }, completionUnread: false }]]) as SessionStatusSnapshot
    const list = listOf([
      summary('p'),
      summary('blank', { blank: true }),
      summary('child', { parentId: sid('p'), origin: 'subagent', running: true }),
    ])
    clock.observe(list, pending)
    expect([...clock.source.getSnapshot().keys()]).toEqual([sid('p')])
  })

  it('restores across reloads and prunes sessions the host forgot', () => {
    const persisted = JSON.stringify([[sid('a'), 900], ['bogus'] as unknown, ['x', 'bad'] as unknown])
    const clock = createRunClock(memoryStorage(persisted), () => 2000)
    expect(clock.source.getSnapshot().get(sid('a'))).toBe(900)
    // Still running after reload: entry survives untouched.
    clock.observe(listOf([summary('a', { running: true })]), new Map())
    expect(clock.source.getSnapshot().get(sid('a'))).toBe(900)
    // Host forgot the session on a ready list: pruned.
    clock.observe(listOf([], 'ready'), new Map())
    expect(clock.source.getSnapshot().size).toBe(0)
  })

  it('keeps entries while the list is still pending and republishes stable snapshots', () => {
    const clock = createRunClock(memoryStorage(), () => 1000)
    clock.observe(listOf([summary('a', { running: true })]), new Map())
    const before = clock.source.getSnapshot()
    clock.observe(listOf([], 'pending'), new Map())
    expect(clock.source.getSnapshot().get(sid('a'))).toBe(1000)
    clock.observe(listOf([summary('a', { running: true })]), new Map())
    expect(clock.source.getSnapshot()).toBe(before)
  })

  it('uses the versioned storage key', () => {
    expect(RUN_CLOCK_STORAGE_KEY).toBe('dsh.ui-progress.run-clock.v1')
  })
})

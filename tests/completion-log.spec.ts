import { describe, expect, it } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import {
  COMPLETION_LOG_STORAGE_KEY,
  createCompletionLog,
  type CompletionLogStorage,
} from '../src/client/completion-log.ts'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'

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

function workspacesOf(archived: string[] = []): WorkspaceSnapshot {
  return {
    items: [],
    archivedSessionIds: archived.map(sid),
    pinnedSessionIds: [],
    state: 'idle',
    phase: 'ready',
    error: null,
  } as unknown as WorkspaceSnapshot
}

function unread(id: string): SessionStatusSnapshot {
  return new Map([[sid(id), { running: false, pendingInteraction: undefined, completionUnread: true }]])
}

describe('createCompletionLog', () => {
  it('records an observed completion once and persists it', () => {
    const storage = memoryStorage()
    const log = createCompletionLog(storage, () => 5000)
    const list = listOf([summary('a')])
    log.observe(list, unread('a'), workspacesOf())
    log.observe(list, unread('a'), workspacesOf())
    const { entries } = log.source.getSnapshot()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ sessionId: sid('a'), completedAt: 5000, title: 'title-a' })
    expect(storage.writes).toHaveLength(1)
  })

  it('keeps the snapshot identity stable when nothing changed', () => {
    const log = createCompletionLog(memoryStorage(), () => 5000)
    const list = listOf([summary('a')])
    log.observe(list, new Map(), workspacesOf())
    const before = log.source.getSnapshot()
    log.observe(list, new Map(), workspacesOf())
    expect(log.source.getSnapshot()).toBe(before)
  })

  it('notifies subscribers on change', () => {
    const log = createCompletionLog(memoryStorage(), () => 5000)
    let calls = 0
    const off = log.source.subscribe(() => { calls += 1 })
    log.observe(listOf([summary('a')]), unread('a'), workspacesOf())
    expect(calls).toBe(1)
    off()
    log.observe(listOf([summary('b')]), unread('b'), workspacesOf())
    expect(calls).toBe(1)
  })

  it('prunes archived and forgotten sessions but survives a pending list', () => {
    const storage = memoryStorage()
    const log = createCompletionLog(storage, () => 5000)
    log.observe(listOf([summary('a'), summary('b')]), unread('a'), workspacesOf())
    log.observe(listOf([summary('a'), summary('b')]), unread('b'), workspacesOf())
    expect(log.source.getSnapshot().entries).toHaveLength(2)
    log.observe(listOf([], 'pending'), new Map(), workspacesOf())
    expect(log.source.getSnapshot().entries).toHaveLength(2)
    log.observe(listOf([summary('a')]), new Map(), workspacesOf(['b']))
    expect(log.source.getSnapshot().entries.map(entry => entry.sessionId)).toEqual([sid('a')])
  })

  it('skips subagent rows and restores a persisted log', () => {
    const persisted = JSON.stringify([
      { sessionId: 'old', completedAt: 4000, title: 'title-old' },
      { sessionId: 'bogus' },
    ])
    const log = createCompletionLog(memoryStorage(persisted), () => 5000)
    expect(log.source.getSnapshot().entries).toHaveLength(1)
    const child = summary('child', { parentId: sid('p'), origin: 'subagent' })
    log.observe(listOf([summary('old'), child]), unread('child'), workspacesOf())
    expect(log.source.getSnapshot().entries.map(entry => entry.sessionId)).toEqual([sid('old')])
  })

  it('expires entries past the age bound', () => {
    const storage = memoryStorage()
    let now = 5000
    const log = createCompletionLog(storage, () => now)
    log.observe(listOf([summary('a')]), unread('a'), workspacesOf())
    now += 31 * 24 * 60 * 60 * 1000
    log.observe(listOf([summary('a')]), new Map(), workspacesOf())
    expect(log.source.getSnapshot().entries).toEqual([])
  })

  it('tolerates a blocked storage and a corrupt payload', () => {
    const blocked: CompletionLogStorage = {
      getItem: () => '{not json',
      setItem: () => { throw new Error('quota') },
    }
    const log = createCompletionLog(blocked, () => 5000)
    expect(log.source.getSnapshot().entries).toEqual([])
    log.observe(listOf([summary('a')]), unread('a'), workspacesOf())
    expect(log.source.getSnapshot().entries).toHaveLength(1)
  })
})

describe('COMPLETION_LOG_STORAGE_KEY', () => {
  it('is versioned with the entry fields', () => {
    expect(COMPLETION_LOG_STORAGE_KEY).toBe('dsh.ui-progress.completion-log.v1')
  })
})

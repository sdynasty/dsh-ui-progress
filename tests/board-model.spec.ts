import { describe, expect, it } from 'vitest'
import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { deriveBoard, workspaceOfSession } from '../src/client/board-model.ts'

const sid = (id: string): SessionId => id as SessionId
const wid = (id: string): WorkspaceId => id as WorkspaceId

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

function listOf(rows: SessionSummary[]): SessionListState {
  const byId: SessionListState['byId'] = {}
  for (const row of rows) byId[row.id] = row
  return { ids: rows.map(row => row.id), byId, phase: 'ready', projectionsBySession: {} }
}

function workspacesOf(
  items: Array<{ id: string; sessionIds: string[] }>,
  archived: string[] = [],
): WorkspaceSnapshot {
  return {
    items: items.map(item => ({
      workspaceId: wid(item.id),
      path: `/tmp/${item.id}`,
      title: item.id,
      sessionIds: item.sessionIds.map(sid),
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    })),
    archivedSessionIds: archived.map(sid),
    pinnedSessionIds: [],
    state: 'idle',
    phase: 'ready',
    error: null,
  } as unknown as WorkspaceSnapshot
}

describe('workspaceOfSession', () => {
  it('resolves membership and the ungrouped bucket', () => {
    const items = [{ workspaceId: wid('ws1'), sessionIds: [sid('a')] }]
    expect(workspaceOfSession(items, sid('a'))).toBe(wid('ws1'))
    expect(workspaceOfSession(items, sid('b'))).toBeUndefined()
  })
})

describe('deriveBoard', () => {
  it('buckets running, pending, and unviewed-completion rows', () => {
    const list = listOf([
      summary('running', { running: true }),
      summary('pending', { running: true }),
      summary('done'),
      summary('idle'),
    ])
    const statuses = new Map([
      [sid('pending'), {
        running: true,
        pendingInteraction: { key: 'k1', kind: 'approval', sessionId: sid('pending') },
        completionUnread: false,
      }],
      [sid('done'), { running: false, pendingInteraction: undefined, completionUnread: true }],
    ]) as SessionStatusSnapshot
    const board = deriveBoard(list, statuses, workspacesOf([{ id: 'ws1', sessionIds: ['running'] }]))
    expect(board.running.map(row => row.id)).toEqual([sid('pending'), sid('running')])
    expect(board.unreadDone.map(row => row.id)).toEqual([sid('done')])
    expect(board.counts).toEqual({ running: 2, pending: 1, unreadDone: 1, badge: 3 })
    expect(board.running[0]?.workspaceId).toBeUndefined()
    expect(board.running[1]?.workspaceId).toBe(wid('ws1'))
  })

  it('counts running subagents on the parent and hides the child row', () => {
    const list = listOf([summary('parent', { running: true })])
    list.byId[sid('child')] = summary('child', { parentId: sid('parent'), origin: 'subagent', running: true })
    const board = deriveBoard(list, new Map(), workspacesOf([]))
    expect(board.running).toHaveLength(1)
    expect(board.running[0]?.id).toBe(sid('parent'))
    expect(board.running[0]?.runningSubagents).toBe(1)
  })

  it('drops blank, archived, and quiet idle rows', () => {
    const list = listOf([
      summary('blank', { blank: true }),
      summary('archived', { running: true }),
      summary('quiet'),
    ])
    const board = deriveBoard(list, new Map(), workspacesOf([], ['archived']))
    expect(board.running).toEqual([])
    expect(board.unreadDone).toEqual([])
    expect(board.counts.badge).toBe(0)
  })

  it('falls back to the summary running flag before any status arrives', () => {
    const board = deriveBoard(listOf([summary('stale', { running: true })]), new Map(), workspacesOf([]))
    expect(board.running.map(row => row.id)).toEqual([sid('stale')])
  })
})

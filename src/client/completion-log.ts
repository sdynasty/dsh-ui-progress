/**
 * Completion history behind the board's Done section. The live
 * `completionUnread` flag answers "finished and not yet opened", but it clears
 * on first view; this log remembers when each completion was first observed so
 * the section keeps a day-grouped history afterwards. The log is viewing
 * state, not business data: it derives entirely from root snapshots, persists
 * to `localStorage` only to survive reloads, and prunes entries whose Session
 * was archived or forgotten by the Host list.
 */

import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import { workspaceOfSession } from './board-model.ts'

/** localStorage key of the persisted log (versioned with the entry fields). */
export const COMPLETION_LOG_STORAGE_KEY = 'dsh.ui-progress.completion-log.v1'

/** One remembered completion, snapshotted at first observation. */
export interface CompletionLogEntry {
  readonly sessionId: SessionId
  /** Epoch ms when the completion was first observed locally. */
  readonly completedAt: number
  /** Display title at observation time; the live row may later vanish. */
  readonly title: string
  /** Owning Workspace at observation time, absent for the ungrouped bucket. */
  readonly workspaceId: WorkspaceId | undefined
}

/** Identity-stable log snapshot: entries newest first. */
export interface CompletionLogSnapshot {
  readonly entries: readonly CompletionLogEntry[]
}

/** The minimal storage face the log needs (injectable for tests). */
export interface CompletionLogStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/** Observation-driven completion log with snapshot identity stability. */
export interface CompletionLog {
  /** Bare observable bound to the `useCompletionLog` hook by the renderer. */
  readonly source: HostObservable<CompletionLogSnapshot>
  /**
   * Fold the current root snapshots into the log: record newly observed
   * completions and prune archived or forgotten Sessions.
   * @param list - Host Session list snapshot.
   * @param statuses - unified per-Session UI status facts.
   * @param workspaces - Workspace registry snapshot supplying the archive set.
   */
  observe(
    list: SessionListState,
    statuses: SessionStatusSnapshot,
    workspaces: WorkspaceSnapshot,
  ): void
}

/** Log bounds: at most 50 entries, none older than 30 days. */
const MAX_ENTRIES = 50
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

function isEntry(value: unknown): value is CompletionLogEntry {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.sessionId === 'string'
    && typeof candidate.completedAt === 'number'
    && typeof candidate.title === 'string'
}

function readPersisted(storage: CompletionLogStorage | undefined): CompletionLogEntry[] {
  if (storage === undefined) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(COMPLETION_LOG_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isEntry) : []
  } catch (error) {
    // A corrupt or unreadable payload is viewing state: start empty rather
    // than block the board.
    console.warn('ui-progress: ignoring unreadable completion log', error)
    return []
  }
}

/**
 * Create the completion log.
 * @param storage - persistence target; defaults to `localStorage` when present.
 * @param now - clock, injectable for tests.
 * @returns the observable source plus the snapshot fold.
 */
export function createCompletionLog(
  storage: CompletionLogStorage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
  now: () => number = () => Date.now(),
): CompletionLog {
  let entries = readPersisted(storage)
  let snapshot: CompletionLogSnapshot = { entries }
  const listeners = new Set<() => void>()

  const publish = (next: CompletionLogEntry[]): void => {
    entries = next
    snapshot = { entries }
    if (storage !== undefined) {
      try {
        storage.setItem(COMPLETION_LOG_STORAGE_KEY, JSON.stringify(entries))
      } catch (error) {
        // Persistence is best-effort: a full or blocked store degrades the
        // history to per-session memory without failing the board.
        console.warn('ui-progress: could not persist the completion log', error)
      }
    }
    for (const listener of listeners) listener()
  }

  return {
    source: {
      getSnapshot: () => snapshot,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    observe(list, statuses, workspaces) {
      const archived = new Set<SessionId>(workspaces.archivedSessionIds)
      const cutoff = now() - MAX_AGE_MS
      let next = entries.filter(entry =>
        entry.completedAt >= cutoff
        && !archived.has(entry.sessionId)
        // The Host list is authoritative: a Session it no longer knows leaves
        // the log as well. Before the first ready list arrives, keep everything.
        && (list.phase !== 'ready' || list.byId[entry.sessionId] !== undefined))
      let changed = next.length !== entries.length
      const known = new Set(next.map(entry => entry.sessionId))
      for (const id of list.ids) {
        if (known.has(id) || archived.has(id)) continue
        if (statuses.get(id)?.completionUnread !== true) continue
        const summary = list.byId[id]
        if (summary === undefined || summary.origin === 'subagent') continue
        next = [{
          sessionId: id,
          completedAt: now(),
          title: summary.displayTitle,
          workspaceId: workspaceOfSession(workspaces.items, id),
        }, ...next]
        known.add(id)
        changed = true
      }
      if (!changed) return
      publish(next.slice(0, MAX_ENTRIES))
    },
  }
}

/**
 * Run-start clock behind the Running cards' elapsed-time line. The Host
 * reports that a Session is running but not since when, so this observer
 * records the first moment each run is seen and forgets it when the run ends.
 * The map persists to `localStorage` so a page reload keeps the elapsed time
 * honest; a run already in progress when the plugin loads starts counting
 * from that load. Viewing state only — it never feeds back into Session data.
 */

import type { SessionListState } from '@deepseek-ai/dsh-api-session-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { HostObservable } from '@deepseek-ai/dsh-client-ui-slots'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { CompletionLogStorage } from './completion-log.ts'

/** localStorage key of the persisted clock (versioned with the entry shape). */
export const RUN_CLOCK_STORAGE_KEY = 'dsh.ui-progress.run-clock.v1'

/** Observation-driven run-start clock with snapshot identity stability. */
export interface RunClock {
  /** Bare observable of Session id → run-start epoch ms. */
  readonly source: HostObservable<ReadonlyMap<SessionId, number>>
  /**
   * Fold the current snapshots into the clock: start timing newly running
   * Sessions, stop timing ones that went quiet, prune forgotten Sessions.
   * @param list - Host Session list snapshot.
   * @param statuses - unified per-Session UI status facts.
   */
  observe(list: SessionListState, statuses: SessionStatusSnapshot): void
}

type RunClockEntry = readonly [SessionId, number]

function isEntry(value: unknown): value is RunClockEntry {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === 'string'
    && typeof value[1] === 'number'
}

function readPersisted(storage: Pick<Storage, 'getItem'> | undefined): RunClockEntry[] {
  if (storage === undefined) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(RUN_CLOCK_STORAGE_KEY) ?? '[]')
    return Array.isArray(parsed) ? parsed.filter(isEntry) : []
  } catch (error) {
    // A corrupt or unreadable payload is viewing state: start empty rather
    // than block the board.
    console.warn('ui-progress: ignoring unreadable run clock', error)
    return []
  }
}

/**
 * Create the run-start clock.
 * @param storage - persistence target; defaults to `localStorage` when present.
 * @param now - clock, injectable for tests.
 * @returns the observable source plus the snapshot fold.
 */
export function createRunClock(
  storage: CompletionLogStorage | undefined = typeof localStorage === 'undefined' ? undefined : localStorage,
  now: () => number = () => Date.now(),
): RunClock {
  let entries: ReadonlyMap<SessionId, number> = new Map(readPersisted(storage))
  const listeners = new Set<() => void>()

  const publish = (next: Map<SessionId, number>): void => {
    entries = next
    if (storage !== undefined) {
      try {
        storage.setItem(RUN_CLOCK_STORAGE_KEY, JSON.stringify([...next]))
      } catch (error) {
        // Persistence is best-effort: a full or blocked store degrades the
        // clock to per-page memory without failing the board.
        console.warn('ui-progress: could not persist the run clock', error)
      }
    }
    for (const listener of listeners) listener()
  }

  return {
    source: {
      getSnapshot: () => entries,
      subscribe: (listener) => {
        listeners.add(listener)
        return () => { listeners.delete(listener) }
      },
    },
    observe(list, statuses) {
      let next: Map<SessionId, number> | undefined
      const edit = (): Map<SessionId, number> => {
        next ??= new Map(entries)
        return next
      }
      for (const id of list.ids) {
        const summary = list.byId[id]
        if (summary === undefined || summary.blank || summary.origin === 'subagent') continue
        const status = statuses.get(id)
        const running = status?.pendingInteraction !== undefined || (status?.running ?? summary.running)
        if (running && !entries.has(id) && !next?.has(id)) {
          edit().set(id, now())
        } else if (!running && (entries.has(id) || next?.has(id) === true)) {
          edit().delete(id)
        }
      }
      // The Host list is authoritative: a Session it no longer knows leaves
      // the clock as well. Before the first ready list arrives, keep every entry.
      if (list.phase === 'ready') {
        for (const id of (next ?? entries).keys()) {
          if (list.byId[id] === undefined) edit().delete(id)
        }
      }
      if (next !== undefined) publish(next)
    },
  }
}

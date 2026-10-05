/**
 * Pure derivation of the progress board rows from the three root snapshots:
 * the Session list, the unified Session UI status map, and the Workspace
 * registry. Everything here is a function over snapshot data so the page and
 * the sidebar badge project the same facts without their own subscriptions.
 */

import type { SessionListState, SessionSummary } from '@deepseek-ai/dsh-api-session-controller/client'
import type { WorkspaceSnapshot } from '@deepseek-ai/dsh-api-workspace-controller/client'
import type { SessionStatusSnapshot } from '@deepseek-ai/dsh-client-ui-session/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'

/** One Session row as the board presents it. */
export interface BoardSession {
  readonly id: SessionId
  /** Human-facing label: durable title, project basename, then session id. */
  readonly title: string
  /** Owning Workspace, absent for the ungrouped bucket. */
  readonly workspaceId: WorkspaceId | undefined
  /** Pending-interaction domain kind while the Session awaits its user. */
  readonly pendingKind: string | undefined
  /** Own work is running (pending interaction counts as running). */
  readonly running: boolean
  /** Running direct children in the loaded subagent catalog. */
  readonly runningSubagents: number
  /** Finished while not selected and not yet opened. */
  readonly unread: boolean
  /** Epoch ms of the last host-reported update. */
  readonly updatedAt: number
}

/** Board projections shared by the page and the panel badge. */
export interface BoardProjection {
  /** Running or interaction-pending top-level Sessions, pending first, then recent. */
  readonly running: readonly BoardSession[]
  /** Completed-unviewed top-level Sessions, most recent first. */
  readonly unreadDone: readonly BoardSession[]
  readonly counts: {
    readonly running: number
    /** Members of `running` awaiting user interaction. */
    readonly pending: number
    readonly unreadDone: number
    /** Sidebar badge: every running row plus every unviewed completion. */
    readonly badge: number
  }
}

/** Workspace lookup row for filter options and card chips. */
export interface BoardWorkspace {
  readonly id: WorkspaceId
  readonly title: string
  readonly path: string
}

/**
 * Resolve the Workspace a Session belongs to, if any.
 * @param items - registry Workspace rows.
 * @param sessionId - Session to locate.
 * @returns the owning Workspace id, or undefined for the ungrouped bucket.
 */
export function workspaceOfSession(
  items: readonly { workspaceId: WorkspaceId; sessionIds: readonly SessionId[] }[],
  sessionId: SessionId,
): WorkspaceId | undefined {
  return items.find(workspace => workspace.sessionIds.includes(sessionId))?.workspaceId
}

/**
 * Project the board rows from the live snapshots.
 * @param list - Host Session list with live increments.
 * @param statuses - unified per-Session UI status facts.
 * @param workspaces - Workspace registry snapshot supplying the archive set.
 * @returns running and completed-unviewed rows plus the badge counts.
 */
export function deriveBoard(
  list: SessionListState,
  statuses: SessionStatusSnapshot,
  workspaces: WorkspaceSnapshot,
): BoardProjection {
  const archived = new Set<SessionId>(workspaces.archivedSessionIds)
  // Running direct children per parent, counted over the full byId map because
  // retained subagent rows are not Host-list members.
  const runningChildren = new Map<SessionId, number>()
  for (const summary of Object.values(list.byId)) {
    if (summary.parentId === undefined) continue
    const childRunning = statuses.get(summary.id)?.running ?? summary.running
    if (childRunning) {
      runningChildren.set(summary.parentId, (runningChildren.get(summary.parentId) ?? 0) + 1)
    }
  }
  const rows: BoardSession[] = []
  for (const id of list.ids) {
    const summary: SessionSummary | undefined = list.byId[id]
    // Blank rows are provisional New Session entries, and subagent rows surface
    // through their parent's counter instead of their own card.
    if (summary === undefined || summary.blank || summary.origin === 'subagent') continue
    if (archived.has(id)) continue
    const status = statuses.get(id)
    const pendingKind = status?.pendingInteraction?.kind
    const running = pendingKind !== undefined || (status?.running ?? summary.running)
    const unread = status?.completionUnread === true
    if (!running && !unread) continue
    rows.push({
      id,
      title: summary.displayTitle,
      workspaceId: workspaceOfSession(workspaces.items, id),
      pendingKind,
      running,
      runningSubagents: runningChildren.get(id) ?? 0,
      unread,
      updatedAt: summary.updatedAt,
    })
  }
  const running = rows
    .filter(row => row.running)
    .sort((left, right) => {
      // Awaiting the user outranks unattended work; recency breaks ties.
      const pendingDelta = Number(right.pendingKind !== undefined) - Number(left.pendingKind !== undefined)
      return pendingDelta !== 0 ? pendingDelta : right.updatedAt - left.updatedAt
    })
  const unreadDone = rows
    .filter(row => !row.running && row.unread)
    .sort((left, right) => right.updatedAt - left.updatedAt)
  const pending = running.filter(row => row.pendingKind !== undefined).length
  return {
    running,
    unreadDone,
    counts: {
      running: running.length,
      pending,
      unreadDone: unreadDone.length,
      badge: running.length + unreadDone.length,
    },
  }
}

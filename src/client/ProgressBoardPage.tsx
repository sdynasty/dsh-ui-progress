/**
 * Progress board main panel: Running and Done sections over every Workspace,
 * with a Workspace filter shared by both. All live facts arrive through the
 * root framework hooks; the completion history arrives through the injected
 * log the registration observes from `apply`.
 */

import { useMemo, useState, type ReactNode } from 'react'
import { SegmentedTabs } from '@deepseek-ai/dsh-client-ui-primitives'
import type { HostObservable, InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { WorkspaceId } from '@deepseek-ai/dsh-workspace/types'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { deriveBoard, type BoardSession } from './board-model.ts'
import type { CompletionLogSnapshot } from './completion-log.ts'
import { NS } from './locales.ts'
import { SessionCard, type SessionCardInjected } from './SessionCard.tsx'
import css from './ProgressBoardPage.module.css'

/** Injected completion history, run clock, and Session navigation for the board page. */
export interface ProgressBoardInjected extends SessionCardInjected {
  /** Completion history observed by the registration, bound to `useCompletionLog`. */
  readonly hooks: {
    readonly completionLog: HostObservable<CompletionLogSnapshot>
    /** Run-start instants observed by the registration, bound to `useRunClock`. */
    readonly runClock: HostObservable<ReadonlyMap<SessionId, number>>
  }
}

/** Root-scoped board props derived from the framework and injected actions. */
export type ProgressBoardPageProps = PropsRuntime<'main'>
  & InjectFace<ProgressBoardInjected>
  & PropsLocale<typeof NS>

type BoardTab = 'all' | 'running' | 'done'
/** Workspace filter value: a registry id, the ungrouped bucket, or every Workspace. */
type WorkspaceFilter = WorkspaceId | 'ungrouped' | 'all'

/** Cards the Done section shows before the Show-more toggle. */
const RECENT_DEFAULT_COUNT = 10

/**
 * Render the progress board.
 * @param props - root Session/Workspace hooks, the completion log, localized copy, and the open action.
 * @returns All/Running/Done sections with a shared Workspace filter; All leads.
 */
export function ProgressBoardPage(props: ProgressBoardPageProps): ReactNode {
  const { useSessions, useSessionStatus, useWorkspaces, useCompletionLog, useRunClock, onOpenSession, t } = props
  const list = useSessions(snapshot => snapshot)
  const statuses = useSessionStatus(snapshot => snapshot)
  const workspaces = useWorkspaces(snapshot => snapshot)
  const log = useCompletionLog(snapshot => snapshot)
  const runStarts = useRunClock(snapshot => snapshot)
  const [tab, setTab] = useState<BoardTab>('all')
  const [filter, setFilter] = useState<WorkspaceFilter>('all')

  const board = useMemo(
    () => deriveBoard(list, statuses, workspaces, runStarts),
    [list, statuses, workspaces, runStarts],
  )
  const inFilter = (workspaceId: WorkspaceId | undefined): boolean =>
    filter === 'all'
    || (filter === 'ungrouped' ? workspaceId === undefined : workspaceId === filter)
  const workspaceTitle = (id: WorkspaceId | undefined): string =>
    id === undefined
      ? t('filter.ungrouped')
      : workspaces.items.find(item => item.workspaceId === id)?.title ?? t('filter.ungrouped')

  const running = board.running.filter(row => inFilter(row.workspaceId))
  const unreadDone = board.unreadDone.filter(row => inFilter(row.workspaceId))
  // The recent list replays the log minus the Sessions still awaiting a first
  // view — those lead the section from live data with current titles. The log
  // already arrives newest-first.
  const unreadIds = new Set(board.unreadDone.map(row => row.id))
  const recent = useMemo(() => {
    const rows: BoardSession[] = []
    for (const entry of log.entries) {
      if (unreadIds.has(entry.sessionId) || !inFilter(entry.workspaceId)) continue
      rows.push({
        id: entry.sessionId,
        title: entry.title,
        workspaceId: entry.workspaceId,
        pendingKind: undefined,
        running: false,
        runningSubagents: 0,
        unread: false,
        startedAt: undefined,
        updatedAt: entry.completedAt,
      })
    }
    return rows
  }, [log, filter, board.unreadDone])
  const [recentExpanded, setRecentExpanded] = useState(false)
  const recentVisible = recentExpanded ? recent : recent.slice(0, RECENT_DEFAULT_COUNT)

  const renderCard = (
    row: BoardSession,
    opts: { readonly unread: boolean; readonly timePrefix: 'lastActive' | 'completedAt' },
  ) => (
    <SessionCard
      key={row.id}
      row={row}
      workspaceLabel={workspaceTitle(row.workspaceId)}
      unread={opts.unread}
      timePrefix={opts.timePrefix}
      onOpenSession={onOpenSession}
      t={t}
    />
  )
  const runningCards = (
    <div className={css.list}>
      {running.map(row => renderCard(row, { unread: false, timePrefix: 'lastActive' }))}
    </div>
  )
  const unreadSection = unreadDone.length > 0 && (
    <section className={css.group}>
      <h2 className={css.groupTitle}>{t('group.unread')}<span className={css.groupCount}>{unreadDone.length}</span></h2>
      <div className={css.list}>
        {unreadDone.map(row => renderCard(row, { unread: true, timePrefix: 'completedAt' }))}
      </div>
    </section>
  )
  const recentSection = recent.length > 0 && (
    <section className={css.group}>
      <h2 className={css.groupTitle}>{t('group.recent')}<span className={css.groupCount}>{recent.length}</span></h2>
      <div className={css.list}>
        {recentVisible.map(row => renderCard(row, { unread: false, timePrefix: 'completedAt' }))}
      </div>
      {recent.length > RECENT_DEFAULT_COUNT && (
        <button
          type="button"
          className={css.showMore}
          onClick={() => { setRecentExpanded(expanded => !expanded) }}
        >
          {recentExpanded ? t('done.showLess') : t('done.showMore', { count: recent.length - RECENT_DEFAULT_COUNT })}
        </button>
      )}
    </section>
  )
  const doneSections = (
    <>
      {unreadSection}
      {recentSection}
    </>
  )

  return (
    <div className={css.page}>
      <header className={css.header}>
        <h1 className={css.title}>{t('page.title')}</h1>
        <span className={css.hint}>{t('page.hint')}</span>
      </header>
      <div className={css.controls}>
        <SegmentedTabs<BoardTab>
          label={t('tabs.aria')}
          value={tab}
          onChange={setTab}
          items={[
            {
              value: 'all',
              id: 'progress-tab-all',
              panelId: 'progress-panel-all',
              label: <>{t('tabs.all')}<span className={css.count}>{board.counts.running + board.counts.unreadDone}</span></>,
            },
            {
              value: 'running',
              id: 'progress-tab-running',
              panelId: 'progress-panel-running',
              label: <>{t('tabs.running')}<span className={css.count}>{board.counts.running}</span></>,
            },
            {
              value: 'done',
              id: 'progress-tab-done',
              panelId: 'progress-panel-done',
              label: <>{t('tabs.done')}<span className={css.count}>{board.counts.unreadDone}</span></>,
            },
          ]}
        />
        <select
          className={css.filter}
          aria-label={t('filter.aria')}
          value={filter}
          onChange={(event) => { setFilter(event.target.value as WorkspaceFilter) }}
        >
          <option value="all">{t('filter.all')}</option>
          {workspaces.items.map(item => (
            <option key={item.workspaceId} value={item.workspaceId}>{item.title}</option>
          ))}
          <option value="ungrouped">{t('filter.ungrouped')}</option>
        </select>
      </div>
      <div
        className={css.board}
        role="tabpanel"
        id={`progress-panel-${tab}`}
        aria-labelledby={`progress-tab-${tab}`}
      >
        {tab === 'all' && (
          running.length === 0 && unreadDone.length === 0
            ? <p className={css.empty}>{t('empty.all')}</p>
            : (
              <>
                {running.length > 0 && (
                  <section className={css.group}>
                    <h2 className={css.groupTitle}>{t('group.running')}<span className={css.groupCount}>{running.length}</span></h2>
                    {runningCards}
                  </section>
                )}
                {/* All answers "what needs attention": running work plus
                    unviewed completions. Confirmed history stays on Done. */}
                {unreadSection}
              </>
            )
        )}
        {tab === 'running' && (
          running.length === 0 ? <p className={css.empty}>{t('empty.running')}</p> : runningCards
        )}
        {tab === 'done' && (
          unreadDone.length === 0 && recent.length === 0 ? <p className={css.empty}>{t('empty.done')}</p> : doneSections
        )}
      </div>
    </div>
  )
}

/**
 * One Session card on the progress board: status dot, title, Workspace chip,
 * and a metadata line carrying pending-interaction, subagent, and recency
 * facts. Presentational only; every fact arrives through props.
 */

import type { ReactNode } from 'react'
import clsx from 'clsx'
import { StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import type { NS } from './locales.ts'
import type { BoardSession } from './board-model.ts'
import { relativePhrase, useTickingNow } from './relative-time.ts'
import css from './SessionCard.module.css'

/** Injected actions a card needs from its owning registration. */
export interface SessionCardInjected {
  /**
   * Open the Session in the main conversation view.
   * @param id - Session identity printed on the card.
   */
  readonly onOpenSession: (id: BoardSession['id']) => void
}

/** Card props: the row facts, the Workspace label, and localized copy. */
export type SessionCardProps = InjectFace<SessionCardInjected> & PropsLocale<typeof NS> & {
  readonly row: BoardSession
  /** Workspace chip text; localized Ungrouped label when absent. */
  readonly workspaceLabel: string
  /** Render the unviewed-completion treatment (green leading edge). */
  readonly unread: boolean
  /** Completed cards phrase the timestamp as completion, running ones as activity. */
  readonly timePrefix: 'lastActive' | 'completedAt'
}

/**
 * Render one Session card.
 * @param props - row facts, Workspace label, copy seat, and the open action.
 * @returns a button row; pending interaction outranks the running spinner.
 */
export function SessionCard({
  row, workspaceLabel, unread, timePrefix, onOpenSession, t,
}: SessionCardProps): ReactNode {
  const now = useTickingNow()
  const dot: StateDotState = row.pendingKind !== undefined
    ? 'warning'
    : row.running ? 'ongoing' : unread ? 'done' : 'idle'
  const pendingKey = row.pendingKind === 'approval'
    || row.pendingKind === 'question'
    || row.pendingKind === 'plan-review'
    ? `status.pending.${row.pendingKind}` as const
    : 'status.pending.other' as const
  const phrase = relativePhrase(row.startedAt ?? row.updatedAt, now())
  // A running row with a known start reports elapsed run time: its last-active
  // time would read "just now" forever, which carries no information.
  const elapsed = row.running && row.startedAt !== undefined
  const prefix = elapsed ? 'elapsed' as const : timePrefix
  const timeLabel = phrase.kind === 'justNow'
    ? t(`meta.${prefix}.justNow`)
    : t(`meta.${prefix}.${phrase.kind}`, { count: phrase.count })
  return (
    <button
      type="button"
      className={clsx(css.card, unread && css.unread)}
      onClick={() => { onOpenSession(row.id) }}
      aria-label={t('card.open', { title: row.title })}
    >
      <span className={css.head}>
        <StateDot state={dot} size={10} className={css.dot} />
        <span className={css.title}>{row.title}</span>
        <span className={css.workspace}>{workspaceLabel}</span>
      </span>
      <span className={css.meta}>
        {row.pendingKind !== undefined && (
          <span className={css.pending}>{t(pendingKey)}</span>
        )}
        {row.runningSubagents > 0 && (
          <span>
            {t(row.runningSubagents === 1 ? 'meta.subagents.one' : 'meta.subagents.other', { count: row.runningSubagents })}
          </span>
        )}
        <span className={css.time}>{timeLabel}</span>
      </span>
    </button>
  )
}

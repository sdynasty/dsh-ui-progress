/**
 * Sidebar panel entry for the progress board: the gauge glyph plus a badge
 * counting every Session that needs attention — running work (interaction
 * requests included) and unviewed completions. Badge tone escalates from the
 * default accent (work running) to green (unviewed completions waiting) to
 * amber (a Session awaits its user). The expanded row docks the badge at the
 * row's right edge (see row-badge.css); the collapsed rail hugs the glyph
 * instead.
 */

import clsx from 'clsx'
import { IconGaugeOutlineRegular } from '@deepseek-ai/dsh-client-ui-primitives'
import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import { deriveBoard } from './board-model.ts'
import { NS } from './locales.ts'
import css from './ProgressPanelIcon.module.css'
import './row-badge.css'

/** Full props of the progress panel icon. */
export type ProgressPanelIconProps = PropsRuntime<'sidebar.panellist'> & PropsLocale<typeof NS>

/**
 * Render the gauge glyph with the attention badge.
 * @param props - framework icon share plus the root Session/Workspace hooks.
 * @returns the icon, badged while any Session runs or awaits a first view.
 */
export function ProgressPanelIcon({
  size, useSessions, useSessionStatus, useWorkspaces, t,
}: ProgressPanelIconProps) {
  const badge = useSessions(list => list)
  const statuses = useSessionStatus(snapshot => snapshot)
  const workspaces = useWorkspaces(snapshot => snapshot)
  const { counts } = deriveBoard(badge, statuses, workspaces)
  return (
    <span className={css.wrap}>
      <IconGaugeOutlineRegular size={size} />
      {counts.badge > 0 && (
        <span
          className={clsx(
            css.badge,
            counts.pending > 0
              ? css.badgePending
              : counts.unreadDone > 0 && css.badgeUnread,
          )}
          data-dsh-ui-progress-badge=""
          aria-label={t(counts.badge === 1 ? 'panel.badge.one' : 'panel.badge.other', { count: counts.badge })}
        >
          {counts.badge > 99 ? '99+' : counts.badge}
        </span>
      )}
    </span>
  )
}

/**
 * Cross-workspace Session progress board.
 *
 * The plugin contributes one sidebar panel entry whose badge counts every
 * Session needing attention — running work (interaction requests included)
 * plus completions nobody has opened — and one `main` panel with Running and
 * Done sections. Both project the same pure derivation over the root Session
 * list, the unified Session status map, and the Workspace registry, so the
 * badge and the page never disagree. The Done section.s recent history
 * comes from a completion log the registration feeds from root-snapshot
 * subscriptions, so completions are remembered even while the panel is closed.
 */

import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-session/client'
import type {} from '@deepseek-ai/dsh-client-ui-sidebar/client'
import type {} from '@deepseek-ai/dsh-client-ui-workspace/client'
import type { MainPanelId } from '@deepseek-ai/dsh-client-ui-layout/client'
import type { SessionId } from '@deepseek-ai/dsh-session/types'
import { createCompletionLog } from './completion-log.ts'
import { createRunClock } from './run-clock.ts'
import { en, NS, zh, type ProgressKey } from './locales.ts'
import { ProgressBoardPage, type ProgressBoardInjected } from './ProgressBoardPage.tsx'
import { ProgressPanelIcon } from './ProgressPanelIcon.tsx'

const PANEL_ID = 'progress' as MainPanelId

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Progress board page, panel entry, and completion-history copy. */
    progress: ProgressKey
  }
}

/** Required services: root snapshots, Workspace actions, dictionaries, and the Slot registry. */
export const inject = ['slots', 'locale', 'sessions', 'workspaces', 'uiWorkspace', 'uiSession']

/**
 * Register the sidebar entry, the board panel, and the completion observation.
 * @param ctx - browser services used by these contributions.
 */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'ui-progress: dictionaries')
  const t = ctx.locale.bind(NS)
  const log = createCompletionLog()
  const runClock = createRunClock()
  // Both observers fold every root-snapshot generation: a completion is
  // recorded even while the board panel is closed and even if the live unread
  // flag clears before the next panel mount, and a run keeps its start instant
  // across reloads.
  ctx.effect(() => {
    const sync = (): void => {
      const sessions = ctx.sessions.list.getSnapshot()
      const statuses = ctx.uiSession.sessionStatus.getSnapshot()
      log.observe(sessions, statuses, ctx.workspaces.list.getSnapshot())
      runClock.observe(sessions, statuses)
    }
    sync()
    const off = [
      ctx.sessions.list.subscribe(sync),
      ctx.uiSession.sessionStatus.subscribe(sync),
      ctx.workspaces.list.subscribe(sync),
    ]
    return () => { for (const dispose of off) dispose() }
  }, 'ui-progress: completion observation')
  const onOpenSession = (id: SessionId): void => {
    // Archived rows are hidden by the derivation, so a card is always openable.
    ctx.uiWorkspace.openSession(id)
  }
  ctx.slots.inject('main', () => ctx.slots.register({
    name: 'main',
    key: PANEL_ID,
    locale: NS,
    inject: (): ProgressBoardInjected => ({
      hooks: { completionLog: log.source, runClock: runClock.source },
      onOpenSession,
    }),
  }, ProgressBoardPage))
  ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
    name: 'sidebar.panellist',
    id: PANEL_ID,
    order: 20,
    locale: NS,
    label: () => t('panel.label'),
  }, ProgressPanelIcon))
}

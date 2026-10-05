/**
 * Ticking clock and relative-time formatting for card metadata. The hook is
 * component-internal behavioral state (it subscribes to no external source),
 * so several mounted cards share one interval per card rather than one per
 * timestamp line.
 */
import { useEffect, useReducer } from 'react'

/** Re-render the caller every `intervalMs` so relative times stay honest. */
export function useTickingNow(intervalMs = 30_000): () => number {
  const [, bump] = useReducer((tick: number) => tick + 1, 0)
  useEffect(() => {
    const timer = setInterval(bump, intervalMs)
    return () => { clearInterval(timer) }
  }, [intervalMs])
  return () => Date.now()
}

/** Relative-time phrase kinds a card reports. */
export type RelativePhrase =
  | { readonly kind: 'justNow' }
  | { readonly kind: 'minutes' | 'hours' | 'days'; readonly count: number }

/**
 * Break an elapsed duration into a display phrase.
 * @param then - event epoch ms.
 * @param now - viewing epoch ms.
 * @returns the coarsest honest unit: minutes to 59, hours to 23, then days.
 */
export function relativePhrase(then: number, now: number): RelativePhrase {
  const elapsed = Math.max(0, now - then)
  const minutes = Math.floor(elapsed / 60_000)
  if (minutes < 1) return { kind: 'justNow' }
  if (minutes < 60) return { kind: 'minutes', count: minutes }
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return { kind: 'hours', count: hours }
  return { kind: 'days', count: Math.floor(hours / 24) }
}

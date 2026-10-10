import { describe, expect, it } from 'vitest'
import { elapsedPhrase, relativePhrase } from '../src/client/relative-time.ts'

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

describe('relativePhrase', () => {
  const now = 100 * DAY
  it('buckets minutes, hours, and days', () => {
    expect(relativePhrase(now, now)).toEqual({ kind: 'justNow' })
    expect(relativePhrase(now - 59 * MIN, now)).toEqual({ kind: 'minutes', count: 59 })
    expect(relativePhrase(now - 23 * HOUR, now)).toEqual({ kind: 'hours', count: 23 })
    expect(relativePhrase(now - 3 * DAY, now)).toEqual({ kind: 'days', count: 3 })
  })
})

describe('elapsedPhrase', () => {
  const now = 100 * DAY
  it('keeps minute precision within a day', () => {
    expect(elapsedPhrase(now, now)).toEqual({ kind: 'justNow' })
    expect(elapsedPhrase(now - 42 * MIN, now)).toEqual({ kind: 'minutes', count: 42 })
    expect(elapsedPhrase(now - 60 * MIN, now)).toEqual({ kind: 'hours', hours: 1, minutes: 0 })
    expect(elapsedPhrase(now - 83 * MIN, now)).toEqual({ kind: 'hours', hours: 1, minutes: 23 })
    expect(elapsedPhrase(now - 23 * HOUR - 59 * MIN, now)).toEqual({ kind: 'hours', hours: 23, minutes: 59 })
  })

  it('keeps hour precision beyond a day', () => {
    expect(elapsedPhrase(now - DAY, now)).toEqual({ kind: 'days', days: 1, hours: 0 })
    expect(elapsedPhrase(now - DAY - 5 * HOUR - 30 * MIN, now)).toEqual({ kind: 'days', days: 1, hours: 5 })
    expect(elapsedPhrase(now - 12 * DAY, now)).toEqual({ kind: 'days', days: 12, hours: 0 })
  })
})

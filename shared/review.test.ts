import { describe, expect, it } from 'vitest'
import { REVIEW_INTERVALS, addDays, afterHit, afterMiss } from './review.js'

describe('spaced review (Leitner boxes)', () => {
  it('a miss goes to box 0, due tomorrow', () => {
    expect(afterMiss('2026-11-12')).toEqual({ box: 0, due: '2026-11-13' })
  })

  it('each correct review moves one box and waits longer: 1, 3, 7, 14, 30 days, then graduates', () => {
    expect(REVIEW_INTERVALS).toEqual([1, 3, 7, 14, 30])
    expect(afterHit(0, '2026-11-13')).toEqual({ box: 1, due: '2026-11-16' })
    expect(afterHit(1, '2026-11-16')).toEqual({ box: 2, due: '2026-11-23' })
    expect(afterHit(3, '2026-12-01')).toEqual({ box: 4, due: '2026-12-31' })
    expect(afterHit(4, '2026-12-31')).toBeNull()
  })

  it('adds calendar days across months and years', () => {
    expect(addDays('2026-12-30', 3)).toBe('2027-01-02')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
  })
})

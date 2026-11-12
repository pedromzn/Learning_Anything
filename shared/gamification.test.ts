/** the game rules: the level rises with XP, the streak counts consecutive days, achievements do not repeat. */
import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENTS,
  newAchievements,
  previousDay,
  localDay,
  levelFromXp,
  streakAfter,
  ongoingStreak,
  correctAnswerXp,
  xpToLevel,
  type Statistics,
} from './gamification.js'

describe('XP', () => {
  it('a hard item is worth more, a hint takes a little off, never below 4', () => {
    expect(correctAnswerXp(1, 0)).toBe(10)
    expect(correctAnswerXp(2, 0)).toBe(15)
    expect(correctAnswerXp(3, 0)).toBe(20)
    expect(correctAnswerXp(3, 2)).toBe(14)
    expect(correctAnswerXp(1, 3)).toBe(4)
  })
})

describe('the level', () => {
  it('starts at 1 and the curve only grows', () => {
    expect(levelFromXp(0).level).toBe(1)
    expect(levelFromXp(59).level).toBe(1)
    expect(levelFromXp(60).level).toBe(2)
    for (let n = 2; n < 60; n++)
      expect(xpToLevel(n + 1) - xpToLevel(n)).toBeGreaterThan(xpToLevel(n) - xpToLevel(n - 1) - 1)
  })

  it('progress within the level adds up', () => {
    const n = levelFromXp(700)
    expect(n.xpInLevel).toBeGreaterThanOrEqual(0)
    expect(n.xpInLevel).toBeLessThan(n.levelXp)
    expect(n.title).toBe('Student')
  })
})

describe('the streak', () => {
  it('adds with yesterday, stays with today, restarts after a skip', () => {
    expect(previousDay('2026-03-01')).toBe('2026-02-28')
    expect(streakAfter('2026-11-06', '2026-11-05', 4)).toBe(5)
    expect(streakAfter('2026-11-06', '2026-11-06', 5)).toBe(5)
    expect(streakAfter('2026-11-06', '2026-11-03', 9)).toBe(1)
    expect(streakAfter('2026-11-06', null, 0)).toBe(1)
  })

  it('the current one disappears after a skipped day', () => {
    expect(ongoingStreak('2026-11-06', '2026-11-05', 4)).toBe(4)
    expect(ongoingStreak('2026-11-06', '2026-11-04', 4)).toBe(0)
  })
})

describe('the achievements', () => {
  const zero: Statistics = {
    correct_answers: 0,
    completedLessons: 0,
    passedCheckpoints: 0,
    perfectCheckpoints: 0,
    completedCourses: 0,
    longestStreak: 0,
    goalsReached: 0,
    level: 1,
    completedTextLessons: 0,
  }

  it('the codes are unique', () => {
    expect(new Set(ACHIEVEMENTS.map((c) => c.code)).size).toBe(ACHIEVEMENTS.length)
  })

  it('unlocks what was reached and does not repeat what it already has', () => {
    const newOnes = newAchievements({ ...zero, correct_answers: 1, completedLessons: 1 }, new Set())
    expect(newOnes.map((c) => c.code).sort()).toEqual(['first-correct', 'first-lesson'])
    expect(newAchievements({ ...zero, correct_answers: 1 }, new Set(['first-correct']))).toEqual([])
  })
})

describe('the local day', () => {
  it('formats YYYY-MM-DD in the machine time zone', () => {
    expect(localDay(new Date(2026, 10, 6, 23, 59))).toBe('2026-11-06')
    expect(localDay(new Date(2026, 0, 2, 0, 1))).toBe('2026-01-02')
  })
})

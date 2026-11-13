import { beforeEach, describe, expect, it } from 'vitest'
import { openDb, setDb } from './db.js'
import {
  issueCertificate,
  readCertificate,
  fullProfile,
  record,
  profileSummary,
  updateProfile,
} from './gamification.js'
import { openLesson, completeLesson, completedLessons } from './study.js'

beforeEach(() => setDb(openDb(':memory:')))

const correctAnswer = (item: string, xp = 10) => ({ type: 'correctAnswer' as const, reference: `c:m1-a1:${item}`, xp })

describe('XP', () => {
  it('only the first correct answer for each item counts', () => {
    const a = record([correctAnswer('i1')], { today: '2026-11-10' })
    expect(a.xp).toBe(10)
    expect(a.achievements.map((c) => c.code)).toContain('first-correct')
    const b = record([correctAnswer('i1')], { today: '2026-11-10' })
    expect(b.xp).toBe(0)
    expect(b.achievements).toEqual([])
    expect(profileSummary({ today: '2026-11-10' }).totalXp).toBe(10)
  })

  it('the daily goal gives a bonus only once and the level goes up', () => {
    updateProfile({ dailyGoal: 20 })
    const r = record([correctAnswer('a'), correctAnswer('b')], { today: '2026-11-10' })
    expect(r.goalReachedNow).toBe(true)
    expect(r.xp).toBe(35)
    expect(record([correctAnswer('c')], { today: '2026-11-10' }).goalReachedNow).toBe(false)
    const summary = profileSummary({ today: '2026-11-10' })
    expect(summary.xpToday).toBe(30)
    expect(summary.week).toHaveLength(7)
    expect(summary.week.at(-1)).toEqual({ day: '2026-11-10', xp: 30 })
  })
})

describe('the streak', () => {
  it('grows on consecutive days, holds on the same day and restarts after a skipped day', () => {
    expect(record([correctAnswer('1')], { today: '2026-11-08' }).streak).toBe(1)
    expect(record([correctAnswer('2')], { today: '2026-11-08' }).streak).toBe(1)
    expect(record([correctAnswer('3')], { today: '2026-11-09' }).streak).toBe(2)
    expect(record([correctAnswer('4')], { today: '2026-11-10' }).streak).toBe(3)
    expect(profileSummary({ today: '2026-11-10' }).currentStreak).toBe(3)
    expect(profileSummary({ today: '2026-11-12' }).currentStreak).toBe(0)
    expect(record([correctAnswer('5')], { today: '2026-11-13' }).streak).toBe(1)
    expect(fullProfile({ today: '2026-11-13' }).longestStreak).toBe(3)
  })
})

describe('profile and certificate', () => {
  it('stores the name and one certificate per course', () => {
    updateProfile({ name: 'Mandy' })
    const data = { course: 'russo-basico', title: 'Russo', level: 'basic' as const, lessons: 5, modules: 2 }
    const code = issueCertificate(data)
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    expect(issueCertificate(data)).toBe(code)
    expect(readCertificate(code)).toMatchObject({ name: 'Mandy', courseId: 'russo-basico', modules: 2 })
    expect(readCertificate('NADA-NADA-NADA')).toBeNull()
    expect(fullProfile().certificates).toHaveLength(1)
  })

  it('lesson progress', () => {
    openLesson('c', 'm1-a1')
    expect(completedLessons('c').size).toBe(0)
    completeLesson('c', 'm1-a1')
    expect([...completedLessons('c')]).toEqual(['m1-a1'])
  })
})

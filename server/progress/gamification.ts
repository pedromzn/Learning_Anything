/**
 * Gamification on the server: records the XP of each action as an event, updates the level, the streak and the daily
 * goal, unlocks achievements and issues the certificate (the rules live in `shared/gamification.ts`).
 *
 * Why an event with a unique key instead of a counter: the same correct answer may arrive twice (double click, resend,
 * redone lesson). With `(type, reference)` unique in the database, the second time gives no points — and the XP
 * history is auditable. The reference says what was earned: `course:lesson:item` for a correct answer (only the FIRST
 * correct answer for each item counts), `course:mN` for the checkpoint, the course on completion, the day for the goal.
 *
 * All in an immediate transaction: two simultaneous answers neither lose XP nor count the streak twice.
 */

import { randomBytes } from 'node:crypto'
import {
  ACHIEVEMENTS,
  FIXED_XP,
  newAchievements,
  previousDay,
  localDay,
  levelFromXp,
  streakAfter,
  ongoingStreak,
  type Statistics,
  type Reward,
  type EventType,
} from '../../shared/gamification.js'
import type { CertificateDetail, StudentProfile } from '../../shared/api.js'
import type { Level } from '../../shared/course.js'
import { getDb, transaction, type DatabaseSync } from './db.js'

export interface RequestEvent {
  type: Exclude<EventType, 'daily_goal_reached'>
  reference: string
  xp: number
}

export interface Options {
  db?: DatabaseSync
  /** "today" (`YYYY-MM-DD`); tests pin it */
  today?: string
}

interface ProfileRow {
  name: string
  xp_total: number
  current_streak: number
  longest_streak: number
  last_day: string | null
  daily_goal: number
  created_at: string
}

const now = () => new Date().toISOString()

/** Reads the profile (the single row), creating it the first time. */
export function readProfile(db: DatabaseSync = getDb()): ProfileRow {
  db.prepare('INSERT OR IGNORE INTO profile (id, created_at) VALUES (1, ?)').run(now())
  return db.prepare('SELECT * FROM profile WHERE id = 1').get() as unknown as ProfileRow
}

/** Saves the event if it does not exist yet; returns the XP that was added (0 if it already existed). */
function saveEvent(db: DatabaseSync, e: { type: EventType; reference: string; xp: number }, day: string): number {
  const r = db
    .prepare('INSERT OR IGNORE INTO xp_events (type, reference, xp, day, at) VALUES (?, ?, ?, ?, ?)')
    .run(e.type, e.reference.slice(0, 160), e.xp, day, now())
  return Number(r.changes) > 0 ? e.xp : 0
}

/** The XP already earned on a day (not counting the goal bonus itself). */
export function dayXp(day: string, db: DatabaseSync = getDb()): number {
  const l = db
    .prepare("SELECT COALESCE(SUM(xp), 0) AS total FROM xp_events WHERE day = ? AND type <> 'daily_goal_reached'")
    .get(day) as { total: number }
  return Number(l.total)
}

export function statistics(db: DatabaseSync = getDb(), profile: ProfileRow = readProfile(db)): Statistics {
  const counts = db.prepare('SELECT type, COUNT(*) AS total FROM xp_events GROUP BY type').all() as unknown as Array<{
    type: string
    total: number
  }>
  const from = (type: EventType) => Number(counts.find((c) => c.type === type)?.total ?? 0)
  const text = db
    .prepare("SELECT COUNT(*) AS total FROM xp_events WHERE type = 'lesson_completed' AND reference LIKE 'text:%'")
    .get() as { total: number }
  return {
    correct_answers: from('correctAnswer'),
    completedLessons: from('lesson_completed'),
    passedCheckpoints: from('checkpoint_passed'),
    perfectCheckpoints: from('checkpoint_perfect'),
    completedCourses: from('course_completed'),
    goalsReached: from('daily_goal_reached'),
    longestStreak: profile.longest_streak,
    level: levelFromXp(profile.xp_total).level,
    completedTextLessons: Number(text.total),
  }
}

/**
 * Records what the student did and returns the reward for the screen. Repeated events give nothing; a reward with
 * `xp: 0` and no achievement is the normal case of redoing something already done.
 */
export function record(events: RequestEvent[], options: Options = {}): Reward {
  const db = options.db ?? getDb()
  const today = options.today ?? localDay()
  return transaction(db, () => {
    const profile = readProfile(db)
    const levelBefore = levelFromXp(profile.xp_total).level

    let gain = 0
    for (const e of events) gain += saveEvent(db, e, today)

    let goalReachedNow = false
    if (gain > 0) {
      const streak = streakAfter(today, profile.last_day, profile.current_streak)
      profile.current_streak = streak
      profile.longest_streak = Math.max(profile.longest_streak, streak)
      profile.last_day = today

      if (dayXp(today, db) >= profile.daily_goal) {
        const bonus = saveEvent(
          db,
          { type: 'daily_goal_reached', reference: today, xp: FIXED_XP.daily_goal_reached },
          today,
        )
        goalReachedNow = bonus > 0
        gain += bonus
      }
    }

    profile.xp_total += gain
    db.prepare(
      'UPDATE profile SET xp_total = ?, current_streak = ?, longest_streak = ?, last_day = ? WHERE id = 1',
    ).run(profile.xp_total, profile.current_streak, profile.longest_streak, profile.last_day)

    const alreadyHas = new Set(
      (db.prepare('SELECT code FROM achievements').all() as Array<{ code: string }>).map((c) => c.code),
    )
    const newOnes = newAchievements(statistics(db, profile), alreadyHas)
    for (const c of newOnes) db.prepare('INSERT INTO achievements (code, earned_at) VALUES (?, ?)').run(c.code, now())

    return {
      xp: gain,
      levelBefore,
      levelAfter: levelFromXp(profile.xp_total).level,
      streak: profile.current_streak,
      goalReachedNow,
      achievements: newOnes.map(({ code, title, description, rarity }) => ({ code, title, description, rarity })),
    }
  })
}

// ── profile and dashboard ────────────────────────────────────────────────────

export function updateProfile(changes: { name?: string; dailyGoal?: number }, db: DatabaseSync = getDb()): void {
  readProfile(db)
  if (changes.name !== undefined) db.prepare('UPDATE profile SET name = ? WHERE id = 1').run(changes.name)
  if (changes.dailyGoal !== undefined)
    db.prepare('UPDATE profile SET daily_goal = ? WHERE id = 1').run(changes.dailyGoal)
}

export type ProfileSummary = Pick<
  StudentProfile,
  'name' | 'totalXp' | 'level' | 'currentStreak' | 'dailyGoal' | 'xpToday' | 'week'
>

export function profileSummary(options: Options = {}): ProfileSummary {
  const db = options.db ?? getDb()
  const today = options.today ?? localDay()
  const p = readProfile(db)
  const n = levelFromXp(p.xp_total)

  const days: string[] = [today]
  while (days.length < 7) days.unshift(previousDay(days[0]!))
  const byDay = new Map(
    (
      db
        .prepare(
          "SELECT day, SUM(xp) AS xp FROM xp_events WHERE day >= ? AND type <> 'daily_goal_reached' GROUP BY day",
        )
        .all(days[0]!) as unknown as Array<{ day: string; xp: number }>
    ).map((l) => [l.day, Number(l.xp)]),
  )
  return {
    name: p.name,
    totalXp: p.xp_total,
    level: {
      number: n.level,
      xpInLevel: n.xpInLevel,
      xpToNext: n.levelXp,
      progress: n.levelXp ? n.xpInLevel / n.levelXp : 0,
      title: n.title,
    },
    currentStreak: ongoingStreak(today, p.last_day, p.current_streak),
    dailyGoal: p.daily_goal,
    xpToday: byDay.get(today) ?? 0,
    week: days.map((day) => ({ day, xp: byDay.get(day) ?? 0 })),
  }
}

export function fullProfile(options: Options = {}): StudentProfile {
  const db = options.db ?? getDb()
  const profile = readProfile(db)
  const summary = profileSummary(options)
  const stats = statistics(db, profile)
  const earned = new Map(
    (
      db.prepare('SELECT code, earned_at FROM achievements').all() as unknown as Array<{
        code: string
        earned_at: string
      }>
    ).map((c) => [c.code, c.earned_at]),
  )
  const certificates = db
    .prepare('SELECT code, course, title, issued_at FROM certificates ORDER BY issued_at DESC')
    .all() as unknown as Array<{ code: string; course: string; title: string; issued_at: string }>
  return {
    ...summary,
    longestStreak: profile.longest_streak,
    achievements: ACHIEVEMENTS.map((c) => ({
      code: c.code,
      name: c.title,
      description: c.description,
      category: c.category,
      earnedAt: earned.get(c.code) ?? null,
      progress: Math.min(stats[c.metric], c.target) / c.target,
    })),
    certificates: certificates.map((c) => ({
      code: c.code,
      courseId: c.course,
      title: c.title,
      issuedAt: c.issued_at,
    })),
    statistics: {
      completedLessons: stats.completedLessons,
      correct_answers: stats.correct_answers,
      passedCheckpoints: stats.passedCheckpoints,
      completedCourses: stats.completedCourses,
    },
  }
}

// ── the certificate ──────────────────────────────────────────────────────────

/** 12 characters without the ones that get mixed up (0/O, 1/I/L), from a cryptographic source: `ABCD-EFGH-JKMN`. */
function certificateCode(): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
  let code = ''
  for (const b of randomBytes(12)) code += alphabet[b % alphabet.length]
  return `${code.slice(0, 4)}-${code.slice(4, 8)}-${code.slice(8, 12)}`
}

export interface CertificateData {
  course: string
  title: string
  level: Level
  lessons: number
  modules: number
}

/** Issues the certificate for a completed course; only once (the course is unique in the table). Returns the code. */
export function issueCertificate(d: CertificateData, db: DatabaseSync = getDb()): string {
  return transaction(db, () => {
    const existing = db.prepare('SELECT code FROM certificates WHERE course = ?').get(d.course) as
      | { code: string }
      | undefined
    if (existing) return existing.code
    const code = certificateCode()
    db.prepare(
      'INSERT INTO certificates (code, course, title, level, lessons, modules, name, issued_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    ).run(code, d.course, d.title.slice(0, 200), d.level, d.lessons, d.modules, readProfile(db).name, now())
    return code
  })
}

export function courseCertificate(course: string, db: DatabaseSync = getDb()): string | null {
  const l = db.prepare('SELECT code FROM certificates WHERE course = ?').get(course) as { code: string } | undefined
  return l?.code ?? null
}

export function readCertificate(code: string, db: DatabaseSync = getDb()): CertificateDetail | null {
  const l = db.prepare('SELECT * FROM certificates WHERE code = ?').get(code) as
    | {
        code: string
        course: string
        title: string
        level: Level
        lessons: number
        modules: number
        name: string
        issued_at: string
      }
    | undefined
  if (!l) return null
  return {
    code: l.code,
    /* the name may have been given after issuing: the profile one applies */
    name: l.name || readProfile(db).name,
    courseId: l.course,
    title: l.title,
    level: l.level,
    lessons: l.lessons,
    modules: l.modules,
    issuedAt: l.issued_at,
  }
}

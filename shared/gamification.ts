/**
 * The gamification rules: what each action is worth, the level curve, the day streak and the achievements.
 *
 * Three principles, and they matter more than the numbers:
 * 1. **Only learning earns points.** A correct answer, a finished lesson, a checkpoint, a course, the daily goal.
 * 2. **Effort is worth more than luck.** A hard item is worth more; each hint asked takes a little off; a perfect
 *    checkpoint earns a bonus. A wrong answer takes nothing off — mistakes are part of practice.
 * 3. **The server decides.** XP is stored as an event with a unique key (type + reference), and the same event never
 *    scores twice, however many times the request comes.
 */

import { z } from 'zod'

// ── the points ────────────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  'correctAnswer',
  'lesson_completed',
  'checkpoint_passed',
  'checkpoint_perfect',
  'course_completed',
  'feynman_passed',
  'daily_goal_reached',
  'review_correct',
] as const
export type EventType = (typeof EVENT_TYPES)[number]

/** The XP for a correct answer: 10, 15 or 20 by difficulty, minus 3 per hint asked, never below 4. */
export function correctAnswerXp(difficulty: number, hintsUsed: number): number {
  const base = difficulty >= 3 ? 20 : difficulty === 2 ? 15 : 10
  return Math.max(4, base - 3 * Math.max(0, hintsUsed))
}

export const FIXED_XP: Record<Exclude<EventType, 'correctAnswer'>, number> = {
  lesson_completed: 20,
  checkpoint_passed: 50,
  checkpoint_perfect: 25,
  course_completed: 200,
  /** explaining the module to Ana with a score of 70+: explaining is the hardest proof of understanding */
  feynman_passed: 40,
  daily_goal_reached: 15,
  /** a correct spaced review (once per exercise per day) */
  review_correct: 5,
}

/** The goals the student picks from (XP per day). "Normal" is the default. */
export const DAILY_GOALS = [
  { xp: 20, label: 'Light', description: 'About 5 minutes a day' },
  { xp: 50, label: 'Normal', description: 'About 15 minutes a day' },
  { xp: 100, label: 'Demanding', description: 'About 30 minutes a day' },
  { xp: 200, label: 'Intense', description: 'An hour or more a day' },
] as const
export const dailyGoalSchema = z.union(
  DAILY_GOALS.map((m) => z.literal(m.xp)) as unknown as [
    z.ZodLiteral<number>,
    z.ZodLiteral<number>,
    ...z.ZodLiteral<number>[],
  ],
)

// ── the level ──────────────────────────────────────────────────────────────────

/**
 * The total XP to REACH level n: 60·(n−1)^1.6, rounded to the nearest ten. Level 2 comes fast (60 XP, one lesson and
 * a few correct answers); level 10 takes about two weeks of daily study; level 30, months. The curve grows so the level
 * keeps meaning something, but not so much that it stops going up.
 */
export function xpToLevel(n: number): number {
  if (n <= 1) return 0
  return Math.round((60 * Math.pow(n - 1, 1.6)) / 10) * 10
}

const TITLES: Array<{ since: number; title: string }> = [
  { since: 1, title: 'Apprentice' },
  { since: 5, title: 'Student' },
  { since: 10, title: 'Dedicated' },
  { since: 15, title: 'Researcher' },
  { since: 20, title: 'Specialist' },
  { since: 30, title: 'Master' },
  { since: 40, title: 'Sage' },
]

export interface Level {
  level: number
  title: string
  totalXp: number
  /** the XP since the start of this level */
  xpInLevel: number
  /** how much this level takes, from its start to the next */
  levelXp: number
}

export function levelFromXp(totalXp: number): Level {
  let level = 1
  while (totalXp >= xpToLevel(level + 1) && level < 99) level++
  const title = [...TITLES].reverse().find((t) => level >= t.since)!.title
  const start = xpToLevel(level)
  return { level, title, totalXp, xpInLevel: totalXp - start, levelXp: xpToLevel(level + 1) - start }
}

// ── the streak ──────────────────────────────────────────────────────────────

/** The day in the machine's time zone, `YYYY-MM-DD` — the student's "today" (not UTC, which flips in the evening in the Americas). */
export function localDay(when: Date = new Date()): string {
  const second = (n: number) => String(n).padStart(2, '0')
  return `${when.getFullYear()}-${second(when.getMonth() + 1)}-${second(when.getDate())}`
}

export function previousDay(day: string): string {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() - 1)
  return d.toISOString().slice(0, 10)
}

/**
 * The streak after studying today: studied yesterday, add one; studied again today, it stays; skipped a day, restart
 * at 1. (Whoever skipped still sees the old streak until they study again — the screen uses `ongoingStreak` to show
 * zero.)
 */
export function streakAfter(studiedDay: string, lastDay: string | null, streak: number): number {
  if (lastDay === studiedDay) return Math.max(1, streak)
  if (lastDay === previousDay(studiedDay)) return streak + 1
  return 1
}

/** The streak that counts NOW: if the last study day was neither today nor yesterday, it is already lost. */
export function ongoingStreak(today: string, lastDay: string | null, streak: number): number {
  if (!lastDay) return 0
  if (lastDay === today || lastDay === previousDay(today)) return streak
  return 0
}

// ── the achievements ────────────────────────────────────────────────────────────

/** What the achievements measure — the server computes it on each event. */
export interface Statistics {
  correct_answers: number
  completedLessons: number
  passedCheckpoints: number
  perfectCheckpoints: number
  completedCourses: number
  longestStreak: number
  goalsReached: number
  level: number
  completedTextLessons: number
}

export const ACHIEVEMENT_CATEGORIES = ['first_steps', 'practice', 'consistency', 'mastery', 'courses'] as const

export interface Achievement {
  code: string
  title: string
  description: string
  category: (typeof ACHIEVEMENT_CATEGORIES)[number]
  /** what to measure and how much it takes; progress is `min(value, target) / target` */
  metric: keyof Statistics
  target: number
  /** the trophy: bronze, silver, gold — the rarity, for the screen */
  rarity: 'bronze' | 'silver' | 'gold'
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    code: 'first-lesson',
    title: 'First lesson',
    description: 'Complete your first lesson.',
    category: 'first_steps',
    metric: 'completedLessons',
    target: 1,
    rarity: 'bronze',
  },
  {
    code: 'first-correct',
    title: 'First correct answer',
    description: 'Get your first exercise right.',
    category: 'first_steps',
    metric: 'correct_answers',
    target: 1,
    rarity: 'bronze',
  },
  {
    code: 'first-checkpoint',
    title: 'First checkpoint',
    description: 'Pass your first module checkpoint.',
    category: 'first_steps',
    metric: 'passedCheckpoints',
    target: 1,
    rarity: 'bronze',
  },
  {
    code: 'reader',
    title: 'Careful reader',
    description: 'Complete 10 reading lessons.',
    category: 'practice',
    metric: 'completedTextLessons',
    target: 10,
    rarity: 'silver',
  },
  {
    code: 'hundred-correct',
    title: 'A hundred right',
    description: 'Get 100 exercises right.',
    category: 'practice',
    metric: 'correct_answers',
    target: 100,
    rarity: 'silver',
  },
  {
    code: 'thousand-correct',
    title: 'A thousand right',
    description: 'Get 1,000 exercises right.',
    category: 'practice',
    metric: 'correct_answers',
    target: 1000,
    rarity: 'gold',
  },
  {
    code: 'fifty-lessons',
    title: 'Fifty lessons',
    description: 'Complete 50 lessons.',
    category: 'practice',
    metric: 'completedLessons',
    target: 50,
    rarity: 'silver',
  },
  {
    code: 'streak-3',
    title: 'Three days in a row',
    description: 'Study 3 days in a row.',
    category: 'consistency',
    metric: 'longestStreak',
    target: 3,
    rarity: 'bronze',
  },
  {
    code: 'streak-7',
    title: 'One week',
    description: 'Study 7 days in a row.',
    category: 'consistency',
    metric: 'longestStreak',
    target: 7,
    rarity: 'silver',
  },
  {
    code: 'streak-30',
    title: 'A month non-stop',
    description: 'Study 30 days in a row.',
    category: 'consistency',
    metric: 'longestStreak',
    target: 30,
    rarity: 'gold',
  },
  {
    code: 'streak-100',
    title: 'A hundred days',
    description: 'Study 100 days in a row.',
    category: 'consistency',
    metric: 'longestStreak',
    target: 100,
    rarity: 'gold',
  },
  {
    code: 'goal-7',
    title: 'Goal reached',
    description: 'Reach the daily goal 7 times.',
    category: 'consistency',
    metric: 'goalsReached',
    target: 7,
    rarity: 'bronze',
  },
  {
    code: 'perfect',
    title: 'Perfect',
    description: 'Get everything right in a checkpoint.',
    category: 'mastery',
    metric: 'perfectCheckpoints',
    target: 1,
    rarity: 'silver',
  },
  {
    code: 'perfect-10',
    title: 'Flawless',
    description: 'Get everything right in 10 checkpoints.',
    category: 'mastery',
    metric: 'perfectCheckpoints',
    target: 10,
    rarity: 'gold',
  },
  {
    code: 'level-10',
    title: 'Level 10',
    description: 'Reach level 10.',
    category: 'mastery',
    metric: 'level',
    target: 10,
    rarity: 'silver',
  },
  {
    code: 'level-30',
    title: 'Level 30',
    description: 'Reach level 30.',
    category: 'mastery',
    metric: 'level',
    target: 30,
    rarity: 'gold',
  },
  {
    code: 'graduate',
    title: 'Graduate',
    description: 'Complete your first course and earn the certificate.',
    category: 'courses',
    metric: 'completedCourses',
    target: 1,
    rarity: 'silver',
  },
  {
    code: 'collector',
    title: 'Collector',
    description: 'Complete 5 courses.',
    category: 'courses',
    metric: 'completedCourses',
    target: 5,
    rarity: 'gold',
  },
]

export const achievementByCode = (code: string): Achievement | undefined => ACHIEVEMENTS.find((c) => c.code === code)

/** The achievements the statistics already earn and the student does not have yet. */
export function newAchievements(e: Statistics, alreadyHas: Set<string>): Achievement[] {
  return ACHIEVEMENTS.filter((c) => !alreadyHas.has(c.code) && e[c.metric] >= c.target)
}

// ── what goes back to the screen after each action ──────────────────────────────

/** The "you earned": the panel shows the XP, the new level and each unlocked achievement. */
export interface Reward {
  xp: number
  levelBefore: number
  levelAfter: number
  streak: number
  goalReachedNow: boolean
  achievements: Array<Pick<Achievement, 'code' | 'title' | 'description' | 'rarity'>>
}

/**
 * The HTTP contract between the server (`server/`) and the app (`web/`). Every success response comes as
 * `{ data: T }`; every error as `{ error: string, code?: string }` with the right HTTP status.
 *
 * One local user: no login, no company, no session. A course "id" is its folder name in `courses/` (the slug), and a
 * lesson id is `m<N>-a<M>` (module N, lesson M, counting from 1).
 */

import type { Bloom, Brief, Level, Reference, LessonType, ItemType, StudentItem, AttemptResult } from './course.js'
import type { Scene, ReadyVideo } from './video.js'
import type { Reward } from './gamification.js'
import type { Language } from './languages.js'

// ── the courses ────────────────────────────────────────────────────────────────

/**
 * A module's state, INFERRED from the files (nobody stores it):
 * - `ready`: every lesson in the syllabus and the checkpoint exist and pass the schema;
 * - `partial`: some files exist;
 * - `planned`: only in the syllabus — the AI has not written it yet;
 * - `with_errors`: some file exists and does NOT pass the schema (see `problems`).
 */
export type ModuleState = 'ready' | 'partial' | 'planned' | 'with_errors'

/** Same for a lesson: `ready` (valid file), `planned` (no file), `with_errors`. */
export type LessonState = 'ready' | 'planned' | 'with_errors'

/** `GET /api/courses` → `CourseSummary[]` (order: the last studied first, then the newest). */
export interface CourseSummary {
  id: string
  title: string
  topic: string
  level: Level
  /** the syllabus summary, cut at ~200 characters */
  summary: string
  totalModules: number
  /** the modules that have all lessons ready */
  readyModules: number
  totalLessons: number
  completedLessons: number
  /** the module the student is on (the first checkpoint not yet passed) */
  currentModule: number
  done: boolean
  /** ISO; null = never opened */
  studiedAt: string | null
  /** ISO, from the newest file in the folder */
  updatedAt: string
  /** the folder exists but the syllabus does not yet (the AI is researching) */
  underConstruction: boolean
}

export interface LessonSummary {
  /** `m1-a2` */
  id: string
  order: number
  type: LessonType
  title: string
  goal: string
  state: LessonState
  completed: boolean
  /** video lessons only: the video has been rendered (`npm run course:video`) */
  hasVideo?: boolean
}

export interface ModuleSummary {
  order: number
  title: string
  goal: string
  state: ModuleState
  skills: Array<{ id: string; name: string; bloom: Bloom }>
  project: { title: string; prompt: string; rubric: string[] }
  lessons: LessonSummary[]
  /** the Feynman block (teach Mandy) is ready */
  hasFeynman: boolean
  feynmanPassed: boolean
  hasCheckpoint: boolean
  checkpointPassed: boolean
  /** unlocked = the previous module's checkpoint was passed (always for the 1st) */
  unlocked: boolean
  /** the validation problems in the module's files, to show and for the AI to fix */
  problems: string[]
}

/** `GET /api/courses/:id` */
export interface CourseDetail {
  id: string
  title: string
  /** the brief as it is in `brief.json` (only topic, scope and level are required) */
  brief: Pick<Brief, 'topic' | 'scope' | 'level'> & Partial<Brief>
  summary: string
  results: string[]
  prerequisites: string[]
  bibliography: Reference[]
  modules: ModuleSummary[]
  currentModule: number
  done: boolean
  /** the certificate code, once the course is completed */
  certificate: string | null
  underConstruction: boolean
  /** what the AI should write (or fix) next; the app builds the command in the interface language. null = complete */
  nextStep: { file: string; module: number | null; correction: boolean; problem: string | null } | null
}

// ── the lesson ───────────────────────────────────────────────────────────────────

export interface LessonSource {
  title: string
  author: string
  institution: string
  type: Reference['type']
  url: string | null
}

export interface TextContent {
  introduction: string
  sections: Array<{ title: string; markdown: string; question: StudentItem }>
  workedExample: { prompt: string; steps: string[] }
  summary: string[]
}

export interface ExercisesContent {
  guidance: string
  items: StudentItem[]
}

/** The `question` scene arrives with the item WITHOUT the answer key; the other scenes as they are in the script. */
export type StudentScene =
  | Exclude<Scene, { type: 'question' }>
  | { type: 'question'; item: StudentItem; narration: string }

export interface VideoContent {
  script: { title: string; scenes: StudentScene[] }
  /** null = not rendered yet: the app shows the script as slides */
  video: (ReadyVideo & { base: string }) | null
}

/**
 * `GET /api/courses/:id/lessons/:lessonId`. `video.base` is the URL of the video folder
 * (`/api/courses/:id/lessons/:lessonId/video/`), which holds `index.m3u8`, `subtitles.vtt` and `poster.jpg`.
 */
export interface LessonDetail {
  id: string
  /** the course language (narration, subtitles) */
  language: Language
  module: number
  order: number
  type: LessonType
  title: string
  goal: string
  state: LessonState
  completed: boolean
  content: TextContent | ExercisesContent | VideoContent | null
  sources: LessonSource[]
  /** the course's next lesson (or null at the end of the module, when the checkpoint comes) */
  next: { id: string; title: string; type: LessonType } | null
  problems: string[]
}

/** `POST /api/courses/:id/lessons/:lessonId/items/:itemId/attempt` with `{ answer, hintsUsed }` */
export type AttemptResponse = AttemptResult & { reward: Reward | null }

/** `POST .../items/:itemId/hint` with `{ index }` → `{ hint }` */
export interface HintResponse {
  hint: string
}

/** `POST .../lessons/:lessonId/finish` */
export interface CompletionResponse {
  reward: Reward | null
}

// ── the checkpoint ─────────────────────────────────────────────────────────────

/** `GET /api/courses/:id/modules/:order/checkpoint` */
export interface StudentCheckpoint {
  module: number
  threshold: number
  items: StudentItem[]
  alreadyPassed: boolean
}

/** `POST /api/courses/:id/modules/:order/checkpoint` with `{ answers: { [itemId]: answer } }` */
export interface CheckpointResult {
  passed: boolean
  correct_answers: number
  total: number
  threshold: number
  certificate: string | null
  reward: Reward | null
  results: Array<{ itemId: string; skill: string } & AttemptResult>
}

// ── the profile and the dashboard ──────────────────────────────────────────────────────

/** `GET /api/profile` (and `PUT /api/profile` with `{ name?, dailyGoal? }`) */
export interface StudentProfile {
  /** the name that goes on the certificate; empty until the person gives it */
  name: string
  totalXp: number
  /** `xpToNext` = the size of this level (from its start to the next); `progress` = xpInLevel / xpToNext */
  level: { number: number; xpInLevel: number; xpToNext: number; progress: number; title?: string }
  currentStreak: number
  longestStreak: number
  dailyGoal: number
  xpToday: number
  /** the last 7 days, from oldest to today (`YYYY-MM-DD`, in the machine's time zone) */
  week: Array<{ day: string; xp: number }>
  achievements: Array<{
    code: string
    name: string
    description: string
    category: string
    earnedAt: string | null
    /** from 0 to 1, for the "almost there" bar */
    progress: number
  }>
  certificates: Array<{ code: string; courseId: string; title: string; issuedAt: string }>
  statistics: { completedLessons: number; correct_answers: number; passedCheckpoints: number; completedCourses: number }
}

/** `GET /api/dashboard` — everything Home needs in one call. */
export interface Panel {
  profile: Pick<StudentProfile, 'name' | 'totalXp' | 'level' | 'currentStreak' | 'dailyGoal' | 'xpToday' | 'week'>
  /** where to resume: the first ready, unfinished lesson of the last studied course */
  resume: {
    courseId: string
    courseTitle: string
    lessonId: string
    lessonTitle: string
    type: LessonType
    module: number
  } | null
  courses: CourseSummary[]
  /** the requests with no folder in `courses/` yet (the AI has not started) */
  requests: RequestSummary[]
}

/** `GET /api/certificates/:code` */
export interface CertificateDetail {
  code: string
  name: string
  courseId: string
  title: string
  level: Level
  lessons: number
  modules: number
  issuedAt: string
}

// ── the requests (the "New course") ──────────────────────────────────────────────

/**
 * `POST /api/requests` with a `Brief` → writes `requests/<slug>.json` and returns the text ready to paste into the AI.
 * The app does NOT generate content: the user's own AI (Claude Code, Codex, Cursor…) researches and writes, following
 * `AGENTS.md` and the `create-course` skill.
 */
export interface CreatedRequest {
  slug: string
  file: string
  /** the command to paste into the AI */
  instruction: string
}

export interface RequestSummary {
  slug: string
  topic: string
  level: Level
  createdAt: string
}

// ── the "creating the course" feed (real time) ───────────────────────────────────────────────────────────────────────────

/**
 * `GET /api/events` — Server-Sent Events. The server watches `courses/` and `requests/` and sends an event for every
 * file the AI writes, so the app lists it right away:
 * `event: course` with `data: CourseEvent`.
 */
export interface CourseEvent {
  courseId: string
  /** the path relative to the course folder: `syllabus.json`, `module-1/lesson-2.json`… */
  file: string
  type: 'brief' | 'dossier' | 'syllabus' | 'lesson' | 'feynman' | 'checkpoint' | 'video' | 'other'
  /** did it pass the schema? (false = the AI will still fix it) */
  valid: boolean
  at: string
}

export type { ItemType }

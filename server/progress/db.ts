/**
 * The progress database: a local SQLite (`node:sqlite`, built into Node) at `data/progress.sqlite`. It stores only what
 * belongs to THE LEARNER — XP, streak, attempts, certificates. Course content lives in files, never here.
 *
 * `openDb(':memory:')` is for tests; `getDb()` is the app singleton (opens on first use).
 */

import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import type { DatabaseSync as SqliteDatabase } from 'node:sqlite'
import { config } from '../config.js'

export type DatabaseSync = SqliteDatabase

/* the "SQLite is an experimental feature" warning shows once per process; hide only that one, keep the other warnings */
const emitWarning = process.emitWarning.bind(process)
process.emitWarning = ((warning: string | Error, ...rest: unknown[]) => {
  const text = typeof warning === 'string' ? warning : warning.message
  if (/SQLite/i.test(text)) return
  return (emitWarning as (...a: unknown[]) => void)(warning, ...rest)
}) as typeof process.emitWarning

/* loaded AFTER the filter above: a static `import` would evaluate the module (and emit the warning) before it */
const { DatabaseSync: Sqlite } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')

/** Bumped on every schema change; the migrations live in `migrate`. */
const VERSION = 4

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS profile (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  name TEXT NOT NULL DEFAULT '',
  xp_total INTEGER NOT NULL DEFAULT 0,
  current_streak INTEGER NOT NULL DEFAULT 0,
  longest_streak INTEGER NOT NULL DEFAULT 0,
  last_day TEXT,
  daily_goal INTEGER NOT NULL DEFAULT 50,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lesson_progress (
  course TEXT NOT NULL,
  lesson TEXT NOT NULL,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  correct_answers INTEGER NOT NULL DEFAULT 0,
  attempts INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (course, lesson)
);
CREATE TABLE IF NOT EXISTS attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course TEXT NOT NULL,
  lesson TEXT,
  module INTEGER,
  item TEXT NOT NULL,
  origin TEXT NOT NULL,
  correct INTEGER,
  hints_used INTEGER NOT NULL DEFAULT 0,
  at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS xp_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  reference TEXT NOT NULL,
  xp INTEGER NOT NULL,
  day TEXT NOT NULL,
  at TEXT NOT NULL,
  UNIQUE (type, reference)
);
CREATE TABLE IF NOT EXISTS achievements (
  code TEXT PRIMARY KEY,
  earned_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS passed_checkpoints (
  course TEXT NOT NULL,
  module INTEGER NOT NULL,
  score REAL NOT NULL,
  at TEXT NOT NULL,
  PRIMARY KEY (course, module)
);
CREATE TABLE IF NOT EXISTS certificates (
  code TEXT PRIMARY KEY,
  course TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  level TEXT NOT NULL,
  lessons INTEGER NOT NULL,
  modules INTEGER NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  issued_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS studies (
  course TEXT PRIMARY KEY,
  last_at TEXT NOT NULL
);
`

/** v2: focus mode sessions (only the summary; no camera image). */
const SCHEMA_V2 = `
CREATE TABLE IF NOT EXISTS focus_sessions (
  id TEXT PRIMARY KEY,
  course TEXT,
  started_at TEXT NOT NULL,
  ended_at TEXT NOT NULL,
  planned_minutes INTEGER NOT NULL,
  focus_seconds INTEGER NOT NULL,
  attentive_seconds INTEGER NOT NULL,
  distractions TEXT NOT NULL DEFAULT '{}',
  camera INTEGER NOT NULL,
  completed INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS focus_sessions_by_date ON focus_sessions (started_at);
`

/** v3: the Feynman block of each module (only the score and the points; no audio, no transcript). */
const SCHEMA_V3 = `
CREATE TABLE IF NOT EXISTS feynman_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  course TEXT NOT NULL,
  module INTEGER NOT NULL,
  score INTEGER NOT NULL,
  passed INTEGER NOT NULL,
  points TEXT NOT NULL DEFAULT '{}',
  engine TEXT NOT NULL,
  at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS feynman_by_module ON feynman_attempts (course, module);
`

/** v4: spaced review — the exercises the student got wrong, each in a Leitner box with the day it comes back. */
const SCHEMA_V4 = `
CREATE TABLE IF NOT EXISTS reviews (
  course TEXT NOT NULL,
  item_key TEXT NOT NULL,
  box INTEGER NOT NULL DEFAULT 0,
  due_day TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (course, item_key)
);
CREATE INDEX IF NOT EXISTS reviews_by_day ON reviews (due_day);
`

function migrate(db: DatabaseSync): void {
  const { user_version: current } = db.prepare('PRAGMA user_version').get() as { user_version: number }
  if (current >= VERSION) return
  db.exec('BEGIN IMMEDIATE')
  try {
    if (current < 1) db.exec(SCHEMA_V1)
    if (current < 2) db.exec(SCHEMA_V2)
    if (current < 3) db.exec(SCHEMA_V3)
    if (current < 4) db.exec(SCHEMA_V4)
    db.exec(`PRAGMA user_version = ${VERSION}`)
    db.exec('COMMIT')
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

export function openDb(filePath: string): DatabaseSync {
  if (filePath !== ':memory:') mkdirSync(path.dirname(filePath), { recursive: true })
  const db = new Sqlite(filePath)
  db.exec('PRAGMA journal_mode = WAL')
  db.exec('PRAGMA foreign_keys = ON')
  migrate(db)
  return db
}

let instance: DatabaseSync | null = null

/** The app database. Tests swap it for a `:memory:` one with `setDb`. */
export function getDb(): DatabaseSync {
  instance ??= openDb(path.join(config.dataFolder, 'progress.sqlite'))
  return instance
}

export function setDb(db: DatabaseSync | null): void {
  instance = db
}

/** Runs `f` in an immediate transaction (takes the write lock up front, no upgrade deadlock). */
export function transaction<T>(db: DatabaseSync, f: () => T): T {
  db.exec('BEGIN IMMEDIATE')
  try {
    const r = f()
    db.exec('COMMIT')
    return r
  } catch (e) {
    db.exec('ROLLBACK')
    throw e
  }
}

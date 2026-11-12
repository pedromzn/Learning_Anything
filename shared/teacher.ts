/**
 * "Ask the teacher": a page of each course where the student talks with Ana, the course teacher, by voice or typing —
 * about the course as a whole (the plan, the modules, what comes next) or about one specific lesson, picked from a
 * list. Ana answers only from the course material, in the course language, and in exercises she gives hints, never
 * answers. With Ollama she converses; without it, she reads the part of the material closest to the question.
 */

import { z } from 'zod'
import type { Language } from './languages.js'
import type { LessonType } from './course.js'
import { turnSchema, type AnaEngine, type AnaState } from './feynman.js'

export const MAX_TEACHER_TURNS = 30

export const teacherRequestSchema = z
  .object({
    /** the conversation about the current subject; the last turn is the student's question */
    history: z.array(turnSchema).min(1).max(MAX_TEACHER_TURNS),
    /** `m1-a2` for one lesson, null for the whole course */
    lessonId: z
      .string()
      .regex(/^m\d{1,2}-a\d{1,2}$/)
      .nullable()
      .default(null),
  })
  .strict()
export type TeacherRequest = z.infer<typeof teacherRequestSchema>

/** What the model must return (checked by zod). */
export const teacherReplySchema = z.object({ answer: z.string().trim().min(1).max(1500) }).strict()

export interface TeacherAnswer {
  answer: string
  engine: AnaEngine
  /** where the answer came from (script mode): "lesson — part", or null */
  source: string | null
}

export interface TeacherLesson {
  id: string
  module: number
  moduleTitle: string
  order: number
  title: string
  type: LessonType
  /** written and in an unlocked module: the teacher can talk about it */
  available: boolean
}

export interface TeacherState {
  ana: AnaState
  language: Language
  courseTitle: string
  lessons: TeacherLesson[]
}

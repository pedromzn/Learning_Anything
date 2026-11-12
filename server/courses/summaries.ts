/**
 * Builds the summaries the API returns (list, detail, lesson) by joining what is in the files (`ReadCourse`) with what
 * the person has already done (SQLite). This is where the "unlocked", "current module" and "completed" rules live.
 */

import type { LessonDetail, LessonSummary, CourseDetail, CourseSummary, ModuleSummary } from '../../shared/api.js'
import type { Brief } from '../../shared/course.js'
import { courseCertificate } from '../progress/gamification.js'
import { completedLessons, passedCheckpoints, studiedAt, courseFeynmans } from '../progress/study.js'
import { find, nextStep, type ReadLesson, type ReadCourse, type ReadModule } from './repository.js'

export interface Progress {
  lessons: Set<string>
  checkpoints: Set<number>
  /** the modules with a passed Feynman block */
  feynman: Set<number>
}

export function progressOf(course: string): Progress {
  return {
    lessons: completedLessons(course),
    checkpoints: passedCheckpoints(course),
    feynman: courseFeynmans(course).passedOnes,
  }
}

/** The previous module's checkpoint was passed (the first one is always unlocked). */
export const moduleUnlocked = (order: number, a: Progress): boolean => order <= 1 || a.checkpoints.has(order - 1)

/** The module the person is on: the first whose checkpoint has not been passed yet (or the last, if finished). */
export function currentModule(course: ReadCourse, a: Progress): number {
  const openOne = course.modules.find((m) => !a.checkpoints.has(m.order))
  return openOne?.order ?? Math.max(1, course.modules.length)
}

export const courseCompleted = (course: ReadCourse, a: Progress): boolean =>
  course.modules.length > 0 && course.modules.every((m) => a.checkpoints.has(m.order))

const truncate = (text: string, max: number) => (text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`)

export function courseSummary(course: ReadCourse, studied: string | null, a = progressOf(course.id)): CourseSummary {
  const courseLessons = course.modules.flatMap((m) => m.lessons)
  return {
    id: course.id,
    title: course.title,
    topic: course.brief.topic,
    level: course.brief.level,
    summary: truncate(course.syllabus?.summary ?? '', 200),
    totalModules: course.modules.length,
    readyModules: course.modules.filter((m) => m.state === 'ready').length,
    totalLessons: courseLessons.length,
    completedLessons: courseLessons.filter((x) => a.lessons.has(x.id)).length,
    currentModule: currentModule(course, a),
    done: courseCompleted(course, a),
    studiedAt: studied,
    updatedAt: course.updatedAt.toISOString(),
    underConstruction: course.underConstruction,
  }
}

/** The list: the most recently studied first, then the newest. */
export function summaryList(courses: ReadCourse[]): CourseSummary[] {
  const studies = studiedAt()
  return courses
    .map((c) => courseSummary(c, studies.get(c.id) ?? null))
    .sort((x, y) => {
      if (x.studiedAt && y.studiedAt) return y.studiedAt.localeCompare(x.studiedAt)
      if (x.studiedAt) return -1
      if (y.studiedAt) return 1
      return y.updatedAt.localeCompare(x.updatedAt)
    })
}

function lessonSummary(lesson: ReadLesson, a: Progress): LessonSummary {
  return {
    id: lesson.id,
    order: lesson.order,
    type: lesson.plan.type,
    title: lesson.plan.title,
    goal: lesson.plan.goal,
    state: lesson.state,
    completed: a.lessons.has(lesson.id),
    ...(lesson.plan.type === 'video' ? { hasVideo: lesson.video !== null } : {}),
  }
}

function moduleSummary(m: ReadModule, a: Progress): ModuleSummary {
  return {
    order: m.order,
    title: m.plan.title,
    goal: m.plan.goal,
    state: m.state,
    skills: m.plan.skills.map(({ id, name, bloom }) => ({ id, name, bloom })),
    project: m.plan.project,
    lessons: m.lessons.map((x) => lessonSummary(x, a)),
    hasFeynman: m.feynman !== null,
    feynmanPassed: a.feynman.has(m.order),
    hasCheckpoint: m.checkpoint !== null,
    checkpointPassed: a.checkpoints.has(m.order),
    unlocked: moduleUnlocked(m.order, a),
    problems: m.problems,
  }
}

export function courseDetail(course: ReadCourse): CourseDetail {
  const a = progressOf(course.id)
  const done = courseCompleted(course, a)
  return {
    id: course.id,
    title: course.title,
    brief: course.brief as CourseDetail['brief'] & Partial<Brief>,
    summary: course.syllabus?.summary ?? '',
    results: course.syllabus?.results ?? [],
    prerequisites: course.syllabus?.prerequisites ?? [],
    bibliography: course.syllabus?.bibliography ?? [],
    modules: course.modules.map((m) => moduleSummary(m, a)),
    currentModule: currentModule(course, a),
    done,
    certificate: done ? courseCertificate(course.id) : null,
    underConstruction: course.underConstruction,
    nextStep: (() => {
      const p = nextStep(course)
      return p
        ? {
            file: p.file,
            module: p.module,
            correction: p.correction,
            problem: p.correction ? (course.problemsByFile[p.file]?.[0] ?? null) : null,
          }
        : null
    })(),
  }
}

/** The next lesson IN THE MODULE (after the last one comes the checkpoint, so null). */
export function nextLesson(course: ReadCourse, lesson: ReadLesson): LessonDetail['next'] {
  const following = find.module(course, lesson.module)?.lessons.find((x) => x.order === lesson.order + 1)
  return following ? { id: following.id, title: following.plan.title, type: following.plan.type } : null
}

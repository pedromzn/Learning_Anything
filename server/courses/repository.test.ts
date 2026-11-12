import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, cpSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config } from '../config.js'
import { invalidateCache, lessonItems, readCourse, readLessonId, listSlugs, nextStep, validSlug } from './repository.js'

const realCourses = config.coursesFolder

describe('the sample courses', () => {
  it('lists both and reads module 1 as ready, the rest as planned', () => {
    const slugs = listSlugs()
    expect(slugs).toEqual(expect.arrayContaining(['marketing-pequenas-empresas', 'russo-basico']))
    for (const slug of ['russo-basico', 'marketing-pequenas-empresas']) {
      const course = readCourse(slug)!
      expect(course.problems).toEqual([])
      expect(course.underConstruction).toBe(false)
      expect(course.modules[0]!.state).toBe('ready')
      expect(course.modules[0]!.lessons).toHaveLength(5)
      expect(course.modules[0]!.lessons.every((a) => lessonItems(a).length > 0 || a.plan.type === 'video')).toBe(true)
      expect(course.modules.slice(1).every((m) => m.state === 'planned')).toBe(true)
      const step = nextStep(course)!
      expect(step.file).toBe('module-2/lesson-1.json')
      expect(step.module).toBe(2)
    }
  })

  it('the slug and the lesson id are locked down by regex', () => {
    expect(validSlug('russo-basico')).toBe(true)
    expect(validSlug('../etc')).toBe(false)
    expect(readCourse('../etc')).toBeNull()
    expect(readLessonId('m1-a2')).toEqual({ module: 1, order: 2 })
    expect(readLessonId('m1-a2/../x')).toBeNull()
    expect(readLessonId('m0-a1')).toBeNull()
  })
})

describe('a temporary course', () => {
  let tmp: string
  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), 'la-courses-'))
    config.coursesFolder = tmp
    invalidateCache()
  })
  afterAll(() => {
    config.coursesFolder = realCourses
    invalidateCache()
    rmSync(tmp, { recursive: true, force: true })
  })

  it('with only the folder: under construction, next step is the brief', () => {
    mkdirSync(path.join(tmp, 'new-course'))
    const course = readCourse('new-course')!
    expect(course.underConstruction).toBe(true)
    expect(course.modules).toEqual([])
    expect(nextStep(course)!.file).toBe('brief.json')
  })

  it('a broken file becomes a problem and the next step (and the cache follows the disk)', () => {
    const origin = path.join(realCourses, 'russo-basico')
    const destination = path.join(tmp, 'broken')
    cpSync(origin, destination, { recursive: true })
    expect(readCourse('broken')!.problems).toEqual([])

    const lesson = path.join(destination, 'module-1', 'lesson-2.json')
    const original = readFileSync(lesson, 'utf8')
    writeFileSync(lesson, '{ "introducao": "x" }')
    const course = readCourse('broken')!
    expect(course.modules[0]!.state).toBe('with_errors')
    expect(course.modules[0]!.lessons[1]!.state).toBe('with_errors')
    expect(course.problemsByFile['module-1/lesson-2.json']?.length).toBeGreaterThan(0)
    expect(nextStep(course)).toMatchObject({ file: 'module-1/lesson-2.json', correction: true })

    writeFileSync(lesson, 'not json')
    expect(readCourse('broken')!.problems.join('\n')).toMatch(/Invalid JSON/)

    writeFileSync(lesson, original)
    expect(readCourse('broken')!.problems).toEqual([])
  })

  it('a module with missing files is partial and the next step is the missing lesson', () => {
    const destination = path.join(tmp, 'partial')
    cpSync(path.join(realCourses, 'russo-basico'), destination, { recursive: true })
    rmSync(path.join(destination, 'module-1', 'checkpoint.json'))
    rmSync(path.join(destination, 'module-1', 'lesson-5.json'))
    const course = readCourse('partial')!
    expect(course.modules[0]!.state).toBe('partial')
    expect(nextStep(course)!.file).toBe('module-1/lesson-5.json')
  })
})

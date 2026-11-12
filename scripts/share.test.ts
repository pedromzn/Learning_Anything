import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { config } from '../server/config.js'
import { allowedPath, checkBundle, exportCourse, importBundle, readShareArgs, type CourseBundle } from './share.js'

const SOURCE = 'russo-basico'
let tmp: string
let from: string
let to: string

beforeEach(() => {
  tmp = mkdtempSync(path.join(os.tmpdir(), 'share-test-'))
  from = path.join(tmp, 'from')
  to = path.join(tmp, 'to')
  // a copy of a real course, so the tests never touch courses/
  cpSync(path.join(config.coursesFolder, SOURCE), path.join(from, SOURCE), { recursive: true })
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

const clone = (b: CourseBundle): CourseBundle => JSON.parse(JSON.stringify(b))

describe('course sharing', () => {
  it('round trip: export then import gives the same files, without videos', async () => {
    const bundle = await exportCourse(SOURCE, from)
    expect(bundle.format).toBe('learning-anything-course')
    expect(Object.keys(bundle.files)).toContain('syllabus.json')
    expect(Object.keys(bundle.files).some((p) => p.includes('.video'))).toBe(false)

    const result = await importBundle(clone(bundle), { coursesFolder: to, as: 'russo-copia' })
    expect(result.slug).toBe('russo-copia')
    for (const [rel, value] of Object.entries(bundle.files)) {
      expect(JSON.parse(readFileSync(path.join(to, 'russo-copia', rel), 'utf8'))).toEqual(value)
    }
    expect(readdirSync(to)).toEqual(['russo-copia']) // no temp folders left behind
  })

  it('rejects path traversal and unknown names before writing anything', async () => {
    const bundle = await exportCourse(SOURCE, from)
    for (const bad of [
      '../evil.json',
      '/etc/x.json',
      'module-1/../../x.json',
      'module-1/lesson-1.video.json',
      'x.js',
    ]) {
      const b = clone(bundle)
      b.files[bad] = {}
      await expect(importBundle(b, { coursesFolder: to })).rejects.toThrow(/not course files/)
    }
    expect(allowedPath('module-2/lesson-10.json')).toBe(true)
    expect(existsSync(to)).toBe(false)
  })

  it('rejects invalid content and an unknown format', async () => {
    const bundle = await exportCourse(SOURCE, from)
    const b = clone(bundle)
    b.files['syllabus.json'] = { title: 'broken' }
    await expect(importBundle(b, { coursesFolder: to })).rejects.toThrow(/does not pass validation/)
    expect(() => checkBundle({ ...bundle, format: 'other' })).toThrow(/format/)
    expect(() => checkBundle({ ...bundle, version: 2 })).toThrow(/version/)
    expect(() => checkBundle({ ...bundle, slug: '../x' })).toThrow(/slug/)
    expect(existsSync(to)).toBe(false)
  })

  it('refuses to export a course that does not validate', async () => {
    writeFileSync(path.join(from, SOURCE, 'syllabus.json'), '{}')
    await expect(exportCourse(SOURCE, from)).rejects.toThrow(/does not pass validation/)
  })

  it('refuses to overwrite without --force, and replaces with it', async () => {
    const bundle = await exportCourse(SOURCE, from)
    await importBundle(clone(bundle), { coursesFolder: to })
    const marker = path.join(to, SOURCE, 'marker.txt')
    writeFileSync(marker, 'old')
    await expect(importBundle(clone(bundle), { coursesFolder: to })).rejects.toThrow(/already exists/)
    expect(existsSync(marker)).toBe(true)
    const result = await importBundle(clone(bundle), { coursesFolder: to, force: true })
    expect(result.replaced).toBe(true)
    expect(existsSync(marker)).toBe(false)
    expect(readdirSync(to)).toEqual([SOURCE])
  })

  it('leaves the personal brief fields out unless asked, and checks the author', async () => {
    const briefFile = path.join(from, SOURCE, 'brief.json')
    const brief = JSON.parse(readFileSync(briefFile, 'utf8'))
    writeFileSync(briefFile, JSON.stringify({ ...brief, goal: 'a trip to Moscow in May', context: 'I work at X' }))
    const shared = await exportCourse(SOURCE, from, { author: 'someone' })
    expect(shared.files['brief.json']).not.toHaveProperty('goal')
    expect(shared.files['brief.json']).not.toHaveProperty('context')
    expect(shared.author).toBe('someone')
    const kept = await exportCourse(SOURCE, from, { personal: true })
    expect(kept.files['brief.json']).toHaveProperty('goal', 'a trip to Moscow in May')
    expect(kept).not.toHaveProperty('author')
    expect(() => checkBundle({ ...shared, author: '<script>' })).toThrow(/author/)
  })

  it('reads its arguments', () => {
    expect(readShareArgs(['f.json', '--as', 'novo', '--force'])).toEqual({
      positional: ['f.json'],
      out: null,
      as: 'novo',
      courses: null,
      force: true,
      keepPersonal: false,
    })
    expect(() => readShareArgs(['--as'])).toThrow()
  })
})

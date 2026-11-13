import express from 'express'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import { readFileSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import '../shared/zodPortuguese.js'
import type { Item } from '../shared/course.js'
import { apiRouter } from './api.js'
import { config } from './config.js'
import { handleError } from './errors.js'
import { getDb, openDb, setDb } from './progress/db.js'
import { localDay } from '../shared/gamification.js'

let server: Server
let base: string
let tmp: string
const originalRequests = config.requestsFolder

beforeAll(async () => {
  tmp = mkdtempSync(path.join(tmpdir(), 'la-api-'))
  config.requestsFolder = path.join(tmp, 'requests')
  setDb(openDb(':memory:'))
  const app = express()
  app.use(express.json())
  app.use('/api', apiRouter)
  app.use('/api', handleError)
  server = await new Promise((ok) => {
    const s = app.listen(0, '127.0.0.1', () => ok(s))
  })
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`
})

afterAll(async () => {
  config.requestsFolder = originalRequests
  setDb(null)
  server.closeAllConnections()
  await new Promise((ok) => server.close(ok))
  rmSync(tmp, { recursive: true, force: true })
})

const apiBase = () => base

async function call(method: string, filePath: string, body?: unknown) {
  const r = await fetch(`${base}${filePath}`, {
    method: method,
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const type = r.headers.get('content-type') ?? ''
  return { status: r.status, json: type.includes('json') ? await r.json() : null, type }
}

const readItemsFromFile = (file: string): Item[] => {
  const j = JSON.parse(readFileSync(path.join(config.coursesFolder, 'russo-basico', file), 'utf8'))
  return j.items ?? j.sections?.map((s: { question: Item }) => s.question)
}

function correctOne(item: Item): unknown {
  switch (item.type) {
    case 'multiple_choice':
      return { type: item.type, choice: item.correct }
    case 'true_false':
      return { type: item.type, value: item.correct }
    case 'numeric':
      return { type: item.type, value: String(item.answer) }
    case 'short_answer':
      return { type: item.type, text: item.accepted[0] }
    case 'ordering':
      return { type: item.type, texts: item.steps }
    default:
      return { type: 'open', text: 'x' }
  }
}

describe('the API', () => {
  it('health and course list', async () => {
    const health = await call('GET', '/health')
    expect(health.json.data).toMatchObject({ ok: true })
    expect(health.json.data.courses).toBeGreaterThanOrEqual(2)
    const list = await call('GET', '/courses')
    const russian = list.json.data.find((c: { id: string }) => c.id === 'russo-basico')
    expect(russian).toMatchObject({
      totalModules: expect.any(Number),
      completedLessons: 0,
      currentModule: 1,
      done: false,
    })
  })

  it('detail: module 1 ready and unlocked, module 2 planned and locked', async () => {
    const { json } = await call('GET', '/courses/russo-basico')
    const d = json.data
    expect(d.modules[0]).toMatchObject({ state: 'ready', unlocked: true, hasCheckpoint: true })
    expect(d.modules[1]).toMatchObject({ state: 'planned', unlocked: false })
    expect(d.nextStep).toMatchObject({ module: 2, correction: false })
    expect((await call('GET', '/courses/nao-existe')).status).toBe(404)
    expect((await call('GET', '/courses/..%2Fx')).status).toBe(404)
  })

  it('the lesson arrives without the answer key; a correct attempt gives XP only once', async () => {
    const detail = await call('GET', '/courses/russo-basico')
    const exercises = detail.json.data.modules[0].lessons.find((a: { type: string }) => a.type === 'exercises')
    const lesson = await call('GET', `/courses/russo-basico/lessons/${exercises.id}`)
    expect(lesson.status).toBe(200)
    const items = lesson.json.data.content.items
    expect(JSON.stringify(items)).not.toMatch(/"solution"|"correct"|"accepted"|"explanation"/)

    const file = `module-1/lesson-${exercises.order}.json`
    const real = readItemsFromFile(file)[0]!
    const url = `/courses/russo-basico/lessons/${exercises.id}/items/${real.id}/attempt`
    const one = await call('POST', url, { answer: correctOne(real), hintsUsed: 0 })
    expect(one.status).toBe(200)
    expect(one.json.data.correct).toBe(true)
    expect(one.json.data.reward.xp).toBeGreaterThan(0)
    const second = await call('POST', url, { answer: correctOne(real) })
    expect(second.json.data.reward.xp).toBe(0)
    expect((await call('POST', url, { answer: { type: 'nada' } })).status).toBe(422)

    const finish = await call('POST', `/courses/russo-basico/lessons/${exercises.id}/finish`)
    expect(finish.json.data.reward.xp).toBeGreaterThanOrEqual(20)
    const profile = await call('GET', '/profile')
    expect(profile.json.data.statistics).toMatchObject({ completedLessons: 1, correct_answers: 1 })
  })

  it('the checkpoint: fails with no correct answers, passes with them, unlocks the next module', async () => {
    const items = JSON.parse(
      readFileSync(path.join(config.coursesFolder, 'russo-basico/module-1/checkpoint.json'), 'utf8'),
    ).items as Item[]
    const openOne = await call('GET', '/courses/russo-basico/modules/1/checkpoint')
    expect(openOne.json.data).toMatchObject({ module: 1, threshold: 0.8, alreadyPassed: false })
    expect(openOne.json.data.items).toHaveLength(items.length)

    const bad = await call('POST', '/courses/russo-basico/modules/1/checkpoint', { answers: {} })
    expect(bad.json.data).toMatchObject({ passed: false, correct_answers: 0, certificate: null })

    const answers = Object.fromEntries(items.map((i) => [i.id, correctOne(i)]))
    const good = await call('POST', '/courses/russo-basico/modules/1/checkpoint', { answers })
    expect(good.json.data).toMatchObject({ passed: true, correct_answers: items.length })
    expect(good.json.data.reward.xp).toBeGreaterThan(0)

    const d = (await call('GET', '/courses/russo-basico')).json.data
    expect(d.modules[0].checkpointPassed).toBe(true)
    expect(d.modules[1].unlocked).toBe(true)
    expect(d.currentModule).toBe(2)
    expect((await call('GET', '/courses/russo-basico/modules/3/checkpoint')).status).toBe(403)
  })

  it('the video only serves names from the closed list', async () => {
    expect((await call('GET', '/courses/russo-basico/lessons/m1-a1/video/..%2Fbrief.json')).status).toBe(404)
    expect((await call('GET', '/courses/russo-basico/lessons/m1-a1/video/qualquer.mp4')).status).toBe(404)
    /* lesson 3 is exercises: it never has a video, with or without a local render */
    expect((await call('GET', '/courses/russo-basico/lessons/m1-a3/video/index.m3u8')).status).toBe(404)
  })

  it('profile and dashboard', async () => {
    const changed = await call('PUT', '/profile', { name: 'Mandy', dailyGoal: 100 })
    expect(changed.json.data).toMatchObject({ name: 'Mandy', dailyGoal: 100 })
    expect((await call('PUT', '/profile', { dailyGoal: 7 })).status).toBe(422)
    const dashboard = (await call('GET', '/dashboard')).json.data
    expect(dashboard.profile.name).toBe('Mandy')
    expect(dashboard.courses.length).toBeGreaterThanOrEqual(2)
    // module 1 was passed and module 2 does not exist yet: there is no lesson to resume
    expect(dashboard.resume).toBeNull()
    expect((await call('GET', '/certificates/ABCD-EFGH-JKMN')).status).toBe(404)
  })

  it('requests: create, list, avoid collisions and delete', async () => {
    const brief = {
      topic: 'Cálculo 1: Limites',
      scope: 'Limites e continuidade',
      goal: 'Passar na prova da faculdade',
      level: 'basic',
      hoursPerWeek: 4,
    }
    const one = await call('POST', '/requests', brief)
    expect(one.status).toBe(201)
    expect(one.json.data).toMatchObject({ slug: 'calculo-1-limites', file: 'requests/calculo-1-limites.json' })
    expect(one.json.data.instruction).toContain('requests/calculo-1-limites.json')
    expect(existsSync(path.join(config.requestsFolder, 'calculo-1-limites.json'))).toBe(true)
    const second = await call('POST', '/requests', brief)
    expect(second.json.data.slug).toBe('calculo-1-limites-2')
    const russian = await call('POST', '/requests', { ...brief, topic: 'Russo básico' })
    expect(russian.json.data.slug).toBe('russo-basico-2')

    expect((await call('GET', '/requests')).json.data).toHaveLength(3)
    expect((await call('POST', '/requests', { topic: 'x' })).status).toBe(422)
    expect((await call('DELETE', '/requests/calculo-1-limites')).status).toBe(200)
    expect((await call('DELETE', '/requests/calculo-1-limites')).status).toBe(404)
    expect((await call('GET', '/requests')).json.data).toHaveLength(2)
  })

  it('events: opens the SSE stream', async () => {
    const controller = new AbortController()
    const r = await fetch(`${base}/events`, { signal: controller.signal })
    expect(r.headers.get('content-type')).toContain('text/event-stream')
    controller.abort()
  })
})

describe('focus mode', () => {
  const session = {
    id: 'sessao-teste-0001',
    course: 'russo-basico',
    startedAt: '2026-11-11T10:00:00.000Z',
    endedAt: '2026-11-11T11:00:00.000Z',
    plannedMinutes: 60,
    focusSeconds: 3000,
    attentiveSeconds: 2400,
    distractions: { phone: 2, away: 1 },
    camera: true,
    completed: false,
  }

  it('says whether the detector is downloaded', async () => {
    const r = await call('GET', '/focus/models')
    expect(r.status).toBe(200)
    expect(r.json.data.files).toHaveLength(2)
    expect(typeof r.json.data.installed).toBe('boolean')
  })

  it('serves the MediaPipe WebAssembly and rejects an unknown model', async () => {
    const wasm = await fetch(`${base}/focus/files/wasm/vision_wasm_internal.js`)
    expect(wasm.status).toBe(200)
    expect((await call('GET', '/focus/files/models/outro.bin')).status).toBe(404)
    expect((await call('GET', '/focus/files/models/..%2F..%2Fpackage.json')).status).toBe(404)
  })

  it('saves the session, updates it by the same id and summarizes', async () => {
    expect((await call('POST', '/focus/sessions', session)).status).toBe(200)
    const r = await call('POST', '/focus/sessions', { ...session, attentiveSeconds: 2700, completed: true })
    expect(r.json.data).toMatchObject({ sessions: 1, focusedMinutes: 45, focusAverage: 90, distractions: { phone: 2 } })
    expect(r.json.data.recent[0]).toMatchObject({ id: session.id, completed: true })
  })

  it('accepts the sendBeacon (text/plain) sent when the tab closes', async () => {
    const r = await fetch(`${base}/focus/sessions`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({ ...session, id: 'sessao-teste-0002', completed: false }),
    })
    expect(r.status).toBe(200)
    expect((await call('GET', '/focus/sessions')).json.data.sessions).toBe(2)
  })

  it('rejects an invalid session', async () => {
    expect((await call('POST', '/focus/sessions', { ...session, attentiveSeconds: 99999 })).status).toBe(422)
    expect((await call('POST', '/focus/sessions', { ...session, id: '../x' })).status).toBe(422)
  })
})

describe('Feynman lesson', () => {
  const base = '/courses/russo-basico/modules/1/feynman'
  // no Ollama on purpose: Mandy must work in script mode
  const hostOriginal = process.env.OLLAMA_HOST
  beforeAll(() => {
    process.env.OLLAMA_HOST = '127.0.0.1:9'
  })
  afterAll(() => {
    if (hostOriginal === undefined) delete process.env.OLLAMA_HOST
    else process.env.OLLAMA_HOST = hostOriginal
  })

  it('delivers the block without the answer key', async () => {
    const r = await call('GET', base)
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({
      module: 1,
      points: 5,
      alreadyPassed: false,
      mandy: { engine: 'script', ollama: false },
    })
    expect(JSON.stringify(r.json.data)).not.toMatch(/keyPoints|cues|commonMistakes/)
  })

  it('talks in script mode and accumulates the covered points', async () => {
    const r = await call('POST', `${base}/conversation`, {
      history: [
        { who: 'mandy', text: 'Por onde eu começo?' },
        { who: 'student', text: 'As 33 letras ficam em três grupos: amigas, falsas amigas e letras novas.' },
      ],
      coveredIds: ['inventado'],
    })
    expect(r.status).toBe(200)
    expect(r.json.data.engine).toBe('script')
    expect(r.json.data.coveredIds).toEqual(['tres-grupos'])
    expect(r.json.data.answer.length).toBeGreaterThan(5)
  })

  it('rejects a conversation that does not end with the student and audio of an odd type', async () => {
    const r = await call('POST', `${base}/conversation`, { history: [{ who: 'mandy', text: 'oi' }] })
    expect(r.status).toBe(422)
    const audio = await fetch(`${apiBase()}${base}/listen`, {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: 'oi',
    })
    expect(audio.status).toBe(415)
  })

  it('evaluates, passes at 70+ and gives the XP only once', async () => {
    const history = [
      { who: 'mandy', text: 'Por onde eu começo?' },
      {
        who: 'student',
        text: 'São 33 letras em três grupos: amigas, falsas amigas e letras novas. A falsa amiga engana: parece um H mas soa como n, parece um P e soa como r, e o X é um h áspero.',
      },
      {
        who: 'student',
        text: 'O acento é livre, cai em qualquer sílaba e não vem marcado. Na vogal átona tem redução: o o vira a e o e vira i, como voda. No fim da palavra a sonora perde a voz e fica surda, druk, e o sinal suave não tem som, só suaviza.',
      },
    ]
    const r1 = await call('POST', `${base}/evaluate`, { history })
    expect(r1.status).toBe(200)
    expect(r1.json.data.engine).toBe('script')
    expect(r1.json.data.passed).toBe(true)
    expect(r1.json.data.score).toBeGreaterThanOrEqual(70)
    expect(r1.json.data.reward.xp).toBeGreaterThanOrEqual(40)
    const r2 = await call('POST', `${base}/evaluate`, { history })
    expect(r2.json.data.reward.xp).toBe(0)
    const course = await call('GET', '/courses/russo-basico')
    expect(course.json.data.modules[0]).toMatchObject({ hasFeynman: true, feynmanPassed: true })
  })

  it('fails an explanation with no content and refuses to evaluate without a student turn', async () => {
    const r = await call('POST', `${base}/evaluate`, { history: [{ who: 'student', text: 'não sei nada disso' }] })
    expect(r.json.data).toMatchObject({ passed: false, score: 0 })
    expect((await call('POST', `${base}/evaluate`, { history: [{ who: 'mandy', text: 'oi' }] })).status).toBe(422)
  })
})

describe('Ask the teacher', () => {
  const base = '/courses/russo-basico/teacher'
  // no Ollama on purpose: Mandy must answer in script mode
  const hostOriginal = process.env.OLLAMA_HOST
  beforeAll(() => {
    process.env.OLLAMA_HOST = '127.0.0.1:9'
  })
  afterAll(() => {
    if (hostOriginal === undefined) delete process.env.OLLAMA_HOST
    else process.env.OLLAMA_HOST = hostOriginal
  })

  it('lists the lessons she can talk about', async () => {
    const r = await call('GET', base)
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ language: 'pt-BR', mandy: { engine: 'script' } })
    const lessons = r.json.data.lessons as Array<{ id: string; available: boolean }>
    expect(lessons.find((l) => l.id === 'm1-a2')?.available).toBe(true)
    expect(lessons.find((l) => l.id === 'm2-a1')?.available).toBe(false)
  })

  it('talks about one lesson, from its closest part', async () => {
    const r = await call('POST', base, {
      lessonId: 'm1-a2',
      history: [{ who: 'student', text: 'O que são as falsas amigas?' }],
    })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ engine: 'script', source: 'As falsas amigas' })
  })

  it('talks about the whole course: modules and lessons', async () => {
    const r = await call('POST', base, { history: [{ who: 'student', text: 'Quando eu aprendo a contar números?' }] })
    expect(r.status).toBe(200)
    expect(r.json.data.source).toMatch(/Módulo \d+/)
    const r2 = await call('POST', base, { history: [{ who: 'student', text: 'O que são as falsas amigas?' }] })
    expect(r2.json.data.source).toMatch(/ — /)
  })

  it('never reads an exercise answer key aloud', async () => {
    const items = readItemsFromFile('module-1/lesson-3.json')
    for (const item of items.slice(0, 4)) {
      const r = await call('POST', base, { lessonId: 'm1-a3', history: [{ who: 'student', text: item.prompt }] })
      expect(r.status).toBe(200)
      if ('solution' in item && item.solution.length > 20) expect(r.json.data.answer).not.toContain(item.solution)
    }
  })

  it('refuses unwritten lessons and a conversation that does not end with the student', async () => {
    const ask = (lessonId: string | null, who = 'student') =>
      call('POST', base, { lessonId, history: [{ who, text: 'oi tudo bem' }] })
    expect((await ask('m2-a1')).status).toBe(409)
    expect((await ask('m9-a9')).status).toBe(404)
    expect((await ask(null, 'mandy')).status).toBe(422)
  })
})

describe('Spaced review', () => {
  const lessonFile = 'module-1/lesson-3.json'
  const exact = () => readItemsFromFile(lessonFile).filter((i) => i.type !== 'open')

  function wrongOne(item: Item): unknown {
    switch (item.type) {
      case 'multiple_choice':
        return { type: item.type, choice: (item.correct + 1) % item.choices.length }
      case 'true_false':
        return { type: item.type, value: !item.correct }
      case 'numeric':
        return { type: item.type, value: String(item.answer + 1000) }
      case 'short_answer':
        return { type: item.type, text: 'zzz nothing like it' }
      default:
        return { type: item.type, texts: [...(item as { steps: string[] }).steps].reverse() }
    }
  }

  /** makes every scheduled review due today (a review normally waits until tomorrow) */
  const bringForward = () => getDb().prepare('UPDATE reviews SET due_day = ?').run(localDay())

  it('a wrong answer comes back the next day, not today', async () => {
    const item = exact()[0]!
    await call('POST', `/courses/russo-basico/lessons/m1-a3/items/${item.id}/attempt`, { answer: wrongOne(item) })
    const today = await call('GET', '/review')
    expect(today.status).toBe(200)
    expect(today.json.data.cards.find((c: { key: string }) => c.key === `m1-a3:${item.id}`)).toBeUndefined()
    expect(today.json.data.upcoming).toBeGreaterThanOrEqual(1)
  })

  it('shows the due exercise without its answer key, and a correct review moves it to the next box', async () => {
    bringForward()
    const item = exact()[0]!
    const today = await call('GET', '/review')
    const card = today.json.data.cards.find((c: { key: string }) => c.key === `m1-a3:${item.id}`)
    expect(card).toMatchObject({ courseId: 'russo-basico', lessonId: 'm1-a3', box: 0 })
    expect(JSON.stringify(card.item)).not.toMatch(/"solution"|"accepted"|"answer":/)
    const r = await call('POST', '/review/attempt', {
      courseId: 'russo-basico',
      key: card.key,
      answer: correctOne(item),
    })
    expect(r.status).toBe(200)
    expect(r.json.data).toMatchObject({ correct: true, next: { box: 1 } })
    expect(r.json.data.reward.xp).toBeGreaterThan(0)
  })

  it('a wrong review sends it back to box 0', async () => {
    bringForward()
    const item = exact()[0]!
    const r = await call('POST', '/review/attempt', {
      courseId: 'russo-basico',
      key: `m1-a3:${item.id}`,
      answer: wrongOne(item),
    })
    expect(r.json.data).toMatchObject({ correct: false, next: { box: 0 } })
  })

  it('refuses unknown exercises and malformed keys', async () => {
    const bad = (key: string) => call('POST', '/review/attempt', { courseId: 'russo-basico', key, answer: {} })
    expect((await bad('m1-a3:nope')).status).toBe(404)
    expect((await bad('../etc:x')).status).toBe(422)
  })
})

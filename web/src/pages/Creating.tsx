/**
 * Creating the course: while the AI writes it, each file it saves shows up here, live (SSE from the events endpoint),
 * newest first; a file that failed the schema shows red until the AI fixes it.
 *
 * Beside it, the stages (request, research, syllabus, module 1 lessons, checkpoint), inferred from what already
 * exists. When module 1 is ready, the button opens the course.
 */

import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Check, CircleNotch, FileText, WarningCircle } from '@phosphor-icons/react'
import type { CourseDetail, CourseEvent } from '@shared/api'
import { api, ApiError, useCourseEvents } from '@/lib/api'
import { LinkButton, Command, Panel, join } from '@/components/ui'
import { t as texts, useT } from '@/i18n'

interface Written {
  file: string
  label: string
  valid: boolean
  at: number
}

function labelOf(file: string): string {
  const o = texts().creating
  if (file === 'brief.json') return o.brief
  if (file === 'dossier.json') return o.research
  if (file === 'syllabus.json') return o.syllabus
  const lesson = file.match(/^module-(\d+)\/lesson-(\d+)\.json$/)
  if (lesson) return o.lesson(lesson[1]!, lesson[2]!)
  const feynman = file.match(/^module-(\d+)\/feynman\.json$/)
  if (feynman) return o.feynman(feynman[1]!)
  const cp = file.match(/^module-(\d+)\/checkpoint\.json$/)
  if (cp) return o.checkpoint(cp[1]!)
  const video = file.match(/^module-(\d+)\/lesson-(\d+)\.video/)
  if (video) return o.video(video[2]!)
  return file
}

/** The files that already exist, from the course detail: the page opens with the list already made. */
function courseFiles(course: CourseDetail): Written[] {
  const list: Written[] = [{ file: 'brief.json', label: labelOf('brief.json'), valid: true, at: 0 }]
  if (course.modules.length) {
    list.push({ file: 'dossier.json', label: labelOf('dossier.json'), valid: true, at: 0 })
    list.push({ file: 'syllabus.json', label: labelOf('syllabus.json'), valid: true, at: 0 })
  }
  for (const m of course.modules) {
    for (const a of m.lessons) {
      if (a.state === 'planned') continue
      const file = `module-${m.order}/lesson-${a.order}.json`
      list.push({ file, label: labelOf(file), valid: a.state === 'ready', at: 0 })
    }
    if (m.hasFeynman) {
      const file = `module-${m.order}/feynman.json`
      list.push({ file, label: labelOf(file), valid: true, at: 0 })
    }
    if (m.hasCheckpoint) {
      const file = `module-${m.order}/checkpoint.json`
      list.push({ file, label: labelOf(file), valid: true, at: 0 })
    }
  }
  return list
}

/** The files the AI has written, newest first: the newest is marked, and a file that failed the schema shows red. */
function FileList({ files }: { files: Written[] }) {
  const t = useT()
  const latest = Math.max(0, ...files.map((f) => f.at))
  const ordered = [...files].reverse()
  return (
    <Panel className="p-5">
      <p className="text-sm text-ink-soft">{t.creating.files(files.length)}</p>
      <ol className="mt-3 divide-y divide-line">
        {ordered.map((f) => {
          const isNew = f.at > 0 && f.at === latest
          return (
            <li key={f.file} className="flex animate-appear items-center gap-3 py-2.5">
              <span
                className={join(
                  'grid h-7 w-7 shrink-0 place-items-center rounded-full',
                  !f.valid ? 'bg-error/12 text-error' : isNew ? 'bg-info/12 text-info' : 'bg-accent/12 text-accent-ink',
                )}
              >
                {f.valid ? <FileText size={15} /> : <WarningCircle size={15} />}
              </span>
              <span className={join('min-w-0 flex-1 truncate', f.valid ? 'text-ink' : 'text-error')}>{f.label}</span>
              <code className="hidden shrink-0 font-mono text-[12px] text-ink-faint sm:block">{f.file}</code>
              {isNew && (
                <span className="shrink-0 rounded-pill bg-info/12 px-2 py-0.5 text-[12px] text-info">
                  {t.creating.now}
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </Panel>
  )
}

type StageState = 'done' | 'now' | 'after' | 'error'

function Stage({ state, title, detail }: { state: StageState; title: string; detail?: string }) {
  return (
    <li className="flex gap-3">
      <span
        className={join(
          'mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full',
          state === 'done' && 'bg-accent text-white',
          state === 'now' && 'bg-info/15 text-info',
          state === 'after' && 'border border-line text-ink-faint',
          state === 'error' && 'bg-error/15 text-error',
        )}
      >
        {state === 'done' ? (
          <Check size={13} weight="bold" />
        ) : state === 'now' ? (
          <CircleNotch size={14} className="animate-spin" />
        ) : state === 'error' ? (
          <WarningCircle size={14} />
        ) : null}
      </span>
      <div>
        <p className={state === 'after' ? 'text-ink-faint' : 'text-ink'}>{title}</p>
        {detail && <p className="text-sm text-ink-faint">{detail}</p>}
      </div>
    </li>
  )
}

export default function Creating() {
  const { slug = '' } = useParams()
  const [course, setCourse] = useState<CourseDetail | null>(null)
  const [exists, setExists] = useState<boolean | null>(null)
  const [files, setFiles] = useState<Written[]>([])
  const t = useT()

  async function load() {
    try {
      const c = await api.get<CourseDetail>(`/api/courses/${slug}`)
      setCourse(c)
      setExists(true)
      setFiles((currentOnes) => {
        const base = courseFiles(c)
        /* keep the order and the "when" of the ones that arrived live; add the ones only the detail knows */
        const byFile = new Map(currentOnes.map((e) => [e.file, e]))
        for (const b of base) {
          const alive = byFile.get(b.file)
          byFile.set(b.file, alive ? { ...alive, valid: b.valid } : b)
        }
        return [...byFile.values()].sort((a, b) => a.at - b.at)
      })
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setExists(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug])

  useCourseEvents((e: CourseEvent) => {
    if (e.courseId !== slug || e.type === 'other') return
    setFiles((currentOnes) => {
      const without = currentOnes.filter((x) => x.file !== e.file)
      return [...without, { file: e.file, label: labelOf(e.file), valid: e.valid, at: Date.parse(e.at) || Date.now() }]
    })
    void load()
  })

  const stages = useMemo(() => {
    const m1 = course?.modules[0]
    const has = (file: string) => files.some((e) => e.file === file)
    const research = has('dossier.json') || Boolean(m1)
    const syllabus = Boolean(m1)
    const readyLessons = m1 ? m1.lessons.filter((a) => a.state === 'ready').length : 0
    const withError = m1 ? m1.lessons.some((a) => a.state === 'with_errors') || m1.state === 'with_errors' : false
    const lessons = m1 ? readyLessons === m1.lessons.length : false
    const feynman = Boolean(m1?.hasFeynman)
    const checkpoint = Boolean(m1?.hasCheckpoint)
    const o = t.creating
    const list: Array<{ state: StageState; title: string; detail?: string }> = [
      { state: 'done', title: o.requestSaved },
      {
        state: exists ? 'done' : 'now',
        title: o.aiOpened,
        detail: exists ? undefined : o.waitingForCommand,
      },
      { state: research ? 'done' : exists ? 'now' : 'after', title: o.researchSources },
      { state: syllabus ? 'done' : research ? 'now' : 'after', title: o.syllabusModules },
      {
        state: withError ? 'error' : lessons ? 'done' : syllabus ? 'now' : 'after',
        title: o.lessonsM1,
        detail: m1 ? o.readyOnes(readyLessons, m1.lessons.length, withError) : undefined,
      },
      { state: feynman ? 'done' : lessons ? 'now' : 'after', title: o.feynmanM1 },
      { state: checkpoint ? 'done' : feynman ? 'now' : 'after', title: o.checkpointM1 },
    ]
    return { list, ready: lessons && feynman && checkpoint }
  }, [course, files, exists, t])

  return (
    <div className="mx-auto max-w-[1180px]">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> {t.nav.home}
      </Link>
      <div className="mt-6 grid items-start gap-10 lg:grid-cols-[380px_minmax(0,1fr)]">
        <div className="animate-appear">
          <p className="text-sm text-accent-ink">{t.creating.title}</p>
          <h1 className="mt-2 text-[clamp(1.7rem,3.4vw,2.5rem)]">{course?.title ?? t.creating.beingBorn}</h1>
          <p className="mt-3 text-ink-soft">
            {t.creating.note1} <code className="font-mono text-ink">courses/{slug}/</code> {t.creating.note2}
          </p>
          <Panel className="mt-6 p-5">
            <ol className="space-y-4">
              {stages.list.map((e) => (
                <Stage key={e.title} {...e} />
              ))}
            </ol>
          </Panel>
          {!exists && <Command className="mt-5" label={t.general.pasteIntoYourAI} text={t.ia.createCourse(slug)} />}
          {stages.ready && (
            <LinkButton to={`/courses/${slug}`} className="mt-6 w-full">
              {t.creating.open}
            </LinkButton>
          )}
        </div>
        <FileList files={files.length ? files : [{ file: 'request', label: t.creating.request, valid: true, at: 0 }]} />
      </div>
    </div>
  )
}

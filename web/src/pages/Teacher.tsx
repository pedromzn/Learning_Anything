/**
 * Ask the teacher: a page of each course where the student talks with Ana, the course teacher — about the whole course
 * or about one lesson picked from the list (`?lesson=m1-a2` opens with it chosen). By voice (Whisper + Kokoro) or
 * typing. The voice starts only when the student asks for it (the browser needs a click to play sound and use the
 * microphone), and the microphone is held only while the student speaks. See `shared/teacher.ts`.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Microphone, MicrophoneSlash, PaperPlaneRight } from '@phosphor-icons/react'
import type { Turn } from '@shared/feynman'
import type { TeacherAnswer, TeacherState } from '@shared/teacher'
import { LANGUAGE_DATA } from '@shared/languages'
import { api, useData } from '@/lib/api'
import { Button, Loading, ScreenError, join } from '@/components/ui'
import { Speech } from '@/feynman/speech'
import { MicRecorder } from '@/feynman/microphone'
import { Orb, type OrbState } from '@/feynman/Orb'
import { textsIn, useT } from '@/i18n'

type Moment = 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'idle'

const MOMENT_ORB: Record<Moment, OrbState> = {
  listening: 'listening',
  transcribing: 'thinking',
  thinking: 'thinking',
  speaking: 'speaking',
  idle: 'idleTimer',
}

/** What the page shows: a turn (with its source, in script mode) or a "now about…" divider. */
type Entry = { kind: 'turn'; turn: Turn; source?: string } | { kind: 'divider'; label: string }

export default function Teacher() {
  const { id = '' } = useParams()
  const { data, error, loading, reload } = useData<TeacherState>(`/api/courses/${id}/teacher`)
  const t = useT()
  if (loading) return <Loading text={t.teacher.loading} className="min-h-dvh" />
  if (error || !data)
    return <ScreenError error={error ?? { message: t.teacher.notFound }} onRetry={() => void reload()} />
  return <Conversation courseId={id} state={data} />
}

function Conversation({ courseId, state }: { courseId: string; state: TeacherState }) {
  const base = `/api/courses/${courseId}/teacher`
  const t = useT()
  const utterances = textsIn(state.language).teacher.utterances
  const [params, setParams] = useSearchParams()
  const initial = state.lessons.find((l) => l.id === params.get('lesson') && l.available)?.id ?? null

  const greetingFor = (lessonId: string | null) => {
    const lesson = state.lessons.find((l) => l.id === lessonId)
    return lesson ? utterances.greetingLesson(lesson.title) : utterances.greetingCourse
  }

  const [lessonId, setLessonId] = useState<string | null>(initial)
  const [entries, setEntries] = useState<Entry[]>([{ kind: 'turn', turn: { who: 'ana', text: greetingFor(initial) } }])
  const [moment, setMoment] = useState<Moment>('idle')
  const [scriptMode, setScriptMode] = useState(!state.ana.ollama)
  const [draft, setDraft] = useState('')
  const [warning, setWarning] = useState<string | null>(null)
  const [canFinish, setCanFinish] = useState(false)

  const level = useRef(0)
  const microphone = useRef<MicRecorder | null>(null)
  const speech = useRef<Speech | null>(null)
  /** the turns about the current subject: only these go to the teacher */
  const subjectTurns = useRef<Turn[]>([{ who: 'ana', text: greetingFor(initial) }])
  const voiceRef = useRef(false)
  const lessonRef = useRef(lessonId)
  lessonRef.current = lessonId
  const active = useRef(true)
  const end = useRef<HTMLDivElement>(null)

  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      microphone.current?.close()
      speech.current?.close()
    }
  }, [])

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [entries, moment])

  useEffect(() => {
    if (moment !== 'listening') return setCanFinish(false)
    const timer = window.setInterval(() => setCanFinish(Boolean(microphone.current?.hadSpeech)), 200)
    return () => window.clearInterval(timer)
  }, [moment])

  function addTurn(turn: Turn, source?: string) {
    subjectTurns.current = [...subjectTurns.current, turn]
    setEntries((e) => [...e, { kind: 'turn', turn, source }])
  }

  /** The voice is created on a click (browsers only play sound after one). */
  function ensureSpeech() {
    if (!speech.current && state.ana.voice)
      speech.current = new Speech((n) => (level.current = n), LANGUAGE_DATA[state.language].anaVoice)
  }

  async function anaSays(text: string) {
    if (!active.current || !speech.current) return
    setMoment('speaking')
    await speech.current.speak(text)
  }

  function studentTurn() {
    if (!active.current) return
    if (microphone.current && voiceRef.current) {
      microphone.current.listen()
      setMoment('listening')
    } else setMoment('idle')
  }

  async function ask(text: string) {
    addTurn({ who: 'student', text })
    setMoment('thinking')
    setWarning(null)
    try {
      const r = await api.post<TeacherAnswer>(base, {
        lessonId: lessonRef.current,
        history: subjectTurns.current.slice(-20),
      })
      if (!active.current) return
      addTurn({ who: 'ana', text: r.answer }, r.source ?? undefined)
      setScriptMode(r.engine === 'script')
      await anaSays(r.answer)
      studentTurn()
    } catch (e) {
      setWarning(e instanceof Error ? e.message : t.teacher.failed)
      setMoment('idle')
    }
  }

  async function heard(audio: Blob) {
    if (!active.current) return
    setMoment('transcribing')
    try {
      const query = lessonRef.current ? `?lesson=${lessonRef.current}` : ''
      const r = await fetch(`${base}/listen${query}`, {
        method: 'POST',
        headers: { 'Content-Type': audio.type },
        body: audio,
      })
      const j = (await r.json()) as { data?: { text: string }; error?: string }
      if (!r.ok) throw new Error(j.error ?? t.general.serverResponded(r.status))
      const text = j.data?.text.trim() ?? ''
      if (text.split(/\s+/).filter(Boolean).length < 2) {
        await anaSays(utterances.repeat)
        studentTurn()
        return
      }
      await ask(text)
    } catch (e) {
      setWarning(e instanceof Error ? e.message : t.feynman.couldNotTranscribe)
      setMoment('idle')
    }
  }

  async function startVoice() {
    setWarning(null)
    ensureSpeech()
    if (!microphone.current && state.ana.listener) {
      try {
        microphone.current = await MicRecorder.open({
          onLevel: (n) => (level.current = n),
          onSpeak: (audio) => void heard(audio),
        })
      } catch (e) {
        const name = (e as { name?: string })?.name
        setWarning(name === 'NotAllowedError' ? t.feynman.microphoneDenied : t.feynman.microphoneFailed)
      }
    }
    voiceRef.current = true
    const last = subjectTurns.current.at(-1)
    if (last?.who === 'ana') await anaSays(last.text)
    if (microphone.current && active.current) {
      microphone.current.listen()
      setMoment('listening')
    } else setMoment('idle')
  }

  function pauseVoice() {
    microphone.current?.stop()
    speech.current?.stop()
    voiceRef.current = false
    setMoment('idle')
  }

  function chooseSubject(value: string) {
    const next = value === 'course' ? null : value
    if (next === lessonId) return
    microphone.current?.stop()
    speech.current?.stop()
    setLessonId(next)
    lessonRef.current = next
    setParams(next ? { lesson: next } : {}, { replace: true })
    const lesson = state.lessons.find((l) => l.id === next)
    const label = lesson ? lesson.title : t.teacher.wholeCourse
    const greeting = greetingFor(next)
    subjectTurns.current = [{ who: 'ana', text: greeting }]
    setEntries((e) => [
      ...e,
      { kind: 'divider', label: t.teacher.nowAbout(label) },
      { kind: 'turn', turn: { who: 'ana', text: greeting } },
    ])
    if (voiceRef.current) void anaSays(greeting).then(studentTurn)
    else setMoment('idle')
  }

  function sendTyped(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || moment === 'thinking' || moment === 'transcribing') return
    setDraft('')
    microphone.current?.stop()
    speech.current?.stop()
    ensureSpeech()
    void ask(text)
  }

  const busy = moment === 'thinking' || moment === 'transcribing'
  const modules = [...new Map(state.lessons.map((l) => [l.module, l.moduleTitle])).entries()]

  return (
    <div className="mx-auto flex h-dvh max-w-3xl flex-col px-4 pt-5 pb-4 sm:px-6">
      <Link
        to={`/courses/${courseId}`}
        className="inline-flex items-center gap-1.5 self-start text-[14px] text-ink-soft hover:text-ink"
      >
        <ArrowLeft size={16} aria-hidden /> {t.general.backToCourse}
      </Link>

      <header className="mt-4 flex shrink-0 items-center gap-4">
        <div className="shrink-0 self-start">
          <Orb state={MOMENT_ORB[moment]} level={level} size={96} />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[clamp(1.6rem,4vw,2.3rem)] leading-tight">{t.teacher.title}</h1>
          <p className="truncate text-[14px] text-ink-faint">{state.courseTitle}</p>
          <p className="mt-1 text-[13px] text-ink-soft" aria-live="polite">
            {t.teacher.moments[moment]}
          </p>
        </div>
      </header>

      <p className="mt-4 hidden text-[14px] text-ink-soft sm:block">{t.teacher.intro}</p>

      <label className="mt-4 flex flex-col gap-1.5 text-[13px] text-ink-faint">
        {t.teacher.subject}
        <select
          value={lessonId ?? 'course'}
          onChange={(e) => chooseSubject(e.target.value)}
          disabled={busy}
          className="h-11 rounded-tile border border-line bg-sunken px-3 text-[15px] text-ink outline-none focus:border-accent-ink"
        >
          <option value="course">{t.teacher.wholeCourse}</option>
          {modules.map(([n, title]) => (
            <optgroup key={n} label={t.teacher.moduleGroup(n, title)}>
              {state.lessons
                .filter((l) => l.module === n)
                .map((l) => (
                  <option key={l.id} value={l.id} disabled={!l.available}>
                    {t.teacher.lessonOption(l.order, l.title, l.available)}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
      </label>

      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto pr-1" aria-live="polite">
        {entries.map((entry, i) =>
          entry.kind === 'divider' ? (
            <p
              key={i}
              className="my-2 self-center rounded-pill border border-line px-3 py-1 text-[12px] text-ink-faint"
            >
              {entry.label}
            </p>
          ) : (
            <div
              key={i}
              className={join(
                'max-w-[85%] rounded-tile px-4 py-3 text-[15px] leading-relaxed',
                entry.turn.who === 'ana' ? 'self-start bg-accent/15 text-ink' : 'self-end bg-tint text-ink-soft',
              )}
            >
              {entry.turn.text}
              {entry.source ? (
                <p className="mt-1.5 text-[12px] text-ink-faint">{t.teacher.fromPart(entry.source)}</p>
              ) : null}
            </div>
          ),
        )}
        <div ref={end} />
      </div>

      <div className="mt-3 flex shrink-0 flex-col gap-2 border-t border-line pt-3">
        {scriptMode ? <p className="text-[12px] text-ink-faint">{t.teacher.scriptNote}</p> : null}
        {!state.ana.voice ? <p className="text-[12px] text-ink-faint">{t.teacher.noVoice}</p> : null}
        {!state.ana.listener ? <p className="text-[12px] text-ink-faint">{t.teacher.noListener}</p> : null}
        {warning ? <p className="text-[13px] text-error">{warning}</p> : null}

        {moment === 'listening' ? (
          <div className="flex gap-2">
            <Button
              variant="subtle"
              size="small"
              className="flex-1"
              onClick={() => microphone.current?.finish()}
              disabled={!canFinish}
            >
              {t.teacher.doneAsking}
            </Button>
            <Button variant="ghost" size="small" icon={<MicrophoneSlash size={16} />} onClick={pauseVoice}>
              {t.teacher.pauseMicrophone}
            </Button>
          </div>
        ) : null}

        <form onSubmit={sendTyped} className="flex items-center gap-2">
          {state.ana.listener && moment !== 'listening' ? (
            <button
              type="button"
              onClick={() => void startVoice()}
              disabled={busy || moment === 'speaking'}
              aria-label={t.teacher.talkByVoice}
              title={t.teacher.talkByVoice}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-line text-ink-soft hover:border-accent-ink hover:text-ink disabled:opacity-40"
            >
              <Microphone size={18} />
            </button>
          ) : null}
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onFocus={() => moment === 'listening' && pauseVoice()}
            placeholder={t.teacher.placeholder}
            aria-label={t.teacher.placeholder}
            maxLength={600}
            className="h-11 min-w-0 flex-1 rounded-pill border border-line bg-sunken px-4 text-[15px] text-ink outline-none placeholder:text-ink-faint focus:border-accent-ink"
          />
          <button
            type="submit"
            disabled={!draft.trim() || busy}
            aria-label={t.teacher.send}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent text-white disabled:opacity-40"
          >
            <PaperPlaneRight size={16} weight="fill" />
          </button>
        </form>
      </div>
    </div>
  )
}

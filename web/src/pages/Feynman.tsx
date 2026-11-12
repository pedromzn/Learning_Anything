/**
 * The Feynman lesson: the student teaches the module's central topic to Ana, out loud. Ana (the orb) listens,
 * thinks and answers by voice, asks and corrects; at the end, the evaluation shows each central point. Without a
 * microphone or without Whisper, the student can type. See `docs/FEYNMAN.md`.
 */

import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowsClockwise,
  CheckCircle,
  Keyboard,
  Microphone,
  MicrophoneSlash,
  PaperPlaneRight,
  Target,
  WarningCircle,
  XCircle,
} from '@phosphor-icons/react'
import {
  FEYNMAN_MIN_SCORE,
  MAX_TURNS,
  type FeynmanEvaluation,
  type StudentFeynman,
  type Turn,
  type AnaTurn,
} from '@shared/feynman'
import { api, useData } from '@/lib/api'
import { announce } from '@/lib/rewards'
import { Button, LinkButton, Loading, Command, ScreenError, Panel, Badge, join } from '@/components/ui'
import { Speech } from '@/feynman/speech'
import { MicRecorder } from '@/feynman/microphone'
import { Orb, type OrbState } from '@/feynman/Orb'
import { textsIn, useT } from '@/i18n'
import { LANGUAGE_DATA } from '@shared/languages'

type Stage = 'start' | 'conversation' | 'evaluating' | 'result'
type Moment = 'listening' | 'transcribing' | 'thinking' | 'speaking' | 'idle'

const MOMENT_ORB: Record<Moment, OrbState> = {
  listening: 'listening',
  transcribing: 'thinking',
  thinking: 'thinking',
  speaking: 'speaking',
  idle: 'idleTimer',
}

export default function Feynman() {
  const { id = '', order = '1' } = useParams()
  const base = `/api/courses/${id}/modules/${order}/feynman`
  const { data: block, error, loading, reload } = useData<StudentFeynman>(base)
  const t = useT()

  const [stage, setStage] = useState<Stage>('start')
  const [moment, setMoment] = useState<Moment>('idle')
  const [history, setHistory] = useState<Turn[]>([])
  const [coveredIds, setCovered] = useState<string[]>([])
  const [correction, setCorrection] = useState<string | null>(null)
  const [typing, setTyping] = useState(false)
  const [draft, setDraft] = useState('')
  const [warning, setWarning] = useState<string | null>(null)
  const [result, setResult] = useState<FeynmanEvaluation | null>(null)
  const [canEndSpeech, setCanEndSpeech] = useState(false)

  const level = useRef(0)
  const microphone = useRef<MicRecorder | null>(null)
  const speech = useRef<Speech | null>(null)
  const historyRef = useRef<Turn[]>([])
  const coveredPointsRef = useRef<string[]>([])
  const active = useRef(true)
  // the callbacks the microphone keeps read from here, not from state (which goes stale inside them)
  const typingRef = useRef(typing)
  typingRef.current = typing
  const conversationEnd = useRef<HTMLDivElement>(null)

  // leaving the screen turns everything off
  useEffect(() => {
    active.current = true
    return () => {
      active.current = false
      microphone.current?.close()
      speech.current?.close()
    }
  }, [])

  useEffect(() => {
    conversationEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [history, moment])

  // while listening, check now and then whether there was speech (to enable the "Done, I spoke" button)
  useEffect(() => {
    if (moment !== 'listening') return setCanEndSpeech(false)
    const t = window.setInterval(() => setCanEndSpeech(Boolean(microphone.current?.hadSpeech)), 200)
    return () => window.clearInterval(t)
  }, [moment])

  if (loading) return <Loading text={t.feynman.calling} className="min-h-dvh" />
  if (error || !block)
    return <ScreenError error={error ?? { message: t.feynman.notFound }} onRetry={() => void reload()} />

  const currentBlock = block
  // Ana speaks the course language; the buttons follow the interface
  const utterances = textsIn(currentBlock.language).feynman.utterances
  const back = `/courses/${id}`

  function append(t: Turn) {
    historyRef.current = [...historyRef.current, t]
    setHistory(historyRef.current)
  }

  async function anaSpeech(text: string) {
    if (!active.current) return
    setMoment('speaking')
    await speech.current?.speak(text)
  }

  function studentTurn() {
    if (!active.current) return
    if (historyRef.current.length >= MAX_TURNS - 1) {
      setWarning(t.feynman.longConversation)
      setMoment('idle')
      return
    }
    if (microphone.current && !typingRef.current) {
      microphone.current.listen()
      setMoment('listening')
    } else setMoment('idle')
  }

  async function handleSpeech(audio: Blob) {
    if (!active.current) return
    setMoment('transcribing')
    try {
      const r = await fetch(`${base}/listen`, { method: 'POST', headers: { 'Content-Type': audio.type }, body: audio })
      const j = (await r.json()) as { data?: { text: string }; error?: string }
      if (!r.ok) throw new Error(j.error ?? t.general.serverResponded(r.status))
      const text = j.data?.text.trim() ?? ''
      if (text.split(/\s+/).filter(Boolean).length < 2) {
        await anaSpeech(utterances.repeat)
        studentTurn()
        return
      }
      await sendSpeech(text)
    } catch (e) {
      setWarning(e instanceof Error ? e.message : t.feynman.couldNotTranscribe)
      setMoment('idle')
    }
  }

  async function sendSpeech(text: string) {
    append({ who: 'student', text })
    setMoment('thinking')
    setCorrection(null)
    try {
      const r = await api.post<AnaTurn>(`${base}/conversation`, {
        history: historyRef.current,
        coveredIds: coveredPointsRef.current,
      })
      if (!active.current) return
      coveredPointsRef.current = r.coveredIds
      setCovered(r.coveredIds)
      setCorrection(r.correction)
      append({ who: 'ana', text: r.answer })
      await anaSpeech(r.answer)
      studentTurn()
    } catch (e) {
      setWarning(e instanceof Error ? e.message : t.feynman.anaNoReply)
      setMoment('idle')
    }
  }

  async function getStarted() {
    setWarning(null)
    speech.current = new Speech((n) => (level.current = n), LANGUAGE_DATA[currentBlock.language].anaVoice)
    if (currentBlock.ana.listener && !typingRef.current) {
      try {
        microphone.current = await MicRecorder.open({
          onLevel: (n) => (level.current = n),
          onSpeak: (audio) => void handleSpeech(audio),
        })
      } catch (e) {
        const name = (e as { name?: string })?.name
        setWarning(name === 'NotAllowedError' ? t.feynman.microphoneDenied : t.feynman.microphoneFailed)
        setTyping(true)
      }
    } else setTyping(true)
    setStage('conversation')
    append({ who: 'ana', text: currentBlock.opening })
    await anaSpeech(currentBlock.opening)
    studentTurn()
  }

  function sendTyped(e: FormEvent) {
    e.preventDefault()
    const text = draft.trim()
    if (!text || moment === 'thinking' || moment === 'transcribing') return
    setDraft('')
    speech.current?.stop()
    void sendSpeech(text)
  }

  function toggleMicrophone() {
    if (moment === 'listening') {
      microphone.current?.stop()
      setMoment('idle')
    } else if (moment === 'idle' && microphone.current) {
      setTyping(false)
      microphone.current.listen()
      setMoment('listening')
    }
  }

  async function finish() {
    microphone.current?.stop()
    speech.current?.stop()
    setStage('evaluating')
    setMoment('thinking')
    try {
      const r = await api.post<FeynmanEvaluation>(`${base}/evaluate`, { history: historyRef.current })
      setResult(r)
      announce(r.reward)
      setStage('result')
      setMoment('idle')
      void speech.current?.speak(r.passed ? utterances.goodScore(r.score) : utterances.badScore(r.score))
    } catch (e) {
      setWarning(e instanceof Error ? e.message : t.feynman.couldNotEvaluate)
      setStage('conversation')
      setMoment('idle')
    }
  }

  function again() {
    microphone.current?.close()
    microphone.current = null
    speech.current?.close()
    speech.current = null
    historyRef.current = []
    coveredPointsRef.current = []
    setHistory([])
    setCovered([])
    setCorrection(null)
    setResult(null)
    setWarning(null)
    setStage('start')
    setMoment('idle')
  }

  const studentUtterances = history.filter((t) => t.who === 'student').length

  return (
    <div className="mx-auto flex min-h-dvh max-w-3xl flex-col px-4 pt-5 pb-10 sm:px-6">
      <header className="flex items-center gap-3">
        <Link
          to={back}
          className="rounded-full p-2 text-ink-soft hover:bg-ink/5 hover:text-ink"
          aria-label={t.general.backToCourse}
        >
          <ArrowLeft size={20} />
        </Link>
        <div className="min-w-0">
          <p className="truncate text-sm text-ink-soft">
            {t.general.courseModule(currentBlock.courseTitle, currentBlock.module)}
          </p>
          <h1 className="truncate text-[clamp(1.1rem,3vw,1.4rem)]">{t.feynman.title}</h1>
        </div>
        {stage === 'conversation' && (
          <Badge
            tone={coveredIds.length === currentBlock.points ? 'achievement' : 'neutral'}
            className="ml-auto shrink-0"
          >
            {t.feynman.ideas(coveredIds.length, currentBlock.points)}
          </Badge>
        )}
      </header>

      {stage === 'start' && (
        <Start
          block={currentBlock}
          warning={warning}
          onStart={() => void getStarted()}
          onType={setTyping}
          typing={typing}
        />
      )}

      {(stage === 'conversation' || stage === 'evaluating') && (
        <div className="mt-4 flex flex-1 flex-col">
          <div className="flex flex-col items-center">
            <Orb state={MOMENT_ORB[moment]} level={level} size={220} />
            <p className="-mt-2 text-sm text-ink-soft" aria-live="polite">
              {stage === 'evaluating' ? t.feynman.evaluating : t.feynman.moments[moment]}
            </p>
          </div>

          {correction && (
            <div className="mt-4 flex gap-2 rounded-tile border border-error/40 bg-error/10 p-3 text-sm">
              <WarningCircle size={18} className="mt-0.5 shrink-0 text-error" />
              <span className="text-ink">
                <strong className="text-error">{t.feynman.attention}</strong> {correction}
              </span>
            </div>
          )}

          <div
            className="mt-4 flex max-h-[38vh] flex-col gap-2.5 overflow-y-auto pr-1"
            aria-label={t.feynman.conversation}
          >
            {history.map((turn, i) => (
              <div
                key={i}
                className={join(
                  'max-w-[85%] animate-appear rounded-tile px-4 py-2.5 text-[15px] leading-relaxed',
                  turn.who === 'student' ? 'self-end bg-accent/25 text-ink' : 'card self-start text-ink',
                )}
              >
                <span className="mb-0.5 block text-[11px] text-ink-faint">
                  {turn.who === 'student' ? t.feynman.you : 'Ana'}
                </span>
                {turn.text}
              </div>
            ))}
            <div ref={conversationEnd} />
          </div>

          {warning && (
            <p className="mt-3 rounded-tile border border-gold/30 bg-gold/8 p-3 text-sm text-ink">{warning}</p>
          )}

          {stage === 'conversation' && (
            <div className="mt-auto pt-4">
              {typing || !microphone.current ? (
                <form onSubmit={sendTyped} className="flex gap-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) sendTyped(e)
                    }}
                    rows={2}
                    maxLength={3000}
                    placeholder={t.feynman.writePlaceholder}
                    className="card min-h-12 flex-1 resize-none rounded-tile px-4 py-3 text-ink outline-none placeholder:text-ink-faint focus:border-accent"
                    aria-label={t.feynman.yourExplanation}
                  />
                  <Button
                    type="submit"
                    className="h-auto self-stretch"
                    disabled={!draft.trim() || moment === 'thinking'}
                    aria-label={t.feynman.send}
                  >
                    <PaperPlaneRight size={18} weight="fill" />
                  </Button>
                </form>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                {microphone.current && !typing && (
                  <>
                    <Button variant="subtle" onClick={() => microphone.current?.finish()} disabled={!canEndSpeech}>
                      Pronto, falei
                    </Button>
                    <Button
                      variant="ghost"
                      icon={moment === 'listening' ? <MicrophoneSlash size={18} /> : <Microphone size={18} />}
                      onClick={toggleMicrophone}
                      disabled={moment !== 'listening' && moment !== 'idle'}
                    >
                      {moment === 'listening' ? t.feynman.pauseNow : t.feynman.speak}
                    </Button>
                  </>
                )}
                {microphone.current && (
                  <Button
                    variant="ghost"
                    icon={typing ? <Microphone size={18} /> : <Keyboard size={18} />}
                    onClick={() => {
                      microphone.current?.stop()
                      setMoment('idle')
                      setTyping((d) => !d)
                    }}
                  >
                    {typing ? t.feynman.enableVoice : t.feynman.typeMode}
                  </Button>
                )}
                <Button
                  onClick={() => void finish()}
                  disabled={studentUtterances === 0 || moment === 'thinking' || moment === 'transcribing'}
                >
                  {t.feynman.doneExplaining}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {stage === 'result' && result && (
        <Result result={result} courseId={id} module={currentBlock.module} onRetry={again} />
      )}
    </div>
  )
}

function Start({
  block,
  warning,
  onStart,
  typing,
  onType,
}: {
  block: StudentFeynman
  warning: string | null
  onStart: () => void
  typing: boolean
  onType: (v: boolean) => void
}) {
  const level = useRef(0)
  const t = useT()
  return (
    <div className="mt-6 flex flex-col items-center gap-6 text-center">
      <Orb state="idleTimer" level={level} size={200} />
      <div>
        <p className="text-sm text-info">{t.feynman.technique}</p>
        <h2 className="mt-1 text-[clamp(1.4rem,4vw,2rem)]">{block.topic}</h2>
        <p className="mx-auto mt-3 max-w-xl text-ink-soft">{block.request}</p>
        <p className="mx-auto mt-2 max-w-xl text-sm text-ink-faint">
          {t.feynman.startNote(block.points, FEYNMAN_MIN_SCORE)}
          {block.bestScore !== null && t.feynman.bestScore(block.bestScore)}
        </p>
      </div>

      <Panel className="w-full max-w-xl p-4 text-left text-sm">
        <ul className="flex flex-col gap-2">
          <Requirement ok={block.ana.listener} text={t.feynman.listener} missingText={t.feynman.listenerMissing} />
          <Requirement ok={block.ana.voice} text={t.feynman.voice} missingText={t.feynman.voiceMissing} />
          <Requirement
            ok={block.ana.ollama}
            text={block.ana.ollama ? t.feynman.brainWith(block.ana.model ?? '') : t.feynman.brain}
            missingText={t.feynman.brainMissing}
          />
        </ul>
        {(!block.ana.listener || !block.ana.voice || !block.ana.ollama) && (
          <div className="mt-3">
            <p className="mb-2 text-ink-faint">{t.feynman.toEnable}</p>
            <Command text="npm run feynman:install" />
          </div>
        )}
      </Panel>

      {warning && (
        <p className="max-w-xl rounded-tile border border-gold/30 bg-gold/8 p-3 text-sm text-ink">{warning}</p>
      )}

      <div className="flex flex-wrap justify-center gap-2">
        <Button
          size="large"
          icon={typing ? <Keyboard size={20} /> : <Microphone size={20} weight="fill" />}
          onClick={onStart}
        >
          {typing ? t.feynman.startTyping : t.feynman.startExplaining}
        </Button>
        {block.ana.listener && (
          <Button variant="ghost" onClick={() => onType(!typing)}>
            {typing ? t.feynman.preferSpeaking : t.feynman.preferTyping}
          </Button>
        )}
      </div>
      <p className="max-w-md text-[13px] text-ink-faint">{t.feynman.privacy}</p>
    </div>
  )
}

function Requirement({ ok, text, missingText }: { ok: boolean; text: string; missingText: string }) {
  return (
    <li className="flex gap-2">
      {ok ? (
        <CheckCircle size={18} weight="fill" className="mt-0.5 shrink-0 text-success" />
      ) : (
        <WarningCircle size={18} className="mt-0.5 shrink-0 text-gold" />
      )}
      <span>
        <span className="text-ink">{text}</span>
        {!ok && <span className="block text-ink-faint">{missingText}</span>}
      </span>
    </li>
  )
}

const STATUS_ICON = {
  covered: <CheckCircle size={20} weight="fill" className="shrink-0 text-success" />,
  partial: <WarningCircle size={20} weight="fill" className="shrink-0 text-gold" />,
  missing: <XCircle size={20} weight="fill" className="shrink-0 text-error" />,
} as const

function Result({
  result: r,
  courseId,
  module,
  onRetry,
}: {
  result: FeynmanEvaluation
  courseId: string
  module: number
  onRetry: () => void
}) {
  const t = useT()
  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-col items-center text-center">
        <span
          className={join(
            'font-display text-[clamp(3rem,10vw,4.5rem)] leading-none',
            r.passed ? 'text-gold' : 'text-ink',
          )}
        >
          {r.score}
        </span>
        <p className="mt-2 text-ink-soft">{r.passed ? t.feynman.passed : t.feynman.almostThere(FEYNMAN_MIN_SCORE)}</p>
        {r.engine === 'script' && <p className="mt-1 text-[13px] text-ink-faint">{t.feynman.scriptMode}</p>}
      </div>

      <Panel className="p-0">
        <ul className="divide-y divide-line">
          {r.points.map((p) => (
            <li key={p.id} className="flex gap-3 px-5 py-4">
              {STATUS_ICON[p.status]}
              <div>
                <p className="text-ink">{p.idea}</p>
                <p className="mt-1 text-sm text-ink-soft">{p.comment}</p>
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      {r.errors.length > 0 && (
        <Panel className="border-error/30 p-5">
          <h3 className="text-[16px] text-error">{t.feynman.whatWasWrong}</h3>
          <ul className="mt-2 flex flex-col gap-1.5 text-sm text-ink">
            {r.errors.map((e) => (
              <li key={e} className="flex gap-2">
                <XCircle size={16} className="mt-0.5 shrink-0 text-error" />
                {e}
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <p className="text-center text-ink-soft">{r.advice}</p>

      <div className="flex flex-wrap justify-center gap-2">
        <Button variant="subtle" icon={<ArrowsClockwise size={18} />} onClick={onRetry}>
          {t.feynman.explainAgain}
        </Button>
        <LinkButton to={`/courses/${courseId}/modules/${module}/checkpoint`} icon={<Target size={18} />}>
          {t.feynman.goToCheckpoint}
        </LinkButton>
      </div>
    </div>
  )
}

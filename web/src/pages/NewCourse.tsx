/**
 * New course: the brief in five short steps. Beside it, a protostar that gains mass with each answer; at the end,
 * the request becomes a file in `requests/` and the screen shows the command to paste into the AI. The app does not
 * write the course: the user's own AI researches and writes it, following AGENTS.md.
 */

import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Check } from '@phosphor-icons/react'
import type { CreatedRequest } from '@shared/api'
import { LEVELS, FORMAT_PREFERENCES, type Level } from '@shared/course'
import { LANGUAGE_DATA, LANGUAGES, type Language } from '@shared/languages'
import { useLanguage, useT } from '@/i18n'
import { api, ApiError } from '@/lib/api'
import { Button, Command, Panel, join } from '@/components/ui'

interface Draft {
  topic: string
  scope: string
  goal: string
  level: Level
  priorKnowledge: string
  hoursPerWeek: number
  deadlineWeeks: number | null
  format: (typeof FORMAT_PREFERENCES)[number]
  context: string
  hasComputer: boolean
  readsEnglish: boolean
  language: Language
}

const INITIAL: Draft = {
  topic: '',
  scope: '',
  goal: '',
  level: 'intermediate',
  priorKnowledge: '',
  hoursPerWeek: 4,
  deadlineWeeks: null,
  format: 'balanced',
  context: '',
  hasComputer: true,
  readsEnglish: false,
  language: 'en',
}

const FIELD =
  'w-full rounded-tile border border-line bg-card px-4 py-3 text-ink placeholder:text-ink-faint transition-[border-color,box-shadow] focus:border-accent-ink focus: focus:outline-none'

function Label({ children, hint }: { children: ReactNode; hint?: string }) {
  return (
    <span className="mb-2 block">
      <span className="text-ink">{children}</span>
      {hint && <span className="block text-sm text-ink-faint">{hint}</span>}
    </span>
  )
}

function Choice({
  active,
  onClick,
  children,
  className,
}: {
  active: boolean
  onClick: () => void
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={join(
        'rounded-tile border text-left transition-[border-color,background,box-shadow]',
        active ? 'border-accent-ink bg-accent/15' : 'border-line bg-white/[0.02] hover:border-line-strong',
        className,
      )}
    >
      {children}
    </button>
  )
}

/** The brief as a notebook sheet: a line is written for each answered question, and a stamp marks it done. */
function BriefSheet({ step, total, born }: { step: number; total: number; born: boolean }) {
  const filled = born ? total : step
  return (
    <div className="card relative w-full max-w-[300px] rotate-[-1.5deg] rounded-tile p-7 pl-10" aria-hidden>
      {/* the margin line of a school notebook */}
      <span className="absolute inset-y-0 left-6 w-px bg-info/40" />
      <span className="block h-2.5 w-24 rounded-pill bg-ink/70" />
      <div className="mt-6 flex flex-col gap-4">
        {Array.from({ length: total }, (_, i) => (
          <span key={i} className="relative block h-px bg-line-strong">
            <span
              className="absolute -top-2 left-0 h-1.5 rounded-pill bg-accent/70 transition-all duration-700"
              style={{ width: i < filled ? `${55 + ((i * 37) % 40)}%` : '0%' }}
            />
          </span>
        ))}
      </div>
      {born && (
        <span className="absolute -right-3 -bottom-3 grid h-14 w-14 rotate-12 animate-pop place-items-center rounded-full border-2 border-accent bg-card text-accent">
          <Check size={26} weight="bold" />
        </span>
      )}
    </div>
  )
}

export default function NewCourse() {
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const t = useT()
  const appLanguage = useLanguage((s) => s.language)
  const [f, setF] = useState<Draft>(() => ({ ...INITIAL, language: appLanguage, readsEnglish: appLanguage === 'en' }))
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [request, setRequest] = useState<CreatedRequest | null>(null)

  const change = <K extends keyof Draft>(field: K, value: Draft[K]) =>
    setF((current) => ({ ...current, [field]: value }))

  const steps: Array<{ question: string; note: string; ready: boolean; body: ReactNode }> = [
    {
      question: t.fresh.q1,
      note: t.fresh.q1Note,
      ready: f.topic.trim().length >= 2,
      body: (
        <>
          <input
            autoFocus
            className={join(FIELD, 'font-display text-xl')}
            value={f.topic}
            maxLength={200}
            placeholder={t.fresh.q1Example}
            onChange={(e) => change('topic', e.target.value)}
            aria-label={t.fresh.topic}
          />
          <div className="mt-4 flex flex-wrap gap-2">
            {t.fresh.suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => change('topic', s)}
                className="rounded-pill border border-line px-3 py-1 text-sm text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        </>
      ),
    },
    {
      question: t.fresh.q2,
      note: t.fresh.q2Note,
      ready: f.scope.trim().length >= 2 && f.goal.trim().length >= 2,
      body: (
        <div className="space-y-5">
          <label className="block">
            <Label hint={t.fresh.scopeHint(f.topic)}>{t.fresh.scope}</Label>
            <input
              className={FIELD}
              value={f.scope}
              maxLength={400}
              placeholder={t.fresh.scopeExample}
              onChange={(e) => change('scope', e.target.value)}
            />
          </label>
          <label className="block">
            <Label>{t.fresh.goal}</Label>
            <textarea
              className={join(FIELD, 'min-h-24 resize-y')}
              value={f.goal}
              maxLength={600}
              placeholder={t.fresh.goalExample}
              onChange={(e) => change('goal', e.target.value)}
            />
          </label>
        </div>
      ),
    },
    {
      question: t.fresh.q3,
      note: t.fresh.q3Note,
      ready: true,
      body: (
        <div className="space-y-5">
          <div className="grid gap-2.5 sm:grid-cols-2">
            {LEVELS.map((n) => (
              <Choice key={n} active={f.level === n} onClick={() => change('level', n)} className="p-4">
                <span className="block font-medium text-ink">{t.levels[n]}</span>
                <span className="mt-1 block text-sm text-ink-soft">{t.fresh.levelDescription[n as Level]}</span>
              </Choice>
            ))}
          </div>
          <label className="block">
            <Label hint={t.fresh.priorKnowledgeHint}>{t.fresh.priorKnowledge}</Label>
            <textarea
              className={join(FIELD, 'min-h-20 resize-y')}
              value={f.priorKnowledge}
              maxLength={1000}
              onChange={(e) => change('priorKnowledge', e.target.value)}
            />
          </label>
        </div>
      ),
    },
    {
      question: t.fresh.q4,
      note: t.fresh.q4Note,
      ready: true,
      body: (
        <div className="space-y-6">
          <label className="block">
            <Label>{t.fresh.hoursPerWeek(f.hoursPerWeek)}</Label>
            <input
              type="range"
              min={1}
              max={20}
              value={f.hoursPerWeek}
              onChange={(e) => change('hoursPerWeek', Number(e.target.value))}
              className="w-full accent-[var(--accent)]"
            />
          </label>
          <div>
            <Label>{t.fresh.deadline}</Label>
            <div className="flex flex-wrap gap-2">
              {[null, 4, 8, 12, 24].map((p) => (
                <Choice
                  key={String(p)}
                  active={f.deadlineWeeks === p}
                  onClick={() => change('deadlineWeeks', p)}
                  className="px-4 py-2 text-sm"
                >
                  {p === null ? t.fresh.noDeadline : t.fresh.weeks(p)}
                </Choice>
              ))}
            </div>
          </div>
          <div>
            <Label>{t.fresh.you}</Label>
            <div className="flex flex-wrap gap-2">
              {FORMAT_PREFERENCES.map((p) => (
                <Choice
                  key={p}
                  active={f.format === p}
                  onClick={() => change('format', p)}
                  className="px-4 py-2 text-sm"
                >
                  {t.fresh.formats[p]}
                </Choice>
              ))}
            </div>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <Choice
              active={f.readsEnglish}
              onClick={() => change('readsEnglish', !f.readsEnglish)}
              className="flex items-center gap-3 p-4 text-sm"
            >
              <span
                className={join(
                  'grid h-5 w-5 place-items-center rounded-md border',
                  f.readsEnglish ? 'border-accent-ink bg-accent' : 'border-line-strong',
                )}
              >
                {f.readsEnglish && <Check size={12} weight="bold" />}
              </span>
              {t.fresh.readsEnglish}
            </Choice>
            <Choice
              active={f.hasComputer}
              onClick={() => change('hasComputer', !f.hasComputer)}
              className="flex items-center gap-3 p-4 text-sm"
            >
              <span
                className={join(
                  'grid h-5 w-5 place-items-center rounded-md border',
                  f.hasComputer ? 'border-accent-ink bg-accent' : 'border-line-strong',
                )}
              >
                {f.hasComputer && <Check size={12} weight="bold" />}
              </span>
              {t.fresh.computer}
            </Choice>
          </div>
          <div>
            <Label hint={t.fresh.courseLanguageHint}>{t.fresh.courseLanguage}</Label>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((i) => (
                <Choice
                  key={i}
                  active={f.language === i}
                  onClick={() => change('language', i)}
                  className="px-4 py-2 text-sm"
                >
                  {LANGUAGE_DATA[i].name}
                </Choice>
              ))}
            </div>
          </div>
        </div>
      ),
    },
    {
      question: t.fresh.q5,
      note: t.fresh.q5Note,
      ready: true,
      body: (
        <textarea
          className={join(FIELD, 'min-h-32 resize-y')}
          value={f.context}
          maxLength={1000}
          placeholder={t.fresh.q5Example}
          onChange={(e) => change('context', e.target.value)}
        />
      ),
    },
  ]

  const current = steps[step]
  const last = step === steps.length - 1

  async function create() {
    setSending(true)
    setError(null)
    try {
      const brief = {
        ...f,
        topic: f.topic.trim(),
        scope: f.scope.trim(),
        goal: f.goal.trim(),
        priorKnowledge: f.priorKnowledge.trim(),
        context: f.context.trim(),
      }
      setRequest(await api.post<CreatedRequest>('/api/requests', brief))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t.fresh.couldNotSave)
    } finally {
      setSending(false)
    }
  }

  if (request) {
    const instruction = t.ia.createCourse(request.slug)
    return (
      <div className="mx-auto grid max-w-[1100px] items-center gap-10 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="animate-appear">
          <h1 className="text-[clamp(1.9rem,4vw,3rem)]">{t.fresh.ready}</h1>
          <p className="mt-3 max-w-[58ch] text-ink-soft">
            {t.fresh.readyNote1} <code className="font-mono text-ink">{request.file}</code>
            {t.fresh.readyNote2} <code className="font-mono text-ink">courses/{request.slug}/</code>{' '}
            {t.fresh.readyNote3}
          </p>
          <Command className="mt-6" label={t.general.pasteIntoYourAI} text={instruction} />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <Command label="Claude Code" text={`claude "${instruction}"`} />
            <Command label="Codex" text={`codex "${instruction}"`} />
            <Command label="Cursor" text={instruction} />
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={() => navigate(`/creating/${request.slug}`)}>{t.home.track}</Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              {t.fresh.backToHome}
            </Button>
          </div>
        </div>
        <div className="hidden justify-center lg:flex">
          <BriefSheet step={steps.length} total={steps.length} born />
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto grid max-w-[1100px] items-center gap-10 lg:min-h-[calc(100dvh-6rem)] lg:grid-cols-[minmax(0,1fr)_340px]">
      <div>
        {/* progress is a row of dots: one per step */}
        <ol className="flex items-center gap-2" aria-label={t.fresh.stepOf(step + 1, steps.length)}>
          {steps.map((p, i) => (
            <li key={p.question} className="flex items-center gap-2">
              <span
                className={join(
                  'block rounded-full transition-all duration-500',
                  i < step ? 'h-2 w-2 bg-accent-ink' : i === step ? 'h-2.5 w-2.5 bg-info' : 'h-1.5 w-1.5 bg-ink/20',
                )}
              />
              {i < steps.length - 1 && (
                <span
                  className={join('block h-px w-6 transition-colors', i < step ? 'bg-accent-ink/60' : 'bg-ink/10')}
                />
              )}
            </li>
          ))}
        </ol>

        <form
          key={step}
          className="mt-8 animate-appear"
          onSubmit={(e) => {
            e.preventDefault()
            if (!current.ready) return
            if (last) void create()
            else setStep(step + 1)
          }}
        >
          <h1 className="text-[clamp(1.8rem,4vw,2.9rem)]">{current.question}</h1>
          <p className="mt-2 max-w-[56ch] text-ink-soft">{current.note}</p>
          <Panel className="mt-7 p-5 sm:p-6">{current.body}</Panel>

          {error && <p className="mt-4 text-sm text-error">{error}</p>}

          <div className="mt-6 flex items-center gap-3">
            {step > 0 && (
              <Button variant="ghost" icon={<ArrowLeft size={16} />} onClick={() => setStep(step - 1)}>
                {t.general.back}
              </Button>
            )}
            <Button type="submit" disabled={!current.ready || sending}>
              {last ? (sending ? t.fresh.recording : t.fresh.create) : t.general.resume}
            </Button>
          </div>
        </form>
      </div>
      <div className="hidden justify-center lg:flex">
        <BriefSheet step={step} total={steps.length} born={false} />
      </div>
    </div>
  )
}

/**
 * A module's checkpoint: all questions, submitted at once, with no hints and no item-by-item grading. The threshold
 * comes from the server (80%). If not passed, the screen shows the mistakes by skill. If passed, the next module
 * opens; if the course is finished, the certificate comes, with a moment of celebration.
 */

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Certificate, Star } from '@phosphor-icons/react'
import type { StudentCheckpoint, CourseDetail, CheckpointResult } from '@shared/api'
import { api, useData } from '@/lib/api'
import { announce } from '@/lib/rewards'
import { Button, LinkButton, Loading, ScreenError, Panel, Badge, join } from '@/components/ui'
import { Item, type StudentAnswer } from '@/lessons/Item'
import { useT } from '@/i18n'

export default function Checkpoint() {
  const { id = '', order = '1' } = useParams()
  const module = Number(order)
  const {
    data: exam,
    error,
    loading,
    reload,
  } = useData<StudentCheckpoint>(`/api/courses/${id}/modules/${module}/checkpoint`)
  const { data: course } = useData<CourseDetail>(`/api/courses/${id}`)
  const [answers, setAnswers] = useState<Record<string, StudentAnswer>>({})
  const [result, setResult] = useState<CheckpointResult | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [sending, setSending] = useState(false)
  const [submitError, setSendError] = useState<string | null>(null)
  const t = useT()

  if (loading) return <Loading text={t.checkpoint.nowOpening} className="min-h-dvh" />
  if (error || !exam) {
    return <ScreenError error={error ?? { message: t.checkpoint.notFound }} onRetry={() => void reload()} />
  }

  const thresholdPct = Math.round(exam.threshold * 100)
  const remaining = exam.items.length - Object.keys(answers).length
  const skillName = (hid: string) =>
    course?.modules.find((m) => m.order === module)?.skills.find((h) => h.id === hid)?.name ?? hid
  const missedSkills = result ? [...new Set(result.results.filter((r) => r.correct === false).map((r) => r.skill))] : []

  async function send() {
    setSending(true)
    setSendError(null)
    try {
      const r = await api.post<CheckpointResult>(`/api/courses/${id}/modules/${module}/checkpoint`, { answers })
      setResult(r)
      announce(r.reward)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setSendError(e instanceof Error ? e.message : t.checkpoint.couldNotSubmit)
    } finally {
      setSending(false)
    }
  }

  function redo() {
    setResult(null)
    setAnswers({})
    setAttempt((t) => t + 1)
    window.scrollTo({ top: 0 })
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pt-6 pb-24 sm:px-6 sm:pt-10">
      <header className="flex flex-col gap-3">
        <Link
          to={`/courses/${id}`}
          className="inline-flex items-center gap-1.5 self-start text-[14px] text-ink-soft hover:text-ink"
        >
          <ArrowLeft size={16} aria-hidden />
          {t.general.backToCourse}
        </Link>
        <h1 className="text-[clamp(1.6rem,4vw,2.4rem)]">{t.checkpoint.title(module)}</h1>
        <p className="max-w-[62ch] text-ink-soft">{t.checkpoint.note(exam.items.length, thresholdPct)}</p>
        {exam.alreadyPassed ? (
          <Badge tone="achievement" className="self-start">
            <Star size={14} weight="fill" aria-hidden />
            {t.checkpoint.alreadyPassed}
          </Badge>
        ) : null}
      </header>

      {result ? (
        <ResultScreen
          result={result}
          courseId={id}
          thresholdPct={thresholdPct}
          skills={missedSkills.map(skillName)}
          onRedo={redo}
        />
      ) : null}

      <ol className="flex flex-col gap-4" key={attempt}>
        {exam.items.map((item, i) => (
          <li key={item.id}>
            <Item
              item={item}
              number={i + 1}
              exam={{
                onAnswerChange: (r) => setAnswers((current) => ({ ...current, [item.id]: r })),
                result: result?.results.find((r) => r.itemId === item.id) ?? null,
              }}
            />
          </li>
        ))}
      </ol>

      {submitError ? (
        <p role="alert" className="text-[14px] text-error">
          {submitError}
        </p>
      ) : null}

      {!result ? (
        <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-line pt-6">
          <p className="text-[14px] text-ink-soft" aria-live="polite">
            {remaining > 0 ? t.checkpoint.remaining(remaining) : t.checkpoint.allAnswered}
          </p>
          <Button size="large" disabled={remaining > 0 || sending} onClick={() => void send()}>
            {sending ? t.checkpoint.sending : t.checkpoint.send}
          </Button>
        </footer>
      ) : null}
    </div>
  )
}

function ResultScreen({
  result,
  courseId,
  thresholdPct,
  skills,
  onRedo,
}: {
  result: CheckpointResult
  courseId: string
  thresholdPct: number
  skills: string[]
  onRedo: () => void
}) {
  const score = Math.round((result.correct_answers / Math.max(1, result.total)) * 100)
  const t = useT()
  return (
    <Panel
      className={join('relative overflow-hidden p-6 sm:p-8', result.passed ? 'border-gold/35' : 'border-line-strong')}
    >
      {result.certificate ? <Celebration /> : null}
      <div className="relative flex flex-col gap-4" aria-live="polite">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <p
            className={join(
              'font-display text-[clamp(2rem,6vw,3rem)] leading-none',
              result.passed ? 'text-gold' : 'text-ink',
            )}
          >
            {score}%
          </p>
          <p className="text-ink-soft">
            {t.checkpoint.correctCount(result.correct_answers, result.total, thresholdPct)}
          </p>
        </div>
        <h2 className="text-[clamp(1.2rem,3vw,1.6rem)]">
          {result.certificate
            ? t.checkpoint.courseCompleted
            : result.passed
              ? t.checkpoint.moduleCompleted
              : t.checkpoint.notYet}
        </h2>
        <p className="max-w-[60ch] text-ink-soft">
          {result.certificate
            ? t.checkpoint.courseCompletedNote
            : result.passed
              ? t.checkpoint.moduleCompletedNote
              : t.checkpoint.failedNote}
        </p>
        {!result.passed && skills.length ? (
          <div>
            <p className="text-[14px] font-medium text-ink">{t.checkpoint.whereYouWentWrong}</p>
            <ul className="mt-2 flex flex-wrap gap-2">
              {skills.map((h) => (
                <li key={h}>
                  <Badge tone="error">{h}</Badge>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-3 pt-1">
          {result.certificate ? (
            <LinkButton to={`/certificates/${result.certificate}`} icon={<Certificate size={18} weight="fill" />}>
              {t.checkpoint.viewCertificate}
            </LinkButton>
          ) : null}
          {result.passed ? (
            <LinkButton to={`/courses/${courseId}`} variant={result.certificate ? 'subtle' : 'main'}>
              {result.certificate ? t.general.backToCourse : t.checkpoint.nextModule}
            </LinkButton>
          ) : (
            <>
              <Button onClick={onRedo}>{t.checkpoint.redo}</Button>
              <LinkButton to={`/courses/${courseId}`} variant="subtle">
                {t.general.backToCourse}
              </LinkButton>
            </>
          )}
        </div>
      </div>
    </Panel>
  )
}

/** Gold stars that appear one by one behind the result. Fixed positions: nothing random on each render. */
const STARS = Array.from({ length: 16 }, (_, i) => ({
  x: (i * 37 + 11) % 96,
  y: (i * 53 + 7) % 88,
  size: 10 + ((i * 7) % 5) * 5,
  delay: i * 110,
}))

function Celebration() {
  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden>
      {STARS.map((e, i) => (
        <Star
          key={i}
          weight="fill"
          size={e.size}
          className="absolute animate-pop text-gold"
          style={{ left: `${e.x}%`, top: `${e.y}%`, animationDelay: `${e.delay}ms` }}
        />
      ))}
    </div>
  )
}

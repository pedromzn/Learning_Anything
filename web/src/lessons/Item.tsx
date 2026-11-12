/**
 * An exercise item: the prompt, the way to answer each type, the hints asked for one by one and the feedback that
 * comes back from the server. The item arrives WITHOUT the answer key; the server grades it, and the explanation only
 * shows afterwards.
 *
 * Feedback that shows what changed: the right choice lights up, a wrong pick shakes gently. An `ordering` item can be
 * dragged or moved with the buttons (keyboard). An `open` item has no automatic grading: the person shows the answer
 * to the AI. `prefers-reduced-motion` already cuts the animations in the global CSS.
 */

import { useState, type FormEvent, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Check, DotsSixVertical, Lightbulb, X } from '@phosphor-icons/react'
import type { StudentItem, AttemptResult } from '@shared/course'
import { Markdown } from './Markdown'
import { Button, join } from '@/components/ui'
import { t as texts, useT } from '@/i18n'

export type StudentAnswer =
  | { type: 'multiple_choice'; choice: number }
  | { type: 'true_false'; value: boolean }
  | { type: 'numeric'; value: string }
  | { type: 'short_answer'; text: string }
  | { type: 'ordering'; texts: string[] }
  | { type: 'open'; text: string }

export interface ItemActions {
  respond: (answer: StudentAnswer) => Promise<AttemptResult>
  askHint: (index: number) => Promise<string>
}

const STYLES = `
@keyframes item-tremer { 0%,100% { transform: none } 20% { transform: translateX(-5px) } 45% { transform: translateX(4px) } 70% { transform: translateX(-2px) } }
@keyframes item-acender { 0% { box-shadow: 0 0 0 0 color-mix(in srgb, var(--success) 55%, transparent) } 100% { box-shadow: 0 0 0 10px transparent } }
.item-tremer { animation: item-tremer 0.42s ease-in-out }
.item-acender { animation: item-acender 0.9s ease-out }
`

const messageFor = (e: unknown) => (e instanceof Error ? e.message : texts().general.somethingWentWrong)

/**
 * `exam`: the checkpoint mode, with no hints and no item-by-item checking. The answer goes up through `onAnswerChange`
 * and the grading comes from outside, all at once (`result`).
 */
export function Item({
  item,
  number,
  actions,
  onFinish,
  exam,
}: {
  item: StudentItem
  number?: number
  actions?: ItemActions
  onFinish?: (result: AttemptResult) => void
  exam?: { onAnswerChange: (r: StudentAnswer) => void; result: AttemptResult | null }
}) {
  const [answer, setLocalAnswer] = useState<StudentAnswer | null>(initialAnswer(item))
  const [localResult, setResult] = useState<AttemptResult | null>(null)
  const [hints, setHints] = useState<string[]>([])
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useT()
  const result = exam ? exam.result : localResult
  const answered = result !== null
  const open = item.type === 'open'
  const canSubmit = !answered && answer !== null && isAnswerComplete(answer)

  function setAnswer(r: StudentAnswer) {
    setLocalAnswer(r)
    exam?.onAnswerChange(r)
  }

  async function send(event: FormEvent) {
    event.preventDefault()
    if (!answer || !canSubmit || !actions || open) return
    setSending(true)
    setError(null)
    try {
      const r = await actions.respond(answer)
      setResult(r)
      onFinish?.(r)
    } catch (e) {
      setError(messageFor(e))
    } finally {
      setSending(false)
    }
  }

  async function askHint() {
    if (!actions) return
    setError(null)
    try {
      const hint = await actions.askHint(hints.length)
      setHints((currentOnes) => [...currentOnes, hint])
    } catch (e) {
      setError(messageFor(e))
    }
  }

  return (
    <form
      onSubmit={send}
      className={join(
        'card rounded-panel p-5 transition-colors duration-500 sm:p-6',
        result?.correct === true && 'border-success/45',
        result?.correct === false && 'border-error/40',
      )}
    >
      <style>{STYLES}</style>
      <div className="mb-3 flex items-center gap-3 text-[13px] text-ink-faint">
        {number ? <span className="font-mono text-ink-soft">{String(number).padStart(2, '0')}</span> : null}
        <span>{t.item.difficulties[item.difficulty] ?? t.item.difficulties[2]}</span>
      </div>

      <Markdown text={item.prompt} compact />

      <div className="mt-4">
        <AnswerInput item={item} answer={answer} onChange={setAnswer} result={result} />
      </div>

      {hints.length ? (
        <ol className="mt-4 flex flex-col gap-2" aria-live="polite">
          {hints.map((hint, i) => (
            <li
              key={i}
              className="flex animate-appear gap-2.5 rounded-tile border border-line bg-ink/4 px-3.5 py-2.5 text-[14px] text-ink-soft"
            >
              <Lightbulb size={17} className="mt-0.5 shrink-0 text-info" />
              <span>
                <span className="mr-1.5 font-medium text-ink">Dica {i + 1}.</span>
                {hint}
              </span>
            </li>
          ))}
        </ol>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 text-[14px] text-error">
          {error}
        </p>
      ) : null}

      {answered ? (
        <Correction result={result} />
      ) : exam || open ? null : (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={!canSubmit || sending}>
            {sending ? t.item.checking : t.item.check}
          </Button>
          {actions && hints.length < item.totalHints ? (
            <Button variant="ghost" onClick={() => void askHint()} icon={<Lightbulb size={17} />}>
              {hints.length ? t.item.anotherHint : t.item.oneHint}
            </Button>
          ) : null}
        </div>
      )}
    </form>
  )
}

function initialAnswer(item: StudentItem): StudentAnswer | null {
  if (item.type === 'ordering') return { type: 'ordering', texts: [...(item.steps ?? [])] }
  return null
}

function isAnswerComplete(r: StudentAnswer): boolean {
  if (r.type === 'numeric') return r.value.trim().length > 0
  if (r.type === 'short_answer' || r.type === 'open') return r.text.trim().length > 0
  return true
}

function AnswerInput({
  item,
  answer,
  onChange,
  result,
}: {
  item: StudentItem
  answer: StudentAnswer | null
  onChange: (r: StudentAnswer) => void
  result: AttemptResult | null
}) {
  const frozen = result !== null
  const t = useT()

  if (item.type === 'multiple_choice') {
    const chosen = answer?.type === 'multiple_choice' ? answer.choice : null
    return (
      <fieldset className="flex flex-col gap-2" disabled={frozen}>
        <legend className="sr-only">{t.item.pickChoice}</legend>
        {(item.choices ?? []).map((text, i) => {
          const correctOne = frozen && result.correctChoice === i
          const chosenWrong = frozen && chosen === i && !correctOne
          return (
            <label
              key={i}
              className={join(
                'flex items-start gap-3 rounded-tile border px-3.5 py-3 text-[15px] transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-info',
                frozen ? 'cursor-default' : 'cursor-pointer',
                !frozen && chosen === i && 'border-accent-ink bg-accent/15',
                !frozen && chosen !== i && 'border-line hover:border-line-strong',
                correctOne && 'item-acender border-success bg-success/12',
                chosenWrong && 'item-tremer border-error/60 bg-error/10',
                frozen && !correctOne && !chosenWrong && 'border-line opacity-55',
              )}
            >
              <input
                type="radio"
                name={`item-${item.id}`}
                className="mt-[5px] accent-[var(--accent)]"
                checked={chosen === i}
                onChange={() => onChange({ type: 'multiple_choice', choice: i })}
              />
              <span className="min-w-0 flex-1">
                <Markdown text={text} compact />
              </span>
              {correctOne ? (
                <Check
                  size={18}
                  weight="bold"
                  className="mt-[3px] text-success"
                  aria-label={t.item.correctChoiceLabel}
                />
              ) : null}
              {chosenWrong ? (
                <X size={18} weight="bold" className="mt-1 text-error" aria-label={t.item.yourChoice} />
              ) : null}
            </label>
          )
        })}
      </fieldset>
    )
  }

  if (item.type === 'true_false') {
    const value = answer?.type === 'true_false' ? answer.value : null
    const right = result?.rightAnswer === 'true' ? true : result?.rightAnswer === 'false' ? false : null
    return (
      <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t.item.trueOrFalse}>
        {[true, false].map((v) => {
          const lit = frozen && right === v
          const gotWrong = frozen && value === v && right !== v
          return (
            <button
              type="button"
              key={String(v)}
              role="radio"
              aria-checked={value === v}
              disabled={frozen}
              onClick={() => onChange({ type: 'true_false', value: v })}
              className={join(
                'h-11 min-w-32 rounded-tile border px-4 text-[15px] font-medium transition-colors',
                !frozen && value === v && 'border-accent-ink bg-accent/20 text-ink',
                !frozen && value !== v && 'border-line hover:border-line-strong',
                lit && 'item-acender border-success bg-success/12 text-ink',
                gotWrong && 'item-tremer border-error/60 bg-error/10',
                frozen && !lit && !gotWrong && 'border-line opacity-55',
              )}
            >
              {v ? t.item.trueLabel : t.item.falseLabel}
            </button>
          )
        })}
      </div>
    )
  }

  if (item.type === 'numeric') {
    return (
      <Field label={t.item.yourAnswer} suffix={item.unit}>
        <input
          inputMode="decimal"
          autoComplete="off"
          disabled={frozen}
          value={answer?.type === 'numeric' ? answer.value : ''}
          onChange={(e) => onChange({ type: 'numeric', value: e.target.value })}
          className={join(FIELD, 'w-48 font-mono', frozen && FIELD_STATE(result))}
        />
      </Field>
    )
  }

  if (item.type === 'short_answer') {
    return (
      <Field label={t.item.yourAnswer}>
        <input
          autoComplete="off"
          disabled={frozen}
          maxLength={300}
          value={answer?.type === 'short_answer' ? answer.text : ''}
          onChange={(e) => onChange({ type: 'short_answer', text: e.target.value })}
          className={join(FIELD, 'w-full max-w-md', frozen && FIELD_STATE(result))}
        />
      </Field>
    )
  }

  if (item.type === 'ordering') return <Ordering item={item} answer={answer} onChange={onChange} result={result} />

  return (
    <div className="flex flex-col gap-3">
      {item.rubric?.length ? (
        <div className="rounded-tile border border-line bg-ink/4 px-4 py-3">
          <p className="text-[14px] font-medium text-ink">O que vai ser avaliado</p>
          <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[14px] text-ink-soft">
            {item.rubric.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </div>
      ) : null}
      <textarea
        value={answer?.type === 'open' ? answer.text : ''}
        maxLength={6000}
        onChange={(e) => onChange({ type: 'open', text: e.target.value })}
        className={join(FIELD, 'min-h-32 w-full py-3 leading-relaxed')}
        aria-label={t.item.draft}
        placeholder={t.item.draftPlaceholder}
      />
      <p className="text-[14px] text-ink-soft">{t.item.openNote}</p>
    </div>
  )
}

const FIELD =
  'h-11 rounded-tile border border-line-strong bg-card px-3 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none'
const FIELD_STATE = (r: AttemptResult | null) =>
  r?.correct ? 'item-acender border-success/70' : 'item-tremer border-error/60'

function Ordering({
  item,
  answer,
  onChange,
  result,
}: {
  item: StudentItem
  answer: StudentAnswer | null
  onChange: (r: StudentAnswer) => void
  result: AttemptResult | null
}) {
  const frozen = result !== null
  const texts = answer?.type === 'ordering' ? answer.texts : (item.steps ?? [])
  const [dragging, setDragging] = useState<number | null>(null)
  const [warning, setWarning] = useState('')
  const t = useT()

  function mover(from: number, to: number) {
    if (to < 0 || to >= texts.length || from === to) return
    const newOne = [...texts]
    const [removed] = newOne.splice(from, 1)
    newOne.splice(to, 0, removed)
    onChange({ type: 'ordering', texts: newOne })
    setWarning(t.item.nowIsStep(removed ?? '', to + 1, newOne.length))
  }

  return (
    <div>
      <p className="mb-2 text-[13px] text-ink-faint">{t.item.drag}</p>
      <ol className="flex flex-col gap-2" aria-label={t.item.stepsInOrder}>
        {texts.map((text, i) => {
          const rightInPlace = frozen && result.correctOrder?.[i] === text
          const misplaced = frozen && result.correctOrder !== undefined && !rightInPlace
          return (
            <li
              key={text}
              draggable={!frozen}
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging !== null) mover(dragging, i)
                setDragging(null)
              }}
              onDragEnd={() => setDragging(null)}
              className={join(
                'flex items-center gap-3 rounded-tile border px-3 py-2.5 text-[15px] transition-colors',
                !frozen && 'border-line bg-ink/4',
                !frozen && dragging === i && 'opacity-50',
                rightInPlace && 'item-acender border-success bg-success/12',
                misplaced && 'item-tremer border-error/50 bg-error/8',
              )}
            >
              {!frozen ? (
                <DotsSixVertical size={18} className="shrink-0 cursor-grab text-ink-faint" aria-hidden />
              ) : null}
              <span className="w-5 shrink-0 font-mono text-[13px] text-ink-faint">{i + 1}</span>
              <span className="min-w-0 flex-1">{text}</span>
              {!frozen ? (
                <span className="flex gap-1">
                  <ArrowButton label={t.item.moveUp(text)} disabled={i === 0} onClick={() => mover(i, i - 1)}>
                    <ArrowUp size={16} />
                  </ArrowButton>
                  <ArrowButton
                    label={t.item.moveDown(text)}
                    disabled={i === texts.length - 1}
                    onClick={() => mover(i, i + 1)}
                  >
                    <ArrowDown size={16} />
                  </ArrowButton>
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>
      <p className="sr-only" aria-live="polite">
        {warning}
      </p>
    </div>
  )
}

function ArrowButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string
  disabled: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid size-9 place-items-center rounded-tile text-ink-soft transition-colors hover:bg-ink/8 hover:text-ink disabled:opacity-30"
    >
      {children}
    </button>
  )
}

function Field({ label, suffix, children }: { label: string; suffix?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-ink-soft">{label}</span>
      <span className="flex items-center gap-2">
        {children}
        {suffix ? <span className="text-[14px] text-ink-soft">{suffix}</span> : null}
      </span>
    </label>
  )
}

function Correction({ result }: { result: AttemptResult }) {
  const t = useT()
  const title = result.correct === null ? t.item.submitted : result.correct ? t.item.thatsRight : t.item.notYet
  // true/false answers come from the server as a word; show it in the interface language
  const rightAnswer =
    result.rightAnswer === 'true'
      ? t.item.trueLabel
      : result.rightAnswer === 'false'
        ? t.item.falseLabel
        : result.rightAnswer
  return (
    <div className="mt-5 animate-appear border-t border-line pt-5" aria-live="polite">
      <p
        className={join(
          'font-display text-[17px]',
          result.correct === true && 'text-success',
          result.correct === false && 'text-error',
        )}
      >
        {title}
      </p>
      {result.rightAnswer && result.correct === false ? (
        <p className="mt-2 text-[14px] text-ink-soft">
          {t.item.rightAnswer} <strong className="font-medium text-ink">{rightAnswer}</strong>
        </p>
      ) : null}
      {result.correctOrder && result.correct === false ? (
        <ol className="mt-2 list-decimal pl-5 text-[14px] text-ink-soft">
          {result.correctOrder.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ol>
      ) : null}
      {result.explanation && result.explanation !== result.solution ? (
        <div className="mt-3">
          <Markdown text={result.explanation} compact />
        </div>
      ) : null}
      {result.solution ? (
        <details className="group mt-3" open={result.correct === false}>
          <summary className="cursor-pointer text-[14px] font-medium text-accent-ink hover:text-ink">
            {t.item.viewSolution}
          </summary>
          <div className="mt-2">
            <Markdown text={result.solution} compact />
          </div>
        </details>
      ) : null}
    </div>
  )
}

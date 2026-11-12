/**
 * A module's table of contents: each lesson is a step on a vertical line, then come the Feynman block (teach Ana),
 * the checkpoint and the project. Each step is a real button (focus, keyboard, screen reader) that shows its detail.
 *
 * What the markers mean: filled green with a check = done; terracotta = up next; an empty circle = available; a dashed
 * circle = not written by the AI yet; a lock = locked by the previous checkpoint.
 */

import { BookOpenText, Check, Lock, Microphone, PlayCircle, Target, Barbell, Flag } from '@phosphor-icons/react'
import type { LessonSummary, ModuleSummary } from '@shared/api'
import { join } from '@/components/ui'
import { useT } from '@/i18n'

export type Step =
  | { type: 'lesson'; lesson: LessonSummary; module: ModuleSummary }
  | { type: 'feynman'; module: ModuleSummary }
  | { type: 'checkpoint'; module: ModuleSummary }
  | { type: 'project'; module: ModuleSummary }

export type Status = 'done' | 'now' | 'open' | 'unlit' | 'locked'

export const TYPE_ICON = { video: PlayCircle, text: BookOpenText, exercises: Barbell } as const

export function stepsOf(module: ModuleSummary): Step[] {
  return [
    ...module.lessons.map((lesson) => ({ type: 'lesson' as const, lesson, module })),
    { type: 'feynman' as const, module },
    { type: 'checkpoint' as const, module },
    { type: 'project' as const, module },
  ]
}

export function stepKey(a: Step): string {
  return a.type === 'lesson' ? a.lesson.id : `${a.type}-${a.module.order}`
}

export function statusOf(step: Step, upNext: string | null): Status {
  const m = step.module
  if (step.type === 'lesson') {
    if (step.lesson.completed) return 'done'
    if (!m.unlocked) return 'locked'
    if (step.lesson.state !== 'ready') return 'unlit'
    return step.lesson.id === upNext ? 'now' : 'open'
  }
  if (step.type === 'feynman') {
    if (m.feynmanPassed) return 'done'
    if (!m.unlocked) return 'locked'
    if (!m.hasFeynman) return 'unlit'
    return upNext === `feynman-${m.order}` ? 'now' : 'open'
  }
  if (step.type === 'checkpoint') {
    if (m.checkpointPassed) return 'done'
    if (!m.unlocked) return 'locked'
    if (!m.hasCheckpoint) return 'unlit'
    return upNext === `checkpoint-${m.order}` ? 'now' : 'open'
  }
  return m.unlocked ? 'open' : 'locked'
}

/**
 * Up next: the first ready, unfinished lesson of the unlocked module; with all of them done, the Feynman block (teach
 * Ana) and then the checkpoint. The Feynman block does not lock the checkpoint: it only comes first in the suggestion.
 */
export function upNextOf(module: ModuleSummary): string | null {
  if (!module.unlocked) return null
  const lesson = module.lessons.find((a) => !a.completed && a.state === 'ready')
  if (lesson) return lesson.id
  if (!module.lessons.every((a) => a.completed)) return null
  if (module.hasFeynman && !module.feynmanPassed && !module.checkpointPassed) return `feynman-${module.order}`
  if (module.hasCheckpoint && !module.checkpointPassed) return `checkpoint-${module.order}`
  return null
}

const MARKER: Record<Status, string> = {
  done: 'bg-accent text-white border-accent',
  now: 'bg-info text-white border-info',
  open: 'bg-card text-ink-soft border-line-strong',
  unlit: 'bg-page text-ink-faint border-dashed border-ink-faint/60',
  locked: 'bg-page text-ink-faint border-line',
}

interface SyllabusProps {
  module: ModuleSummary
  selected: string | null
  upNext: string | null
  onChoose: (step: Step) => void
}

export function Syllabus({ module, selected, upNext, onChoose }: SyllabusProps) {
  const steps = stepsOf(module)
  const t = useT()

  return (
    <ol className="relative">
      {/* the line that runs down the markers */}
      <span className="absolute top-4 bottom-4 left-[19px] w-px bg-line-strong" aria-hidden />
      {steps.map((step, i) => {
        const key = stepKey(step)
        const status = statusOf(step, upNext)
        const picked = selected === key
        const Icon =
          step.type === 'lesson'
            ? TYPE_ICON[step.lesson.type]
            : step.type === 'checkpoint'
              ? Target
              : step.type === 'feynman'
                ? Microphone
                : Flag
        const kind =
          step.type === 'lesson'
            ? t.lessonTypes[step.lesson.type]
            : step.type === 'checkpoint'
              ? t.syllabus.checkpoint
              : step.type === 'feynman'
                ? t.syllabus.feynman
                : t.syllabus.project
        const title =
          step.type === 'lesson'
            ? step.lesson.title
            : step.type === 'checkpoint'
              ? t.syllabus.checkpointTitle
              : step.type === 'feynman'
                ? t.syllabus.feynmanTitle
                : step.module.project.title
        const statusText =
          status === 'done'
            ? t.syllabus.completed
            : status === 'now'
              ? t.syllabus.next
              : status === 'locked'
                ? t.syllabus.locked
                : status === 'unlit'
                  ? t.syllabus.notWrittenYet
                  : ''

        return (
          <li key={key} className="relative animate-appear" style={{ animationDelay: `${i * 30}ms` }}>
            <button
              type="button"
              onClick={() => onChoose(step)}
              aria-pressed={picked}
              aria-label={`${kind}: ${title}${statusText}`}
              className={join(
                'group flex w-full items-start gap-4 rounded-tile px-1.5 py-2.5 text-left transition-colors',
                picked ? 'bg-tint' : 'hover:bg-ink/4',
                step.type !== 'lesson' && i === module.lessons.length && 'mt-3',
              )}
            >
              <span
                className={join(
                  'relative z-10 mt-0.5 grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full border-[1.5px]',
                  MARKER[status],
                )}
              >
                {status === 'done' ? (
                  <Check size={13} weight="bold" />
                ) : status === 'locked' ? (
                  <Lock size={12} />
                ) : status === 'now' ? (
                  <span className="h-2 w-2 rounded-full bg-white" />
                ) : (
                  <span className="text-[11px] font-semibold">{step.type === 'lesson' ? step.lesson.order : ''}</span>
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={join(
                    'flex items-center gap-1.5 text-[12px] tracking-wide uppercase',
                    step.type === 'lesson' ? 'text-ink-faint' : 'text-accent-ink',
                  )}
                >
                  <Icon size={13} weight="bold" aria-hidden />
                  {kind}
                </span>
                <span
                  className={join(
                    'mt-0.5 block leading-snug',
                    status === 'locked' || status === 'unlit' ? 'text-ink-faint' : 'text-ink',
                    step.type === 'lesson' ? 'text-[15.5px]' : 'font-display text-[16.5px]',
                  )}
                >
                  {title}
                </span>
              </span>
              {status === 'now' && (
                <span className="mt-1 shrink-0 rounded-pill bg-info/12 px-2.5 py-0.5 text-[12px] font-medium text-info">
                  {t.syllabus.yourTurn}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ol>
  )
}

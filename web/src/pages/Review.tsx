/**
 * Today's review: the exercises the student got wrong before, one at a time, across all courses (see
 * `shared/review.ts`). Each answer moves the exercise between Leitner boxes; the screen says when it comes back.
 */

import { useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, CheckCircle } from '@phosphor-icons/react'
import type { ReviewAttemptResponse, ReviewSlot, ReviewToday } from '@shared/review'
import { api, useData } from '@/lib/api'
import { announce } from '@/lib/rewards'
import { Bar, Button, LinkButton, Loading, Panel, ScreenError } from '@/components/ui'
import { Item, type ItemActions } from '@/lessons/Item'
import { useT } from '@/i18n'

/** Whole days between two `YYYY-MM-DD`. */
const daysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000)

export default function Review() {
  const { data, error, loading, reload } = useData<ReviewToday>('/api/review')
  const t = useT()
  if (loading) return <Loading text={t.review.loading} />
  if (error || !data)
    return <ScreenError error={error ?? { message: t.general.noData }} onRetry={() => void reload()} />
  return <Session today={data} />
}

function Session({ today }: { today: ReviewToday }) {
  const t = useT()
  const [index, setIndex] = useState(0)
  // after each answer: where the exercise goes next (undefined = not answered yet; null = learned, leaves the review)
  const [next, setNext] = useState<ReviewSlot | null | undefined>(undefined)
  const hints = useRef<Record<string, number>>({})
  const card = today.cards[index]

  const actions = useMemo<ItemActions | undefined>(() => {
    if (!card) return undefined
    return {
      respond: async (answer) => {
        const r = await api.post<ReviewAttemptResponse>('/api/review/attempt', {
          courseId: card.courseId,
          key: card.key,
          answer,
          hintsUsed: hints.current[card.key] ?? 0,
        })
        announce(r.reward)
        setNext(r.next)
        return r
      },
      askHint: async (i) => {
        const r = await api.post<{ hint: string }>('/api/review/hint', {
          courseId: card.courseId,
          key: card.key,
          index: i,
        })
        hints.current[card.key] = Math.max(hints.current[card.key] ?? 0, i + 1)
        return r.hint
      },
    }
  }, [card])

  if (!today.cards.length)
    return (
      <div className="mx-auto max-w-2xl">
        <Back />
        <Panel className="mt-8 p-8 text-center">
          <CheckCircle size={40} className="mx-auto text-accent" weight="duotone" />
          <h1 className="mt-4 text-2xl">{t.review.emptyTitle}</h1>
          <p className="mx-auto mt-2 max-w-[48ch] text-ink-soft">{t.review.emptyNote}</p>
          {today.upcoming > 0 && <p className="mt-2 text-sm text-ink-faint">{t.review.doneNote(today.upcoming)}</p>}
        </Panel>
      </div>
    )

  if (!card)
    return (
      <div className="mx-auto max-w-2xl">
        <Back />
        <Panel className="mt-8 p-8 text-center">
          <CheckCircle size={40} className="mx-auto text-accent" weight="fill" />
          <h1 className="mt-4 text-2xl">{t.review.doneTitle}</h1>
          <p className="mx-auto mt-2 max-w-[48ch] text-ink-soft">{t.review.doneNote(today.upcoming)}</p>
          {today.more > 0 && <p className="mt-2 text-sm text-ink-faint">{t.review.more(today.more)}</p>}
          <LinkButton to="/" className="mt-6">
            {t.review.backHome}
          </LinkButton>
        </Panel>
      </div>
    )

  const source = card.lessonId ? card.sourceTitle : t.review.checkpointSource(card.module)
  const last = index === today.cards.length - 1

  return (
    <div className="mx-auto max-w-2xl">
      <Back />
      <header className="mt-6">
        <h1 className="text-[clamp(1.7rem,3.6vw,2.4rem)]">{t.review.title}</h1>
        <p className="mt-2 text-ink-soft">{t.review.intro}</p>
        <div className="mt-5 flex items-center gap-4">
          <Bar value={index / today.cards.length} className="flex-1" />
          <span className="font-mono text-[13px] text-ink-soft">
            {t.review.progress(index + 1, today.cards.length)}
          </span>
        </div>
      </header>

      <p className="mt-8 text-[13px] tracking-wide text-ink-faint uppercase">
        {t.review.from(card.courseTitle, source)}
      </p>
      <div className="mt-2">
        <Item key={card.key} item={card.item} actions={actions} />
      </div>

      {next !== undefined && (
        <div className="mt-5 flex animate-appear flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-soft">
            {next === null ? t.review.learned : t.review.backIn(Math.max(1, daysBetween(today.today, next.due)))}
          </p>
          <Button
            onClick={() => {
              setNext(undefined)
              setIndex((i) => i + 1)
              window.scrollTo({ top: 0, behavior: 'smooth' })
            }}
          >
            {last ? t.review.finish : t.review.next}
          </Button>
        </div>
      )}
    </div>
  )
}

function Back() {
  const t = useT()
  return (
    <Link to="/" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
      <ArrowLeft size={16} /> {t.review.backHome}
    </Link>
  )
}

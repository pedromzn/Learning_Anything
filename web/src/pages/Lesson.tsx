/**
 * An open lesson. The three types are truly separate:
 * - text: introduction, short sections each closed by a question, the worked example ("try before you look") and the
 *   summary;
 * - exercises: the instructions and the list of items, with a count of correct answers;
 * - video: the player with pauses for questions, or the script's slides while the video has not been generated.
 * If the lesson does not exist yet (or the file has an error), the screen says so and gives the command to ask the AI.
 */

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, CheckCircle, Eye, Target } from '@phosphor-icons/react'
import type { LessonDetail, ExercisesContent, TextContent, VideoContent, CompletionResponse } from '@shared/api'
import type { AttemptResult } from '@shared/course'
import { api, useData } from '@/lib/api'
import { announce } from '@/lib/rewards'
import { Bar, Button, LinkButton, Loading, Command, ScreenError, Panel, Badge, join } from '@/components/ui'
import { TYPE_ICON } from '@/course/Syllabus'
import { useT } from '@/i18n'
import { Item } from '@/lessons/Item'
import { Markdown } from '@/lessons/Markdown'
import { VideoLesson } from '@/lessons/VideoLesson'
import { Sources } from '@/lessons/Sources'
import { useLessonActions } from '@/lessons/actions'

export default function Lesson() {
  const { id = '', lessonId = '' } = useParams()
  const { data: lesson, error, loading, reload } = useData<LessonDetail>(`/api/courses/${id}/lessons/${lessonId}`)
  const t = useT()

  if (loading) return <Loading text={t.lesson.nowOpening} className="min-h-dvh" />
  if (error || !lesson)
    return <ScreenError error={error ?? { message: t.lesson.lessonNotFound }} onRetry={() => void reload()} />
  return <OpenLesson key={lesson.id} courseId={id} lesson={lesson} />
}

function LessonFrame({
  courseId,
  lesson,
  children,
  progress,
}: {
  courseId: string
  lesson: LessonDetail
  children: React.ReactNode
  progress?: { finished: number; total: number }
}) {
  const Icon = TYPE_ICON[lesson.type]
  const t = useT()
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-line bg-page/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3 sm:px-6">
          <Link
            to={`/courses/${courseId}`}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-pill py-1 pr-2 text-[14px] text-ink-soft hover:text-ink"
          >
            <ArrowLeft size={16} aria-hidden />
            <span className="sr-only sm:not-sr-only">{t.general.backToCourse}</span>
          </Link>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 truncate text-[12.5px] text-ink-faint">
              <Icon size={14} aria-hidden />
              {t.lesson.typeModuleLesson(t.lessonTypes[lesson.type], lesson.module, lesson.order)}
            </p>
            <p className="truncate text-[15px] text-ink">{lesson.title}</p>
          </div>
          {progress && progress.total > 0 ? (
            <div className="flex w-20 shrink-0 flex-col items-end gap-1 sm:w-32">
              <span className="font-mono text-[12px] text-ink-soft">
                {progress.finished}/{progress.total}
              </span>
              <Bar value={progress.finished / progress.total} className="w-full" />
            </div>
          ) : null}
        </div>
      </header>
      <div className="mx-auto flex max-w-3xl flex-col gap-8 px-4 pt-8 pb-24 sm:px-6">{children}</div>
    </div>
  )
}

function OpenLesson({ courseId, lesson }: { courseId: string; lesson: LessonDetail }) {
  const actionsFor = useLessonActions(courseId, lesson.id)
  const [answeredItems, setAnsweredItems] = useState<Record<string, boolean | null>>({})
  const [completed, setCompleted] = useState(lesson.completed)
  const [completing, setCompleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useT()

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [lesson.id])

  if (lesson.state !== 'ready' || !lesson.content) {
    return (
      <LessonFrame courseId={courseId} lesson={lesson}>
        <Panel className="flex flex-col gap-4 p-6 sm:p-8">
          <Badge tone={lesson.state === 'with_errors' ? 'error' : 'now'} className="self-start">
            {lesson.state === 'with_errors' ? t.lesson.fileWithError : t.lesson.notWrittenYet}
          </Badge>
          <h1 className="text-[clamp(1.4rem,3vw,2rem)]">{lesson.title}</h1>
          {lesson.state === 'with_errors' ? (
            <>
              <p className="text-ink-soft">{t.lesson.withErrorNote}</p>
              <ul className="list-disc space-y-1 pl-5 text-[14px] text-error">
                {lesson.problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </>
          ) : (
            <p className="text-ink-soft">{t.lesson.lessonNotWrittenNote}</p>
          )}
          <Command
            label={t.general.pasteIntoYourAI}
            text={
              lesson.state === 'with_errors'
                ? t.ia.fixLesson(lesson.id, courseId)
                : t.ia.writeLesson(lesson.id, courseId)
            }
          />
          <LinkButton to={`/courses/${courseId}`} variant="subtle" className="self-start">
            {t.general.backToCourse}
          </LinkButton>
        </Panel>
      </LessonFrame>
    )
  }

  const content = lesson.content
  const items: string[] =
    lesson.type === 'text'
      ? (content as TextContent).sections.map((s) => s.question.id)
      : lesson.type === 'exercises'
        ? (content as ExercisesContent).items.map((i) => i.id)
        : (content as VideoContent).script.scenes.flatMap((c) => (c.type === 'question' ? [c.item.id] : []))
  const finished = items.filter((i) => i in answeredItems).length
  const correct_answers = Object.values(answeredItems).filter((v) => v === true).length

  function record(itemId: string) {
    return (r: AttemptResult) => setAnsweredItems((current) => ({ ...current, [itemId]: r.correct }))
  }

  async function finish() {
    setCompleting(true)
    setError(null)
    try {
      const r = await api.post<CompletionResponse>(`/api/courses/${courseId}/lessons/${lesson.id}/finish`)
      announce(r.reward)
      setCompleted(true)
    } catch (e) {
      setError(e instanceof Error ? e.message : t.lesson.notCompleted)
    } finally {
      setCompleting(false)
    }
  }

  return (
    <LessonFrame courseId={courseId} lesson={lesson} progress={{ finished, total: items.length }}>
      <header className="flex flex-col gap-3">
        <h1 className="text-[clamp(1.6rem,4vw,2.4rem)]">{lesson.title}</h1>
        {lesson.goal ? <p className="max-w-[60ch] text-ink-soft">{lesson.goal}</p> : null}
      </header>

      {lesson.type === 'video' ? (
        <VideoLesson
          content={content as VideoContent}
          courseId={courseId}
          actionsFor={actionsFor}
          onAnswer={(itemId, r) => record(itemId)(r)}
          language={lesson.language}
        />
      ) : lesson.type === 'text' ? (
        <Text content={content as TextContent} actionsFor={actionsFor} record={record} />
      ) : (
        <Exercises
          content={content as ExercisesContent}
          actionsFor={actionsFor}
          record={record}
          correct_answers={correct_answers}
          finished={finished}
        />
      )}

      <Sources sources={lesson.sources} />

      {error ? (
        <p role="alert" className="text-[14px] text-error">
          {error}
        </p>
      ) : null}

      <footer className="flex flex-col gap-4 border-t border-line pt-6">
        {items.length ? (
          <p className="text-[14px] text-ink-soft">
            {finished === 0 ? t.lesson.answerTheQuestions : t.lesson.answeredCorrectly(correct_answers, finished)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          {!completed ? (
            <Button
              size="large"
              disabled={completing}
              onClick={() => void finish()}
              icon={<CheckCircle size={18} weight="bold" />}
            >
              {completing ? t.lesson.completing : t.lesson.finish}
            </Button>
          ) : (
            <Badge tone="achievement">
              <CheckCircle size={14} weight="fill" aria-hidden />
              {t.lesson.completed}
            </Badge>
          )}
          {lesson.next ? (
            <LinkButton
              to={`/courses/${courseId}/lessons/${lesson.next.id}`}
              size="large"
              variant={completed ? 'main' : 'subtle'}
            >
              {t.lesson.next(lesson.next.title)}
            </LinkButton>
          ) : (
            <LinkButton
              to={`/courses/${courseId}/modules/${lesson.module}/checkpoint`}
              size="large"
              variant={completed ? 'main' : 'subtle'}
              icon={<Target size={18} aria-hidden />}
            >
              {t.lesson.moduleCheckpoint(lesson.module)}
            </LinkButton>
          )}
          <LinkButton to={`/courses/${courseId}`} variant="ghost" size="large">
            {t.general.backToCourse}
          </LinkButton>
        </div>
      </footer>
    </LessonFrame>
  )
}

interface ContentProps {
  actionsFor: ReturnType<typeof useLessonActions>
  record: (itemId: string) => (r: AttemptResult) => void
}

function Text({ content, actionsFor, record }: ContentProps & { content: TextContent }) {
  const t = useT()
  return (
    <>
      <Markdown text={content.introduction} />
      {content.sections.map((section, i) => (
        <section key={`${section.title}-${i}`} className="flex flex-col gap-5">
          <h2 className="text-[clamp(1.2rem,2.6vw,1.6rem)]">{section.title}</h2>
          <Markdown text={section.markdown} />
          <div>
            <p className="mb-2 text-[13px] font-medium text-info">{t.lesson.beforeContinuing}</p>
            <Item
              item={section.question}
              actions={actionsFor(section.question.id)}
              onFinish={record(section.question.id)}
            />
          </div>
        </section>
      ))}
      <WorkedExample example={content.workedExample} />
      <Panel className="p-6">
        <h2 className="text-[18px]">{t.lesson.toRemember}</h2>
        <ul className="mt-4 flex flex-col gap-3">
          {content.summary.map((r) => (
            <li key={r} className="flex gap-3 text-[15px]">
              <CheckCircle size={18} weight="fill" className="mt-1 shrink-0 text-success" aria-hidden />
              <Markdown text={r} compact />
            </li>
          ))}
        </ul>
      </Panel>
    </>
  )
}

/** The worked example with "try before you look": one step at a time, revealed when the person asks. */
function WorkedExample({ example }: { example: { prompt: string; steps: string[] } }) {
  const [seenCount, setSeenCount] = useState(0)
  const t = useT()
  return (
    <Panel className="p-6">
      <h2 className="text-[18px]">{t.lesson.workedExample}</h2>
      <div className="mt-3">
        <Markdown text={example.prompt} compact />
      </div>
      <p className="mt-3 text-[14px] text-ink-soft">{t.lesson.tryFirst}</p>
      <ol className="mt-4 flex flex-col gap-3">
        {example.steps.map((step, i) => (
          <li
            key={i}
            className={join(
              'flex gap-3 rounded-tile border px-4 py-3',
              i < seenCount ? 'animate-appear border-line bg-ink/4' : 'border-dashed border-line-strong',
            )}
          >
            <span className="font-mono text-[13px] text-ink-faint">{i + 1}</span>
            {i < seenCount ? (
              <div className="min-w-0 flex-1">
                <Markdown text={step} compact />
              </div>
            ) : (
              <span className="flex-1 text-[14px] text-ink-faint">{t.lesson.hiddenStep(i + 1)}</span>
            )}
          </li>
        ))}
      </ol>
      {seenCount < example.steps.length ? (
        <Button variant="subtle" className="mt-4" onClick={() => setSeenCount(seenCount + 1)} icon={<Eye size={17} />}>
          {t.lesson.showStep(seenCount + 1)}
        </Button>
      ) : null}
    </Panel>
  )
}

function Exercises({
  content,
  actionsFor,
  record,
  correct_answers,
  finished,
}: ContentProps & { content: ExercisesContent; correct_answers: number; finished: number }) {
  const t = useT()
  return (
    <>
      <Markdown text={content.guidance} />
      <p className="text-[14px] text-ink-soft" aria-live="polite">
        {t.lesson.correct_answers} <span className="font-mono text-gold">{correct_answers}</span>{' '}
        {t.lesson.ofTotal(content.items.length)}
        {finished > correct_answers ? t.lesson.toReview(finished - correct_answers) : ''}.
      </p>
      <ol className="flex flex-col gap-4">
        {content.items.map((item, i) => (
          <li key={item.id}>
            <Item item={item} number={i + 1} actions={actionsFor(item.id)} onFinish={record(item.id)} />
          </li>
        ))}
      </ol>
    </>
  )
}

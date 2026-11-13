/**
 * The course: each module is a table of contents, one below the other. Clicking a step shows what it is on the side
 * (on a phone, in a sheet that slides up from the bottom). Modules the AI has not written yet appear dim, with the command
 * ready to ask for the next one. The screen updates itself when the AI saves a course file (SSE).
 */

import { useMemo, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowSquareOut,
  ChatCircleDots,
  Lock,
  ShareNetwork,
  Sparkle,
  WarningCircle,
  X,
} from '@phosphor-icons/react'
import type { CourseDetail, ModuleSummary } from '@shared/api'
import { LANGUAGE_DATA } from '@shared/languages'
import { useData, useCourseEvents } from '@/lib/api'
import { Bar, Button, LinkButton, Loading, Command, ScreenError, Panel, Badge, join } from '@/components/ui'
import { ShareDialog } from '@/course/ShareDialog'
import { useT } from '@/i18n'
import { Syllabus, stepsOf, stepKey, statusOf, upNextOf, type Step } from '@/course/Syllabus'

function StepDetail({
  course,
  step,
  upNext,
  onClose,
}: {
  course: CourseDetail
  step: Step
  upNext: string | null
  onClose?: () => void
}) {
  const status = statusOf(step, upNext)
  const t = useT()
  const m = step.module

  let type: string
  let title: string
  let body: React.ReactNode
  let action: React.ReactNode = null

  if (step.type === 'lesson') {
    const a = step.lesson
    type = t.course.lessonType(t.lessonTypes[a.type], a.order, m.order)
    title = a.title
    body = <p className="text-ink-soft">{a.goal}</p>
    if (status === 'locked') {
      action = (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Lock size={16} /> {t.course.passTheCheckpoint(m.order - 1)}
        </p>
      )
    } else if (status === 'unlit') {
      action = <p className="text-sm text-ink-soft">{t.course.lessonNotWritten}</p>
    } else {
      action = (
        <LinkButton to={`/courses/${course.id}/lessons/${a.id}`} className="w-full">
          {status === 'done' ? t.course.reviewLesson : status === 'now' ? t.course.getStarted : t.course.openLesson}
        </LinkButton>
      )
      if (a.type === 'video' && a.hasVideo === false) {
        body = (
          <>
            {body}
            <p className="mt-3 text-sm text-ink-faint">
              {t.course.videoNotGenerated}{' '}
              <code className="font-mono text-ink-soft">npm run course:video -- {course.id}</code>
            </p>
          </>
        )
      }
    }
  } else if (step.type === 'feynman') {
    type = t.course.feynmanType(m.order)
    title = m.feynmanPassed ? t.course.youTaughtMandy : t.course.teachMandy
    body = <p className="text-ink-soft">{t.course.feynmanBody}</p>
    if (status === 'locked')
      action = (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Lock size={16} /> {t.course.moduleLocked}
        </p>
      )
    else if (status === 'unlit') action = <p className="text-sm text-ink-soft">{t.course.blockNotWritten}</p>
    else
      action = (
        <LinkButton
          to={`/courses/${course.id}/modules/${m.order}/feynman`}
          variant={status === 'done' ? 'subtle' : 'main'}
          className="w-full"
        >
          {status === 'done' ? t.course.explainAgain : t.course.startExplaining}
        </LinkButton>
      )
  } else if (step.type === 'checkpoint') {
    type = t.course.checkpointType(m.order)
    title = m.checkpointPassed ? t.course.checkpointPassed : t.course.showWhatYouLearned
    body = <p className="text-ink-soft">{t.course.checkpointBody}</p>
    if (status === 'locked')
      action = (
        <p className="flex items-center gap-2 text-sm text-ink-soft">
          <Lock size={16} /> {t.course.moduleLocked}
        </p>
      )
    else if (status === 'unlit') action = <p className="text-sm text-ink-soft">{t.course.checkpointNotWritten}</p>
    else
      action = (
        <LinkButton
          to={`/courses/${course.id}/modules/${m.order}/checkpoint`}
          variant={status === 'done' ? 'subtle' : 'main'}
          className="w-full"
        >
          {status === 'done' ? t.course.retakeCheckpoint : t.course.takeCheckpoint}
        </LinkButton>
      )
  } else {
    type = t.course.projectType(m.order)
    title = m.project.title
    body = (
      <>
        <p className="whitespace-pre-line text-ink-soft">{m.project.prompt}</p>
        <p className="mt-4 text-sm text-ink">{t.course.whatCounts}</p>
        <ul className="mt-2 space-y-1.5 text-sm text-ink-soft">
          {m.project.rubric.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent-ink" />
              {r}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-sm text-ink-faint">{t.course.projectGrading}</p>
      </>
    )
  }

  return (
    <Panel className="p-6" as="aside">
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-soft">{type}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="-mt-1 -mr-1 rounded-lg p-1 text-ink-faint hover:text-ink"
            aria-label={t.general.close}
          >
            <X size={18} />
          </button>
        )}
      </div>
      <h2 className="mt-2 text-xl">{title}</h2>
      <div className="mt-3 max-h-[46vh] overflow-y-auto">{body}</div>
      {action && <div className="mt-6">{action}</div>}
    </Panel>
  )
}

function ModuleBand({
  course,
  module,
  firstPending,
}: {
  course: CourseDetail
  module: ModuleSummary
  firstPending: boolean
}) {
  const doneCount = module.lessons.filter((a) => a.completed).length
  const t = useT()
  const step = course.nextStep
  const request = !step
    ? null
    : step.correction
      ? t.ia.fix(course.id, step.file, step.problem ?? '')
      : step.module !== null
        ? t.ia.writeModule(course.id, step.module)
        : t.ia.writeFile(course.id, step.file)
  return (
    <>
      <div className="card sticky top-3 z-20 flex items-center gap-4 rounded-tile px-5 py-3.5">
        <span
          className={join(
            'grid h-10 w-10 shrink-0 place-items-center rounded-full font-display text-sm',
            module.checkpointPassed
              ? 'bg-gold text-white'
              : module.unlocked
                ? 'bg-accent text-white'
                : 'border border-line text-ink-faint',
          )}
        >
          {module.order}
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-sans text-base font-semibold tracking-normal">{module.title}</h2>
          <p className="truncate text-sm text-ink-soft">
            {module.state === 'ready' || module.state === 'partial'
              ? t.course.lessonsDone(doneCount, module.lessons.length)
              : module.state === 'with_errors'
                ? t.course.hasError
                : t.course.notWritten}
          </p>
        </div>
        {module.checkpointPassed && <Badge tone="achievement">{t.course.full}</Badge>}
        {module.state === 'with_errors' && <Badge tone="error">{t.course.error}</Badge>}
      </div>
      {firstPending && request && (
        <div className="mt-3 rounded-tile border border-dashed border-accent-ink/40 bg-sunken/70 p-4 backdrop-blur">
          <p className="mb-3 flex items-center gap-2 text-sm text-ink">
            <Sparkle size={16} weight="fill" className="text-accent-ink" />
            {module.state === 'with_errors' ? t.course.askToFix : t.course.askToWrite}
          </p>
          <Command text={request} />
          {module.problems.length > 0 && (
            <ul className="mt-3 space-y-1 text-sm text-error/90">
              {module.problems.slice(0, 4).map((p) => (
                <li key={p} className="flex gap-2">
                  <WarningCircle size={16} className="mt-0.5 shrink-0" />
                  {p}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </>
  )
}

export default function Course() {
  const { id = '' } = useParams()
  const { data: course, error, loading, reload } = useData<CourseDetail>(`/api/courses/${id}`)
  const [picked, setChosen] = useState<string | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [sharing, setSharing] = useState(false)
  const t = useT()

  useCourseEvents((e) => {
    if (e.courseId === id) void reload()
  })

  const upNextByModule = useMemo(() => new Map(course?.modules.map((m) => [m.order, upNextOf(m)]) ?? []), [course])
  const allSteps = useMemo(() => course?.modules.flatMap(stepsOf) ?? [], [course])
  const overallUpNext = course?.modules.map((m) => upNextByModule.get(m.order)).find(Boolean) ?? null
  const activeKey = picked ?? overallUpNext ?? (allSteps[0] ? stepKey(allSteps[0]) : null)
  const activeStep = allSteps.find((a) => stepKey(a) === activeKey) ?? null

  if (loading) return <Loading text={t.course.nowOpening} />
  if (error || !course) return <ScreenError error={error ?? new Error(t.course.notFound)} onRetry={reload} />
  if (course.underConstruction) return <Navigate to={`/creating/${course.id}`} replace />

  const totalLessons = course.modules.reduce((n, m) => n + m.lessons.length, 0)
  const doneCount = course.modules.reduce((n, m) => n + m.lessons.filter((a) => a.completed).length, 0)
  const firstPending = course.modules.find((m) => m.state !== 'ready')?.order

  function choose(step: Step) {
    setChosen(stepKey(step))
    setSheetOpen(true)
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <Link to="/" className="inline-flex items-center gap-2 text-sm text-ink-soft hover:text-ink">
        <ArrowLeft size={16} /> {t.nav.home}
      </Link>

      <header className="mt-6 max-w-[760px] animate-appear">
        <div className="flex flex-wrap gap-2">
          <Badge>{t.levels[course.brief.level]}</Badge>
          <Badge>{t.course.modules(course.modules.length)}</Badge>
          {course.brief.language && <Badge>{t.course.courseLanguage(LANGUAGE_DATA[course.brief.language].name)}</Badge>}
          {course.done && <Badge tone="achievement">{t.home.done}</Badge>}
        </div>
        <h1 className="mt-4 text-[clamp(2rem,4.6vw,3.4rem)] leading-[1.05]">{course.title}</h1>
        <p className="mt-4 max-w-[64ch] text-lg text-ink-soft">{course.summary}</p>
        <div className="mt-6 flex items-center gap-4">
          <Bar
            value={totalLessons ? doneCount / totalLessons : 0}
            className="max-w-sm flex-1"
            tone={course.done ? 'gold' : 'accent'}
          />
          <span className="text-sm text-ink-soft">{t.course.lessonsDoneOf(doneCount, totalLessons)}</span>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <LinkButton
            to={`/courses/${course.id}/teacher`}
            variant="subtle"
            size="small"
            icon={<ChatCircleDots size={18} className="text-accent-ink" />}
          >
            {t.teacher.entry}
          </LinkButton>
          <span className="text-[13px] text-ink-faint">{t.teacher.entryNote}</span>
          {course.modules.some((m) => m.state === 'ready') && (
            <Button
              variant="ghost"
              size="small"
              onClick={() => setSharing(true)}
              icon={<ShareNetwork size={18} />}
              className="sm:ml-auto"
            >
              {t.share.button}
            </Button>
          )}
        </div>
        {sharing && <ShareDialog courseId={course.id} onClose={() => setSharing(false)} />}
        {course.certificate && (
          <LinkButton to={`/certificates/${course.certificate}`} variant="subtle" size="small" className="mt-5">
            {t.course.viewCertificate}
          </LinkButton>
        )}
      </header>

      <div className="mt-12 grid gap-10 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-14">
          {course.modules.map((m) => (
            <section key={m.order} aria-label={t.course.moduleLabel(m.order, m.title)}>
              <ModuleBand course={course} module={m} firstPending={m.order === firstPending} />
              <p className="mt-4 max-w-[60ch] text-[15px] text-ink-soft">{m.goal}</p>
              <div className={join('mt-4', !m.unlocked && 'opacity-70')}>
                <Syllabus
                  module={m}
                  selected={activeKey}
                  upNext={upNextByModule.get(m.order) ?? null}
                  onChoose={choose}
                />
              </div>
            </section>
          ))}

          <section className="grid gap-6 md:grid-cols-2">
            <Panel className="p-6">
              <h2 className="text-lg">{t.course.byTheEnd}</h2>
              <ul className="mt-4 space-y-2.5 text-ink-soft">
                {course.results.map((r) => (
                  <li key={r} className="flex gap-3">
                    <span className="mt-2.5 h-1.5 w-1.5 shrink-0 rounded-full bg-info" />
                    {r}
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel className="p-6">
              <h2 className="text-lg">{t.course.whereFrom}</h2>
              <p className="mt-2 text-sm text-ink-faint">{t.course.whereFromNote}</p>
              <ul className="mt-4 space-y-3">
                {course.bibliography.map((b) => (
                  <li key={b.title} className="text-sm">
                    {b.url ? (
                      <a
                        href={b.url}
                        target="_blank"
                        rel="noreferrer"
                        className="group inline-flex items-start gap-1.5 text-ink hover:text-info"
                      >
                        <span>{b.title}</span>
                        <ArrowSquareOut size={14} className="mt-1 shrink-0 text-ink-faint group-hover:text-info" />
                      </a>
                    ) : (
                      <span className="text-ink">{b.title}</span>
                    )}
                    {(b.author || b.institution) && (
                      <span className="block text-ink-faint">
                        {[b.author, b.institution].filter(Boolean).join(', ')}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </Panel>
          </section>
        </div>

        <div className="hidden lg:block">
          <div className="sticky top-6">
            {activeStep && (
              <StepDetail
                course={course}
                step={activeStep}
                upNext={upNextByModule.get(activeStep.module.order) ?? null}
              />
            )}
          </div>
        </div>
      </div>

      {/* on a phone, the detail slides up from the bottom when a step is tapped */}
      {sheetOpen && activeStep && (
        <div className="fixed inset-x-3 bottom-24 z-30 animate-appear lg:hidden">
          <StepDetail
            course={course}
            step={activeStep}
            upNext={upNextByModule.get(activeStep.module.order) ?? null}
            onClose={() => setSheetOpen(false)}
          />
        </div>
      )}
    </div>
  )
}

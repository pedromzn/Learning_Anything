/**
 * My courses, the home screen: where to continue, the pace (level, streak and the daily goal) and the shelf of
 * courses, each with its own cover. Requests the AI has not started yet appear with the command to paste.
 */

import { Link } from 'react-router-dom'
import { ArrowsClockwise, BookOpenText, Barbell, PlayCircle, Plus, Trash } from '@phosphor-icons/react'
import type { CourseSummary, Panel as DadosDoPainel } from '@shared/api'
import type { ReviewToday } from '@shared/review'
import { api, useData, useCourseEvents } from '@/lib/api'
import { Bar, LinkButton, Loading, Command, ScreenError, Panel, Badge, join } from '@/components/ui'
import { CourseCover } from '@/course/CourseCover'
import { format, useT } from '@/i18n'

const ICON = { video: PlayCircle, text: BookOpenText, exercises: Barbell }

/** The daily goal as a ring that closes; it turns gold when the goal is met. */
function GoalRing({ xp, meta }: { xp: number; meta: number }) {
  const fraction = Math.min(1, meta ? xp / meta : 0)
  const radius = 22
  const lap = 2 * Math.PI * radius
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden className="-rotate-90">
      <circle cx="28" cy="28" r={radius} stroke="var(--line)" strokeWidth="4" fill="none" />
      <circle
        cx="28"
        cy="28"
        r={radius}
        stroke={fraction >= 1 ? 'var(--gold)' : 'var(--accent)'}
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeDasharray={lap}
        strokeDashoffset={lap * (1 - fraction)}
        style={{ transition: 'stroke-dashoffset 900ms ease-out' }}
      />
    </svg>
  )
}

function Pace({ profile }: { profile: DadosDoPainel['profile'] }) {
  const t = useT()
  const max = Math.max(profile.dailyGoal, ...profile.week.map((d) => d.xp), 1)
  return (
    <Panel className="grid gap-6 p-6 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-line">
      <div className="sm:pr-6">
        <p className="text-sm text-ink-soft">{t.home.level(profile.level.number)}</p>
        <p className="mt-1 font-display text-2xl">{format.number(profile.totalXp)} XP</p>
        <Bar value={profile.level.progress} className="mt-3" />
        <p className="mt-2 text-xs text-ink-faint">
          {t.home.xpToLevel(Math.max(0, profile.level.xpToNext - profile.level.xpInLevel), profile.level.number + 1)}
        </p>
      </div>
      <div className="flex items-center gap-4 sm:px-6">
        <GoalRing xp={profile.xpToday} meta={profile.dailyGoal} />
        <div>
          <p className="text-sm text-ink-soft">{t.home.todayGoal}</p>
          <p className="mt-0.5 font-display text-xl">
            {profile.xpToday}
            <span className="text-base text-ink-faint">/{profile.dailyGoal} XP</span>
          </p>
        </div>
      </div>
      <div className="sm:pl-6">
        <p className="text-sm text-ink-soft">{t.home.streak(profile.currentStreak)}</p>
        {/* the week as seven bars: the height is that day's XP */}
        <div className="mt-3 flex h-12 items-end justify-between gap-1.5" aria-label={t.home.weekXp}>
          {profile.week.map((d, i) => {
            const fraction = d.xp / max
            const today = i === profile.week.length - 1
            const letter = format.weekday(d.day, 'narrow')
            return (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1.5" title={`${d.day}: ${d.xp} XP`}>
                <span
                  className={join(
                    'block w-full max-w-[14px] rounded-sm',
                    d.xp > 0 ? (today ? 'bg-info' : 'bg-accent') : 'bg-ink/10',
                  )}
                  style={{ height: 4 + fraction * 28 }}
                />
                <span className={join('text-[11px]', today ? 'text-ink' : 'text-ink-faint')}>{letter}</span>
              </div>
            )
          })}
        </div>
      </div>
    </Panel>
  )
}

function CourseCard({ course, index }: { course: CourseSummary; index: number }) {
  const destination = course.underConstruction ? `/creating/${course.id}` : `/courses/${course.id}`
  const t = useT()
  return (
    <Link
      to={destination}
      className="card group relative flex animate-appear flex-col overflow-hidden rounded-panel p-4 transition-[border-color] duration-300 hover:border-line-strong"
      style={{ animationDelay: `${index * 60}ms` }}
    >
      <CourseCover
        id={course.id}
        title={course.title}
        modules={course.totalModules}
        modulesDone={course.done ? course.totalModules : Math.max(0, course.currentModule - 1)}
        className="-mx-1 -mt-1 mb-4 h-32 transition-transform duration-300 group-hover:-translate-y-0.5"
      />
      <div className="flex flex-wrap gap-1.5">
        <Badge>{t.levels[course.level]}</Badge>
        {course.done && <Badge tone="achievement">{t.home.done}</Badge>}
        {course.underConstruction && <Badge tone="now">{t.home.underConstruction}</Badge>}
      </div>
      <h3 className="mt-3 text-[1.2rem] leading-snug">{course.title}</h3>
      <p className="mt-1.5 line-clamp-2 text-sm text-ink-soft">{course.summary}</p>
      <div className="mt-auto pt-5">
        <div className="mb-2 flex justify-between text-xs text-ink-faint">
          <span>{t.home.moduleOf(course.currentModule, course.totalModules)}</span>
          <span>{t.home.lessons(course.completedLessons, course.totalLessons)}</span>
        </div>
        <Bar
          value={course.totalLessons ? course.completedLessons / course.totalLessons : 0}
          tone={course.done ? 'gold' : 'accent'}
        />
      </div>
    </Link>
  )
}

/** Today's spaced review, when there is one: the exercises the student got wrong come back here. */
function ReviewCard() {
  const { data } = useData<ReviewToday>('/api/review')
  const t = useT()
  if (!data || data.cards.length === 0) return null
  return (
    <Link
      to="/review"
      className="card group mt-4 flex animate-appear items-center gap-4 rounded-panel p-4 transition-colors hover:border-line-strong sm:p-5"
      style={{ animationDelay: '110ms' }}
    >
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-info/12 text-info">
        <ArrowsClockwise size={22} weight="bold" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-display text-lg">{t.review.cardTitle(data.cards.length)}</p>
        <p className="text-sm text-ink-soft">{t.review.cardNote}</p>
      </div>
      <span className="hidden text-sm font-medium text-accent-ink group-hover:underline sm:block">
        {t.review.start}
      </span>
    </Link>
  )
}

export default function Home() {
  const { data, error, loading, reload } = useData<DadosDoPainel>('/api/dashboard')
  const t = useT()
  useCourseEvents(() => void reload())

  if (loading) return <Loading text={t.home.looking} />
  if (error || !data) return <ScreenError error={error ?? new Error(t.general.noData)} onRetry={reload} />

  const { profile, resume, courses, requests } = data
  const CurrentIcon = resume ? ICON[resume.type] : null

  async function cancelRequest(slug: string) {
    await api.del(`/api/requests/${slug}`).catch(() => undefined)
    void reload()
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      <header className="animate-appear">
        <p className="text-ink-soft">
          {t.home.greeting(new Date().getHours())}
          {profile.name ? `, ${profile.name.split(' ')[0]}` : ''}.
        </p>
        <h1 className="mt-2 max-w-[18ch] text-[clamp(2.1rem,5vw,3.6rem)] leading-[1.04]">
          {resume ? t.home.oneStep : courses.length ? t.home.whatToLearn : t.home.shelfWaiting}
        </h1>
      </header>

      {resume && CurrentIcon && (
        <Link
          to={`/courses/${resume.courseId}/lessons/${resume.lessonId}`}
          className="card group relative mt-8 flex animate-appear items-center gap-5 overflow-hidden rounded-panel border-l-4 border-l-accent p-5 transition-colors hover:border-line-strong sm:p-6"
          style={{ animationDelay: '80ms' }}
        >
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-accent text-white">
            <CurrentIcon size={26} weight="fill" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm text-accent-ink">{t.home.pickUpWhereYouLeft(t.lessonTypesLowercase[resume.type])}</p>
            <p className="mt-1 truncate font-display text-xl sm:text-2xl">{resume.lessonTitle}</p>
            <p className="mt-1 truncate text-sm text-ink-soft">
              {t.general.courseModule(resume.courseTitle, resume.module)}
            </p>
          </div>
          <span className="hidden rounded-pill bg-accent px-5 py-2.5 text-sm font-semibold text-white transition-transform group-hover:translate-x-0.5 sm:block">
            {t.general.resume}
          </span>
        </Link>
      )}

      <ReviewCard />

      <div className="mt-6 animate-appear" style={{ animationDelay: '140ms' }}>
        <Pace profile={profile} />
      </div>

      <section className="mt-14">
        <div className="flex items-end justify-between gap-4">
          <h2 className="text-2xl">{t.home.yourCourses}</h2>
          <LinkButton to="/new" variant="subtle" size="small" icon={<Plus size={16} />}>
            {t.nav.newCourse}
          </LinkButton>
        </div>

        {courses.length === 0 && requests.length === 0 ? (
          <Panel className="mt-6 p-8 text-center">
            <p className="font-display text-xl">{t.home.noCourses}</p>
            <p className="mx-auto mt-2 max-w-[52ch] text-ink-soft">
              {t.home.noCoursesNote} <code className="font-mono text-ink">courses/</code>.
            </p>
            <LinkButton to="/new" className="mt-6">
              {t.home.createFirst}
            </LinkButton>
          </Panel>
        ) : (
          <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {courses.map((c, i) => (
              <CourseCard key={c.id} course={c} index={i} />
            ))}
            <Link
              to="/new"
              className="group flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-panel border border-dashed border-line-strong text-ink-soft transition-colors hover:border-accent-ink hover:text-ink"
            >
              <span className="grid h-14 w-14 place-items-center rounded-full border border-line-strong transition-[border-color] duration-300 group-hover:border-accent-ink">
                <Plus size={22} />
              </span>
              <span>{t.home.newCourseCard}</span>
            </Link>
          </div>
        )}
      </section>

      {requests.length > 0 && (
        <section className="mt-14">
          <h2 className="text-2xl">{t.home.waitingForAi}</h2>
          <p className="mt-2 text-ink-soft">
            {t.home.waitingForAiNote} <code className="font-mono text-ink">courses/</code>
          </p>
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {requests.map((p) => (
              <Panel key={p.slug} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="font-sans text-base font-semibold tracking-normal">{p.topic}</h3>
                    <p className="text-sm text-ink-faint">
                      {t.home.requestedOn(t.levels[p.level], format.shortDate(p.createdAt))}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => cancelRequest(p.slug)}
                    className="rounded-lg p-1.5 text-ink-faint hover:text-error"
                    aria-label={t.home.cancelRequest(p.topic)}
                  >
                    <Trash size={16} />
                  </button>
                </div>
                <Command className="mt-4" text={t.ia.createCourse(p.slug)} />
                <Link to={`/creating/${p.slug}`} className="mt-3 inline-block text-sm text-accent-ink hover:underline">
                  {t.home.track}
                </Link>
              </Panel>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}

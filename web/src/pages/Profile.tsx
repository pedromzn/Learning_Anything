/**
 * The profile: the name that goes on the certificate, level and XP, the streak, the daily goal, the numbers, the
 * achievements as stars (earned ones lit in gold, missing ones dim with a progress bar) and the certificates.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { Certificate, Check, Fire, Star } from '@phosphor-icons/react'
import type { StudentProfile } from '@shared/api'
import { ACHIEVEMENT_CATEGORIES, DAILY_GOALS } from '@shared/gamification'
import { api, useData } from '@/lib/api'
import { Bar, Button, Loading, Header, ScreenError, Panel, Badge, join } from '@/components/ui'
import { FocusSection } from '@/focus/FocusSection'
import { format, useLanguage, useT } from '@/i18n'
import { LANGUAGE_DATA, LANGUAGES } from '@shared/languages'

const number = format.number
const date = format.date
const weekday = (day: string) => format.weekday(day, 'short')

/** The interface language, right on the profile (the first screen asks it once). */
function LanguageSetting() {
  const t = useT()
  const language = useLanguage((s) => s.language)
  const choose = useLanguage((s) => s.choose)
  return (
    <Panel className="flex flex-wrap items-center justify-between gap-4 p-6">
      <div>
        <h2 className="text-[19px]">{t.language.app}</h2>
        <p className="mt-1 text-[14px] text-ink-soft">{t.language.appNote}</p>
      </div>
      <div className="flex gap-2" role="radiogroup" aria-label={t.language.label}>
        {LANGUAGES.map((i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={language === i}
            lang={LANGUAGE_DATA[i].bcp47}
            onClick={() => choose(i)}
            className={join(
              'rounded-tile border px-3.5 py-2 text-[14px] transition-colors',
              language === i
                ? 'border-accent-ink bg-accent/18 text-ink'
                : 'border-line text-ink-soft hover:border-line-strong',
            )}
          >
            {LANGUAGE_DATA[i].name}
          </button>
        ))}
      </div>
    </Panel>
  )
}

export default function Profile() {
  const { data, error, loading, reload } = useData<StudentProfile>('/api/profile')
  const [profile, setProfile] = useState<StudentProfile | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const t = useT()

  useEffect(() => {
    if (data) setProfile(data)
  }, [data])

  if (loading) return <Loading />
  if (error || !profile)
    return <ScreenError error={error ?? { message: t.profile.notFound }} onRetry={() => void reload()} />

  async function changeGoal(meta: number) {
    if (!profile) return
    const before = profile
    setProfile({ ...profile, dailyGoal: meta })
    setFailure(null)
    try {
      setProfile(await api.put<StudentProfile>('/api/profile', { dailyGoal: meta }))
    } catch (e) {
      setProfile(before)
      setFailure(e instanceof Error ? e.message : t.profile.goalNotSaved)
    }
  }

  const earned = profile.achievements.filter((c) => c.earnedAt).length
  const { level } = profile
  const weekMax = Math.max(1, profile.dailyGoal, ...profile.week.map((d) => d.xp))
  const levelTitle = [...t.levelTitles].reverse().find((x) => level.number >= x.since)?.title ?? level.title

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8">
      <Header title={profile.name || t.profile.yourProfile} note={t.profile.note} />

      <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
        <Panel className="flex flex-col gap-5 p-6">
          <StudentName name={profile.name} onSave={setProfile} />
          <div>
            <div className="flex items-end justify-between gap-3">
              <p className="font-display text-[clamp(1.5rem,3vw,2rem)] text-gold">{t.profile.level(level.number)}</p>
              <p className="font-mono text-[13px] text-ink-soft">
                {number(level.xpInLevel)}/{number(level.xpToNext)} XP
              </p>
            </div>
            {levelTitle ? <p className="text-[14px] text-ink-soft">{levelTitle}</p> : null}
            <Bar value={level.progress} tone="gold" className="mt-3" />
            <p className="mt-2 text-[13px] text-ink-faint">{t.profile.totalXp(number(profile.totalXp))}</p>
          </div>
        </Panel>

        <Panel className="flex flex-col justify-between gap-4 p-6">
          <div className="flex items-center gap-3">
            <Fire
              size={34}
              weight="fill"
              className={profile.currentStreak ? 'text-gold' : 'text-ink-faint'}
              aria-hidden
            />
            <div>
              <p className="font-display text-[1.75rem] leading-none text-ink">{profile.currentStreak}</p>
              <p className="text-[14px] text-ink-soft">{t.profile.consecutiveDays(profile.currentStreak)}</p>
            </div>
          </div>
          <p className="text-[14px] text-ink-soft">{t.profile.longestStreak(profile.longestStreak)}</p>
          <div className="flex items-end gap-1.5" role="img" aria-label={t.profile.weekXp}>
            {profile.week.map((d, i) => (
              <div key={d.day} className="flex flex-1 flex-col items-center gap-1">
                <div className="flex h-12 w-full items-end">
                  <div
                    className={join(
                      'w-full rounded-t-sm',
                      d.xp > 0 ? 'bg-accent-ink' : 'bg-ink/8',
                      i === profile.week.length - 1 && d.xp > 0 && 'bg-info',
                    )}
                    style={{ height: `${Math.max(d.xp > 0 ? 12 : 4, (d.xp / weekMax) * 100)}%` }}
                  />
                </div>
                <span className="text-[11px] text-ink-faint">{weekday(d.day)}</span>
              </div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-[19px]">{t.profile.dayGoal}</h2>
          <p className="mt-1 text-[14px] text-ink-soft">
            {t.profile.today} <span className="font-mono text-ink">{number(profile.xpToday)}</span>{' '}
            {t.profile.ofXp(profile.dailyGoal)}
          </p>
        </div>
        <Bar
          value={profile.xpToday / profile.dailyGoal}
          tone={profile.xpToday >= profile.dailyGoal ? 'gold' : 'accent'}
        />
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t.profile.chooseGoal}>
          {DAILY_GOALS.map((m) => {
            const isActive = profile.dailyGoal === m.xp
            return (
              <button
                key={m.xp}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => void changeGoal(m.xp)}
                className={join(
                  'flex flex-col gap-0.5 rounded-tile border px-3.5 py-3 text-left transition-colors',
                  isActive ? 'border-accent-ink bg-accent/18' : 'border-line hover:border-line-strong',
                )}
              >
                <span className="text-[14px] font-medium text-ink">
                  {t.profile.goals[m.xp]?.label ?? m.label} <span className="font-mono text-ink-soft">{m.xp} XP</span>
                </span>
                <span className="text-[12.5px] text-ink-soft">
                  {t.profile.goals[m.xp]?.description ?? m.description}
                </span>
              </button>
            )
          })}
        </div>
        {failure ? (
          <p role="alert" className="text-[14px] text-error">
            {failure}
          </p>
        ) : null}
      </Panel>

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4" aria-label={t.profile.statistics}>
        <StatNumber label={t.profile.completedLessons} value={profile.statistics.completedLessons} />
        <StatNumber label={t.profile.correct_answers} value={profile.statistics.correct_answers} />
        <StatNumber label={t.profile.passedCheckpoints} value={profile.statistics.passedCheckpoints} />
        <StatNumber label={t.profile.completedCourses} value={profile.statistics.completedCourses} />
      </section>

      <FocusSection />

      <LanguageSetting />

      <section className="flex flex-col gap-5" aria-label={t.profile.achievements}>
        <div className="flex items-baseline justify-between">
          <h2 className="text-[clamp(1.25rem,2.4vw,1.6rem)]">{t.profile.achievements}</h2>
          <span className="font-mono text-[13px] text-ink-soft">
            {earned}/{profile.achievements.length}
          </span>
        </div>
        {ACHIEVEMENT_CATEGORIES.map((category) => {
          const list = profile.achievements.filter((c) => c.category === category)
          if (!list.length) return null
          return (
            <div key={category} className="flex flex-col gap-3">
              <h3 className="font-sans text-[14px] font-medium text-ink-soft">
                {t.profile.categories[category] ?? category}
              </h3>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {list.map((c) => {
                  const isLit = Boolean(c.earnedAt)
                  return (
                    <li
                      key={c.code}
                      className={join(
                        'flex items-start gap-3.5 rounded-tile border p-4 transition-colors',
                        isLit ? 'card border-gold/30' : 'border-dashed border-line-strong',
                      )}
                    >
                      <Star
                        size={30}
                        weight={isLit ? 'fill' : 'regular'}
                        className={join('mt-0.5 shrink-0', isLit ? 'text-gold' : 'text-ink-faint/70')}
                        aria-label={isLit ? t.profile.wasEarned : t.profile.notEarned}
                      />
                      <div className="min-w-0 flex-1">
                        <p className={join('text-[15px] font-medium', isLit ? 'text-ink' : 'text-ink-soft')}>
                          {t.achievements[c.code]?.[0] ?? c.name}
                        </p>
                        <p className="text-[13px] text-ink-soft">{t.achievements[c.code]?.[1] ?? c.description}</p>
                        {isLit && c.earnedAt ? (
                          <p className="mt-1.5 text-[12px] text-gold/90">{t.profile.earnedAt(date(c.earnedAt))}</p>
                        ) : (
                          <div className="mt-2.5 flex items-center gap-2">
                            <Bar value={c.progress} className="flex-1" />
                            <span className="shrink-0 font-mono text-[12px] text-ink-faint">
                              {Math.round(c.progress * 100)}%
                            </span>
                          </div>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            </div>
          )
        })}
      </section>

      <section className="flex flex-col gap-4" aria-label={t.profile.certificates}>
        <h2 className="text-[clamp(1.25rem,2.4vw,1.6rem)]">{t.profile.certificates}</h2>
        {profile.certificates.length ? (
          <ul className="grid gap-3 sm:grid-cols-2">
            {profile.certificates.map((c) => (
              <li key={c.code}>
                <Link
                  to={`/certificates/${c.code}`}
                  className="card flex items-center gap-4 rounded-tile p-4 transition-colors hover:border-gold/40"
                >
                  <span className="grid size-12 shrink-0 place-items-center rounded-full bg-gold/12 text-gold">
                    <Certificate size={24} weight="fill" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-ink">{c.title}</span>
                    <span className="text-[13px] text-ink-soft">{t.profile.issuedAt(date(c.issuedAt))}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[14px] text-ink-soft">{t.profile.noCertificates}</p>
        )}
      </section>
    </div>
  )
}

function StatNumber({ label, value }: { label: string; value: number }) {
  return (
    <Panel className="flex flex-col gap-1 p-5">
      <span className="font-display text-[1.75rem] leading-none text-ink">{number(value)}</span>
      <span className="text-[13px] text-ink-soft">{label}</span>
    </Panel>
  )
}

function StudentName({ name, onSave }: { name: string; onSave: (p: StudentProfile) => void }) {
  const [text, setText] = useState(name)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const t = useT()
  const changed = text.trim() !== name

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!changed || !text.trim()) return
    setSaving(true)
    setError(null)
    try {
      onSave(await api.put<StudentProfile>('/api/profile', { name: text.trim() }))
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2200)
    } catch (err) {
      setError(err instanceof Error ? err.message : t.profile.nameNotSaved)
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={save} className="flex flex-col gap-2">
      <label htmlFor="student-name" className="text-[14px] font-medium text-ink">
        {t.profile.yourName}
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="student-name"
          value={text}
          maxLength={80}
          autoComplete="name"
          onChange={(e) => setText(e.target.value)}
          placeholder={t.profile.namePlaceholder}
          className="h-11 min-w-0 flex-1 rounded-tile border border-line-strong bg-card px-3.5 text-[15px] text-ink placeholder:text-ink-faint focus:border-accent-ink focus:outline-none"
        />
        <Button type="submit" variant="subtle" disabled={!changed || !text.trim() || saving}>
          {saving ? t.profile.saving : t.profile.saveName}
        </Button>
      </div>
      {!name ? <p className="text-[13px] text-ink-soft">{t.profile.noName}</p> : null}
      {saved ? (
        <Badge tone="now" className="self-start">
          <Check size={13} weight="bold" aria-hidden />
          {t.profile.nameSaved}
        </Badge>
      ) : null}
      {error ? (
        <p role="alert" className="text-[14px] text-error">
          {error}
        </p>
      ) : null}
    </form>
  )
}

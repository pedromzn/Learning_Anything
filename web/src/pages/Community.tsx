/**
 * The community shelf: courses other people shared on the project's GitHub (see `shared/community.ts`). Each card
 * installs the course into `courses/` with the same checks as `course:import`. The page says plainly that it reads
 * from GitHub; without internet it shows the copy in this folder.
 */

import { useMemo, useState } from 'react'
import { ArrowsClockwise, CloudSlash, MagnifyingGlass, ShareNetwork } from '@phosphor-icons/react'
import type { CommunityCourse, CommunityList, InstallResult } from '@shared/community'
import { LANGUAGES, LANGUAGE_DATA, type Language } from '@shared/languages'
import { api, useData } from '@/lib/api'
import { Badge, Button, Command, Header, LinkButton, Loading, Panel, ScreenError, join } from '@/components/ui'
import { CourseCover } from '@/course/CourseCover'
import { errorMessage, useT } from '@/i18n'

export default function Community() {
  const t = useT()
  const [refreshing, setRefreshing] = useState(false)
  const { data, error, loading, reload } = useData<CommunityList>('/api/community')
  const [query, setQuery] = useState('')
  const [language, setLanguage] = useState<Language | 'all'>('all')

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return (data?.courses ?? []).filter(
      (c) =>
        (language === 'all' || c.language === language) &&
        (!q || `${c.title} ${c.topic} ${c.summary}`.toLowerCase().includes(q)),
    )
  }, [data, query, language])

  async function refresh() {
    setRefreshing(true)
    try {
      await api.get('/api/community?refresh=1')
      await reload()
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) return <Loading text={t.community.loading} />
  if (error || !data)
    return <ScreenError error={error ?? { message: t.general.noData }} onRetry={() => void reload()} />

  return (
    <div className="mx-auto max-w-[1180px]">
      <Header
        title={t.community.title}
        note={t.community.intro}
        actions={
          <Button
            variant="subtle"
            size="small"
            onClick={() => void refresh()}
            disabled={refreshing}
            icon={<ArrowsClockwise size={16} className={join(refreshing && 'animate-spin')} />}
          >
            {t.community.refresh}
          </Button>
        }
      />
      <p className="mt-3 flex items-center gap-2 text-[13px] text-ink-faint">
        {data.source === 'local' && <CloudSlash size={15} className="shrink-0 text-info" />}
        {data.source === 'local' ? t.community.offline : t.community.network(data.repo)}
      </p>

      {data.courses.length > 0 && (
        <div className="mt-8 flex flex-wrap items-center gap-3">
          <label className="card flex h-11 min-w-0 flex-1 basis-64 items-center gap-2 rounded-pill px-4">
            <MagnifyingGlass size={16} className="shrink-0 text-ink-faint" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.community.search}
              aria-label={t.community.search}
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-faint"
            />
          </label>
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language | 'all')}
            aria-label={t.language.label}
            className="card h-11 rounded-pill px-4 text-[15px] text-ink"
          >
            <option value="all">{t.community.allLanguages}</option>
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {LANGUAGE_DATA[l].name}
              </option>
            ))}
          </select>
        </div>
      )}

      {data.courses.length === 0 ? (
        <Panel className="mt-8 p-8 text-center">
          <p className="mx-auto max-w-[48ch] text-ink-soft">{t.community.empty}</p>
        </Panel>
      ) : shown.length === 0 ? (
        <p className="mt-10 text-center text-ink-soft">{t.community.noMatch}</p>
      ) : (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c, i) => (
            <CommunityCard key={c.slug} course={c} index={i} onInstalled={() => void reload()} />
          ))}
        </div>
      )}

      <Panel className="mt-12 flex flex-wrap items-start gap-4 p-6">
        <ShareNetwork size={26} className="mt-0.5 shrink-0 text-accent-ink" weight="duotone" />
        <div className="min-w-0 flex-1 basis-72">
          <h2 className="text-lg">{t.community.shareTitle}</h2>
          <p className="mt-1.5 max-w-[70ch] text-sm text-ink-soft">{t.community.shareNote}</p>
        </div>
        <LinkButton to="/" variant="subtle" size="small">
          {t.nav.home}
        </LinkButton>
      </Panel>
    </div>
  )
}

function CommunityCard({
  course: c,
  index,
  onInstalled,
}: {
  course: CommunityCourse
  index: number
  onInstalled: () => void
}) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [done, setDone] = useState(false)

  async function install() {
    setBusy(true)
    setProblem(null)
    try {
      await api.post<InstallResult>('/api/community/install', { slug: c.slug })
      setDone(true)
      onInstalled()
    } catch (e) {
      setProblem(errorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <article
      className="card flex animate-appear flex-col rounded-panel p-4"
      style={{ animationDelay: `${Math.min(index, 8) * 50}ms` }}
    >
      <CourseCover
        id={c.slug}
        title={c.title}
        modules={c.modules}
        modulesDone={c.writtenModules}
        className="-mx-1 -mt-1 mb-4 h-28"
      />
      <div className="flex flex-wrap gap-1.5">
        <Badge>{t.levels[c.level]}</Badge>
        <Badge>{LANGUAGE_DATA[c.language].name}</Badge>
      </div>
      <h3 className="mt-3 text-[1.15rem] leading-snug">{c.title}</h3>
      <p className="mt-1.5 line-clamp-3 text-sm text-ink-soft">{c.summary}</p>
      <p className="mt-3 text-xs text-ink-faint">
        {t.community.written(c.writtenModules, c.modules)} · {t.community.lessons(c.lessons)}
        {c.author && (
          <>
            {' · '}
            <a
              href={`https://github.com/${c.author}`}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-line-strong underline-offset-2 hover:text-ink"
            >
              {t.community.by(c.author)}
            </a>
          </>
        )}
      </p>
      <div className="mt-auto pt-5">
        {c.installed || done ? (
          <LinkButton to={`/courses/${c.slug}`} variant="subtle" size="small" className="w-full">
            {t.community.open}
          </LinkButton>
        ) : (
          <Button size="small" className="w-full" onClick={() => void install()} disabled={busy}>
            {busy ? t.community.installing : t.community.install}
          </Button>
        )}
        {done && (
          <div className="mt-3">
            <p className="mb-2 text-xs text-ink-soft">{t.community.installedNote}</p>
            <Command text={`npm run course:video -- ${c.slug}`} />
          </div>
        )}
        {problem && <p className="mt-3 text-sm text-error">{problem}</p>}
      </div>
    </article>
  )
}

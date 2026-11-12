/** The profile "Focus" section: focused hours, average focus, most common distractions and the latest sessions. */

import { useEffect } from 'react'
import { Timer } from '@phosphor-icons/react'
import { DISTRACTION_TYPES, focusPercent, type FocusSummary } from '@shared/focus'
import { Button, Panel, join } from '@/components/ui'
import { useData } from '@/lib/api'
import { openSettings, useFocus } from './engine'
import { format, useT } from '@/i18n'

const hours = (min: number) =>
  min < 60 ? `${min} min` : `${Math.floor(min / 60)}h${min % 60 ? ` ${min % 60}min` : ''}`
const when = format.dateTime

export function FocusSection() {
  const { data, reload } = useData<FocusSummary>('/api/focus/sessions')
  const sessionSummary = useFocus((s) => s.summary)
  const t = useT()

  // a session just ended: refresh the numbers
  useEffect(() => {
    if (sessionSummary) void reload()
  }, [sessionSummary, reload])

  if (!data) return null
  const commonOnes = DISTRACTION_TYPES.filter((t) => data.distractions[t])
    .sort((a, b) => (data.distractions[b] ?? 0) - (data.distractions[a] ?? 0))
    .slice(0, 3)

  return (
    <section className="flex flex-col gap-4" aria-label={t.focus.section}>
      <h2 className="text-[clamp(1.25rem,2.4vw,1.6rem)]">{t.focus.section}</h2>
      {data.sessions === 0 ? (
        <Panel className="flex flex-col items-start gap-3 p-6">
          <p className="text-ink-soft">{t.focus.invitation}</p>
          <Button variant="subtle" icon={<Timer size={18} />} onClick={openSettings}>
            {t.focus.startSession}
          </Button>
        </Panel>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Panel className="flex flex-col gap-1 p-5">
              <span className="font-display text-[1.75rem] leading-none text-ink">{hours(data.focusedMinutes)}</span>
              <span className="text-[13px] text-ink-soft">{t.focus.ofTrueFocus}</span>
            </Panel>
            <Panel className="flex flex-col gap-1 p-5">
              <span className="font-display text-[1.75rem] leading-none text-ink">{data.focusAverage ?? 0}%</span>
              <span className="text-[13px] text-ink-soft">{t.focus.averageFocus}</span>
            </Panel>
            <Panel className="flex flex-col gap-1 p-5">
              <span className="font-display text-[1.75rem] leading-none text-ink">{data.sessions}</span>
              <span className="text-[13px] text-ink-soft">{t.focus.sessions(data.sessions)}</span>
            </Panel>
            <Panel className="flex flex-col gap-1 p-5">
              <span className="text-[15px] leading-tight text-ink">
                {commonOnes.length ? commonOnes.map((d) => t.focus.labels[d]).join(', ') : t.focus.none}
              </span>
              <span className="text-[13px] text-ink-soft">{t.focus.mostCommon}</span>
            </Panel>
          </div>
          <Panel className="p-0">
            <ul className="divide-y divide-line">
              {data.recent.map((s) => {
                const pct = focusPercent(s.attentiveSeconds, s.focusSeconds)
                const n = Object.values(s.distractions).reduce<number>((a, b) => a + (b ?? 0), 0)
                return (
                  <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3 text-sm">
                    <span className="w-32 text-ink-soft">{when(s.startedAt)}</span>
                    <span className="text-ink">{t.focus.focusedFor(hours(Math.round(s.attentiveSeconds / 60)))}</span>
                    <span className={join(pct >= 80 ? 'text-success' : pct >= 50 ? 'text-gold' : 'text-error')}>
                      {pct}%
                    </span>
                    <span className="text-ink-faint">
                      {n} {t.focus.distractions(n)}
                    </span>
                    {!s.completed && <span className="ml-auto text-[12px] text-ink-faint">{t.focus.interrupted}</span>}
                  </li>
                )
              })}
            </ul>
          </Panel>
        </>
      )}
    </section>
  )
}

/** The "Sources" drawer: the sources the AI used, with a link when there is one. Closed by default so it does not clutter the lesson. */

import { ArrowSquareOut, BookOpen, CaretDown } from '@phosphor-icons/react'
import type { LessonSource } from '@shared/api'
import { Panel } from '@/components/ui'
import { useT } from '@/i18n'

export function Sources({ sources }: { sources: LessonSource[] }) {
  const t = useT()
  if (!sources.length) return null
  return (
    <Panel className="p-0">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-[inherit] px-5 py-4 select-none sm:px-6 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-2">
            <BookOpen size={18} className="text-info" aria-hidden />
            <span className="text-[15px] font-medium text-ink">{t.lesson.sources}</span>
            <span className="text-[13px] text-ink-faint">({sources.length})</span>
          </span>
          <CaretDown
            size={16}
            className="text-ink-faint transition-transform duration-200 group-open:rotate-180"
            aria-hidden
          />
        </summary>
        <ul className="flex flex-col gap-3 px-5 pb-5 sm:px-6 sm:pb-6">
          {sources.map((f) => {
            const who = [f.author, f.institution].filter(Boolean).join(', ')
            const label = t.lesson.sourceTypes[f.type]
            return (
              <li key={`${f.title}-${f.url ?? ''}`} className="text-[15px]">
                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="inline-flex items-start gap-1.5 text-ink underline decoration-line-strong underline-offset-4 hover:decoration-info"
                  >
                    {f.title}
                    <ArrowSquareOut size={14} className="mt-1 shrink-0 text-info" aria-hidden />
                  </a>
                ) : (
                  <span className="text-ink">{f.title}</span>
                )}
                <span className="block text-[13px] text-ink-faint">{[label, who].filter(Boolean).join(', ')}</span>
              </li>
            )
          })}
        </ul>
      </details>
    </Panel>
  )
}

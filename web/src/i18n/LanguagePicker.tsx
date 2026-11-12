/**
 * The first screen, shown once: the person picks the interface language before anything else. Each option is written
 * in its own language, and the title shows in every language, since we don't know yet which one the person reads.
 */

import { Check } from '@phosphor-icons/react'
import { Brand } from '@/components/Brand'
import { join } from '@/components/ui'
import { LANGUAGE_DATA, LANGUAGES, type Language } from '@shared/languages'
import { DICTIONARIES, useLanguage } from '.'

export function LanguagePicker() {
  const suggested = useLanguage((s) => s.language)
  const choose = useLanguage((s) => s.choose)
  return (
    <div className="relative isolate grid min-h-dvh place-items-center px-4 py-10">
      <main className="relative w-full max-w-md animate-appear text-center">
        <Brand size={56} className="mx-auto" />
        <h1 className="mt-6 flex flex-col gap-1 text-[clamp(1.6rem,5vw,2.2rem)]">
          {LANGUAGES.map((i) => (
            <span key={i} lang={LANGUAGE_DATA[i].bcp47} className={i === suggested ? 'text-ink' : 'text-ink-soft'}>
              {DICTIONARIES[i].language.title}
            </span>
          ))}
        </h1>
        <ul className="mt-8 flex flex-col gap-3" role="list">
          {LANGUAGES.map((i: Language) => (
            <li key={i}>
              <button
                type="button"
                lang={LANGUAGE_DATA[i].bcp47}
                onClick={() => choose(i)}
                autoFocus={i === suggested}
                className={join(
                  'card flex w-full items-center justify-between gap-3 rounded-tile px-5 py-4 text-left text-lg transition-colors',
                  i === suggested ? 'border-accent-ink/60' : 'hover:border-line-strong',
                )}
              >
                <span className="text-ink">{LANGUAGE_DATA[i].name}</span>
                {i === suggested && <Check size={20} weight="bold" className="text-accent-ink" aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-sm text-ink-faint" lang={LANGUAGE_DATA[suggested].bcp47}>
          {DICTIONARIES[suggested].language.note}
        </p>
      </main>
    </div>
  )
}

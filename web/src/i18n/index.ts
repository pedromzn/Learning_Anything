/**
 * The interface language. The choice lives in this browser (`localStorage`) and is asked the first time the app opens
 * (`LanguagePicker`). Components read texts with `useT()`; code outside React (the focus engine) uses `t()`.
 *
 * Course content is NOT translated here: each course is written in its own language (`brief.language`).
 */

import { useEffect } from 'react'
import { create } from 'zustand'
import { z } from 'zod'
import { LANGUAGE_DATA, isLanguage, closestLanguage, type Language } from '@shared/languages'
import { portugueseErrorMap } from '@shared/zodPortuguese'
import { en, type Dictionary } from './en'
import { ptBR } from './pt-BR'

export const DICTIONARIES: Record<Language, Dictionary> = { en, 'pt-BR': ptBR }

const KEY = 'learning-anything:language'

function storedLanguage(): Language | null {
  try {
    const v = localStorage.getItem(KEY)
    return isLanguage(v) ? v : null
  } catch {
    return null
  }
}

function apply(language: Language) {
  document.documentElement.lang = LANGUAGE_DATA[language].bcp47
  // the zod messages the app shows (form validation) follow the interface
  if (language === 'pt-BR') z.config({ ...z.locales.pt(), customError: portugueseErrorMap })
  else z.config({ ...z.locales.en(), customError: undefined })
}

interface LanguageState {
  language: Language
  /** false until the person picks a language (the first time the app opens) */
  picked: boolean
  choose: (language: Language) => void
}

const stored = storedLanguage()

export const useLanguage = create<LanguageState>((set) => ({
  language: stored ?? closestLanguage(typeof navigator === 'undefined' ? null : navigator.language),
  picked: stored !== null,
  choose: (language) => {
    try {
      localStorage.setItem(KEY, language)
    } catch {
      /* private window: the choice lasts for this visit */
    }
    apply(language)
    set({ language, picked: true })
  },
}))

apply(useLanguage.getState().language)

/** The texts in the person's language. */
export const useT = (): Dictionary => DICTIONARIES[useLanguage((s) => s.language)]

/** The texts outside React (they follow the current choice). */
export const t = (): Dictionary => DICTIONARIES[useLanguage.getState().language]

/** The texts in a given language (Mandy speaks the course language, not the interface one). */
export const textsIn = (language: Language): Dictionary => DICTIONARIES[language]

const bcp47 = () => LANGUAGE_DATA[useLanguage.getState().language].bcp47

/** Numbers, dates and weekdays in the interface language. */
export const format = {
  number: (n: number) => n.toLocaleString(bcp47()),
  date: (iso: string) => new Date(iso).toLocaleDateString(bcp47(), { day: 'numeric', month: 'long', year: 'numeric' }),
  shortDate: (iso: string) => new Date(iso).toLocaleDateString(bcp47()),
  dateTime: (iso: string) =>
    new Date(iso).toLocaleString(bcp47(), { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
  weekday: (day: string, style: 'narrow' | 'short') =>
    new Date(`${day}T12:00:00`).toLocaleDateString(bcp47(), { weekday: style }).replace('.', ''),
}

/** The message for an API error: the translated text when the code is known, otherwise the server message. */
export function errorMessage(e: unknown): string {
  const d = t()
  if (e && typeof e === 'object' && 'code' in e) {
    const code = (e as { code?: string }).code
    if (code === 'no_server') return d.general.noServer
    // "not found" is generic: the screen-specific message (the server's) says more
    if (code && code !== 'not_found' && code !== 'invalid' && d.errors[code]) return d.errors[code]
  }
  return e instanceof Error ? e.message : d.general.somethingWentWrong
}

/** Re-renders when the language changes (for screens that format outside `useT`). */
export function useCurrentLanguage(): Language {
  const language = useLanguage((s) => s.language)
  useEffect(() => apply(language), [language])
  return language
}

/**
 * The languages the app speaks. English is the base: every text in the interface exists in English first, and each
 * other language is a dictionary with the same keys (`web/src/i18n/`), checked by the type system.
 *
 * Two different things carry a language:
 * - the **interface** (buttons, menus, messages): the person's choice, asked the first time the app opens;
 * - each **course** (`brief.language`): the language the AI writes the lessons in, and the one the narration, the
 *   subtitles and Ana (the Feynman lesson) speak. A Portuguese speaker can study a course written in English, and the
 *   other way around.
 *
 * To add a language: add it here (with its Kokoro voices and Whisper code), write `web/src/i18n/<code>.ts` and the
 * Ana prompts in `server/feynman/context.ts`.
 */

import { z } from 'zod'

export const LANGUAGES = ['en', 'pt-BR'] as const
export type Language = (typeof LANGUAGES)[number]
export const DEFAULT_LANGUAGE: Language = 'en'
export const languageSchema = z.enum(LANGUAGES)

export interface LanguageData {
  /** the name in the language itself, for the picker */
  name: string
  /** BCP 47 tag for `Intl` and `<html lang>` */
  bcp47: string
  /** the Kokoro language code */
  kokoro: string
  /** the Kokoro voices for this language; the first is the default narrator */
  voices: readonly string[]
  /** the voice Ana speaks with in the Feynman lesson */
  anaVoice: string
  /** the Whisper language code */
  whisper: string
}

export const LANGUAGE_DATA: Record<Language, LanguageData> = {
  en: {
    name: 'English',
    bcp47: 'en-US',
    kokoro: 'en-us',
    voices: ['af_heart', 'af_bella', 'am_michael', 'am_fenrir'],
    anaVoice: 'af_heart',
    whisper: 'en',
  },
  'pt-BR': {
    name: 'Português (Brasil)',
    bcp47: 'pt-BR',
    kokoro: 'pt-br',
    voices: ['pf_dora', 'pm_alex', 'pm_santa'],
    anaVoice: 'pf_dora',
    whisper: 'pt',
  },
}

/** Every voice the app knows, in any language. */
export const ALL_VOICES: readonly string[] = LANGUAGES.flatMap((i) => LANGUAGE_DATA[i].voices)

/** The language a voice belongs to (Kokoro voices start with the language letter: `a`/`b` English, `p` Portuguese). */
export function voiceLanguage(voice: string): Language | null {
  return LANGUAGES.find((i) => LANGUAGE_DATA[i].voices.includes(voice)) ?? null
}

/** The closest supported language for a browser tag like `pt`, `pt-PT` or `en-GB`. */
export function closestLanguage(tag: string | null | undefined): Language {
  const t = (tag ?? '').toLowerCase()
  if (t.startsWith('pt')) return 'pt-BR'
  return DEFAULT_LANGUAGE
}

export const isLanguage = (value: unknown): value is Language =>
  typeof value === 'string' && (LANGUAGES as readonly string[]).includes(value)

/**
 * The `question` scene: "Pause to answer", the large prompt and, for multiple choice, the numbered choices. The video
 * only SHOWS the question; the student answers outside the video. That is why this component never reads `correct`,
 * `solution`, `hints`, `explanation`, `answer` or `accepted` — the video can be downloaded and watched anywhere, and the
 * answer cannot be in it.
 */

import { useCurrentFrame } from 'remotion'
import type { Scene } from '../../../shared/video.ts'
import type { Language } from '../../../shared/languages.ts'
import { entranceStyle, input, elementStart } from '../animation'
import { COLOR, FONT } from '../theme'
import { Board } from './Board'

type Data = Extract<Scene, { type: 'question' }>

/** The scene's fixed labels, in the course language. */
const TEXTS: Record<
  Language,
  {
    pause: string
    trueFalse: [string, string]
    number: (unit?: string) => string
    ordering: string
    short: string
  }
> = {
  en: {
    pause: 'Pause to answer',
    trueFalse: ['True', 'False'],
    number: (u) => (u ? `Answer with a number, in ${u}.` : 'Answer with a number.'),
    ordering: 'Put the steps in the right order.',
    short: 'Answer with a word or a short phrase.',
  },
  'pt-BR': {
    pause: 'Pausa para você responder',
    trueFalse: ['Verdadeiro', 'Falso'],
    number: (u) => (u ? `Responda com um número, em ${u}.` : 'Responda com um número.'),
    ordering: 'Coloque os passos na ordem certa.',
    short: 'Responda com uma palavra ou expressão curta.',
  },
}

/** The options shown on screen, text only; true/false gets the two fixed options because the item does not carry them. */
function visibleOptions(item: Data['item'], language: Language): string[] {
  if (item.type === 'multiple_choice') return item.choices.map((a) => a.text)
  if (item.type === 'true_false') return TEXTS[language].trueFalse
  return []
}

/** A short sentence for the types without choices, so the student knows what is expected. */
function instruction(item: Data['item'], language: Language): string {
  if (item.type === 'numeric') return TEXTS[language].number(item.unit ?? undefined)
  if (item.type === 'ordering') return TEXTS[language].ordering
  if (item.type === 'short_answer') return TEXTS[language].short
  return ''
}

export function QuestionScene({ scene, duration, language }: { scene: Data; duration: number; language: Language }) {
  const frame = useCurrentFrame()
  const options = visibleOptions(scene.item, language)
  const score = instruction(scene.item, language)
  const total = 2 + options.length + (score ? 1 : 0)
  const promptSize = scene.item.prompt.length > 300 ? 36 : scene.item.prompt.length > 140 ? 44 : 54
  const optionsSize = options.some((o) => o.length > 80) ? 36 : 42

  return (
    <Board duration={duration}>
      <div
        style={{
          ...entranceStyle(input(frame, elementStart(0, total, duration), 20)),
          fontSize: 38,
          color: COLOR.info,
          marginBottom: 36,
        }}
      >
        {TEXTS[language].pause}
      </div>
      <div
        style={{
          ...entranceStyle(input(frame, elementStart(1, total, duration), 24)),
          fontFamily: FONT.title,
          fontWeight: 600,
          fontSize: promptSize,
          lineHeight: 1.18,
          letterSpacing: '-0.01em',
          marginBottom: 56,
          maxWidth: 1620,
        }}
      >
        {scene.item.prompt}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
        {options.map((text, i) => (
          <div
            key={i}
            style={{
              ...entranceStyle(input(frame, elementStart(i + 2, total, duration), 20)),
              display: 'flex',
              alignItems: 'center',
              gap: 32,
              fontSize: optionsSize,
              lineHeight: 1.25,
            }}
          >
            <span
              style={{
                flex: 'none',
                width: 68,
                height: 68,
                borderRadius: '50%',
                border: `3px solid ${COLOR.info}`,
                color: COLOR.info,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontFamily: FONT.text,
                fontWeight: 600,
                fontSize: 40,
              }}
            >
              {i + 1}
            </span>
            <span>{text}</span>
          </div>
        ))}
        {score ? (
          <div
            style={{
              ...entranceStyle(input(frame, elementStart(total - 1, total, duration), 20)),
              fontSize: 44,
              color: COLOR.secondary,
            }}
          >
            {score}
          </div>
        ) : null}
      </div>
    </Board>
  )
}

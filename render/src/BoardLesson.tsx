/**
 * The `BoardLesson` composition: each script scene becomes a `<Sequence>` with its own `<Audio>`, one after the
 * other. Each scene lasts as long as its AUDIO (`durationMs`), not the estimate from the text: the image follows the
 * voice.
 *
 * Audio: a file name (`scene1.mp3`) is served by `staticFile`, which reads from the bundle's public folder — the CLI
 * points `publicDir` at the job folder. A URL (`http(s)://`, `file://`) goes straight into `<Audio src>`, for whoever
 * renders another way (Studio, tests).
 */

import { useEffect, useState } from 'react'
import { Audio, Sequence, continueRender, delayRender, staticFile } from 'remotion'
import '@fontsource-variable/fraunces'
import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/geist-mono'
import type { Scene, Script } from '../../shared/video.ts'
import type { Language } from '../../shared/languages.ts'
import { CodeScene } from './scenes/CodeScene'
import { DiagramScene } from './scenes/DiagramScene'
import { EquationScene } from './scenes/EquationScene'
import { ChartScene } from './scenes/ChartScene'
import { QuestionScene } from './scenes/QuestionScene'
import { TitleScene } from './scenes/TitleScene'
import { BulletsScene } from './scenes/BulletsScene'
import { FPS } from './theme.ts'

// `type`, not `interface`: Remotion requires the props to be assignable to Record<string, unknown>
export type RenderedScene = {
  durationMs: number
  audio: string | null
}

export type LessonProps = {
  script: Script
  scenes: RenderedScene[]
  /** the course language: the scenes' fixed labels (the question pause, True/False) */
  language: Language
}

export const sceneFrames = (durationMs: number): number => Math.max(1, Math.round((durationMs / 1000) * FPS))

const audioSrc = (audio: string): string => (/^(https?|file):\/\//.test(audio) ? audio : staticFile(audio))

/** The fonts come from the package (nothing from the internet), but the browser loads them on demand: the frame waits. */
function useFontsReady() {
  const [delay] = useState(() => delayRender('notebook fonts'))
  useEffect(() => {
    Promise.all([
      document.fonts.load('600 80px "Fraunces Variable"'),
      document.fonts.load('400 40px "Instrument Sans Variable"'),
      document.fonts.load('400 40px "Geist Mono Variable"'),
    ])
      .catch(() => undefined)
      .finally(() => continueRender(delay))
  }, [delay])
}

function drawScene(scene: Scene, duration: number, language: Language) {
  switch (scene.type) {
    case 'title':
      return <TitleScene scene={scene} duration={duration} />
    case 'bullets':
      return <BulletsScene scene={scene} duration={duration} />
    case 'equation':
      return <EquationScene scene={scene} duration={duration} />
    case 'code':
      return <CodeScene scene={scene} duration={duration} />
    case 'diagram':
      return <DiagramScene scene={scene} duration={duration} />
    case 'chart':
      return <ChartScene scene={scene} duration={duration} />
    case 'question':
      return <QuestionScene scene={scene} duration={duration} language={language} />
  }
}

export function BoardLesson({ script, scenes, language }: LessonProps) {
  useFontsReady()
  let start = 0
  return (
    <>
      {script.scenes.map((scene, i) => {
        const data = scenes[i]
        const duration = sceneFrames(data?.durationMs ?? 0)
        const from = start
        start += duration
        return (
          <Sequence key={i} from={from} durationInFrames={duration}>
            {drawScene(scene, duration, language)}
            {data?.audio ? <Audio src={audioSrc(data.audio)} /> : null}
          </Sequence>
        )
      })}
    </>
  )
}

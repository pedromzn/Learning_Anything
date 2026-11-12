/**
 * The Remotion root: registers the `BoardLesson` composition (1920x1080, 30 fps) and computes its duration from the
 * props by adding up the scenes. The default props (the example script, no audio) are only for Remotion Studio.
 */

import { Composition } from 'remotion'
import { BoardLesson, sceneFrames, type LessonProps } from './BoardLesson.tsx'
import { HEIGHT, FPS, WIDTH } from './theme.ts'
import example from '../example/job.json'

const exampleProps: LessonProps = {
  script: example.script as LessonProps['script'],
  scenes: example.scenes.map((c) => ({ durationMs: c.durationMs, audio: null })),
  language: 'pt-BR',
}

export function Root() {
  return (
    <Composition
      id="BoardLesson"
      component={BoardLesson}
      width={WIDTH}
      height={HEIGHT}
      fps={FPS}
      durationInFrames={FPS * 5}
      defaultProps={exampleProps}
      calculateMetadata={({ props }) => ({
        durationInFrames: Math.max(
          1,
          props.scenes.reduce((sum, c) => sum + sceneFrames(c.durationMs), 0),
        ),
      })}
    />
  )
}

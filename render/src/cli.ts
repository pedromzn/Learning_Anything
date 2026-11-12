/**
 * The command-line renderer: `npx tsx src/cli.ts <jobFolder>`.
 *
 * Reads `<folder>/job.json` (`{ script, scenes: [{ durationMs, audio }], language }`, with `audio` = the name of an
 * .mp3 inside the folder), validates the script with the SAME schema as the app, bundles the composition (the job
 * folder becomes the `publicDir`, where the audio comes from) and writes `video.mp4` and `poster.jpg` next to it. The
 * last output line is always JSON: `{"ok":true,"video":"...","durationMs":N}` or `{"ok":false,"error":"..."}` with
 * exit code 1 — that is what the calling process reads; the rest (progress) goes to stderr.
 */

import { bundle, type WebpackOverrideFn } from '@remotion/bundler'
import { renderMedia, renderStill, selectComposition } from '@remotion/renderer'
import { readFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { scriptSchema } from '../../shared/video.ts'
import { DEFAULT_LANGUAGE, languageSchema } from '../../shared/languages.ts'
import { FPS } from './theme.ts'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const RENDER_ROOT = path.resolve(HERE, '..')

const jobSchema = z.object({
  script: scriptSchema,
  scenes: z.array(z.object({ durationMs: z.number().positive(), audio: z.string().nullable() })).min(1),
  language: languageSchema.default(DEFAULT_LANGUAGE),
})

const warning = (text: string) => process.stderr.write(`${text}\n`)

/**
 * `VIDEO_QUALITY`: `720p` (default) or `1080p`. The composition is drawn at 1920x1080 and 720p is the same image at
 * 2/3 scale: it renders in half the time (measured: ~56 vs ~29 frames per second) and stays sharp in the player.
 */
export function videoScale(value: string | undefined = process.env.VIDEO_QUALITY): number {
  return (value ?? '').trim().toLowerCase() === '1080p' ? 1 : 2 / 3
}

async function readJob(folder: string) {
  const raw = JSON.parse(await readFile(path.join(folder, 'job.json'), 'utf8'))
  const job = jobSchema.parse(raw)
  if (job.scenes.length !== job.script.scenes.length) {
    throw new Error(`The job has ${job.scenes.length} audio scene(s) and the script has ${job.script.scenes.length}.`)
  }
  // the audio name is just the file, inside the folder: no climbing out of the directory through the JSON
  for (const c of job.scenes) {
    if (c.audio !== null && path.basename(c.audio) !== c.audio) throw new Error(`Audio outside the folder: ${c.audio}`)
  }
  return job
}

/**
 * Remotion's webpack needs two tweaks to read the contract in `shared/` (which lives OUTSIDE this folder): resolve
 * imports like `./course.js` to the real `.ts`, and find `zod` in the root `node_modules`.
 */
const adjustWebpack: WebpackOverrideFn = (config) => {
  return {
    ...config,
    resolve: {
      ...config.resolve,
      extensionAlias: {
        ...(config.resolve as { extensionAlias?: object } | undefined)?.extensionAlias,
        '.js': ['.ts', '.tsx', '.js'],
      },
      modules: [...(config.resolve?.modules ?? ['node_modules']), path.resolve(RENDER_ROOT, '../node_modules')],
    },
  }
}

async function renderVideo(folder: string) {
  const job = await readJob(folder)
  const durationMs = job.scenes.reduce((sum, c) => sum + c.durationMs, 0)
  const props = { script: job.script, scenes: job.scenes, language: job.language }

  warning('Bundling...')
  const address = await bundle({
    entryPoint: path.join(HERE, 'index.ts'),
    publicDir: folder,
    webpackOverride: adjustWebpack,
  })

  const composition = await selectComposition({ serveUrl: address, id: 'BoardLesson', inputProps: props })

  const video = path.join(folder, 'video.mp4')
  const scale = videoScale()
  let lastStep = -1
  await renderMedia({
    composition: composition,
    serveUrl: address,
    codec: 'h264',
    outputLocation: video,
    inputProps: props,
    scale,
    // measured: above 8 tabs the render does not speed up (and with 16 it gets slower)
    concurrency: Math.max(2, Math.min(8, Math.floor(os.availableParallelism() / 2))),
    onProgress: ({ progress }) => {
      const step = Math.floor(progress * 10)
      if (step !== lastStep) {
        lastStep = step
        warning(`Rendering ${step * 10}%`)
      }
    },
  })

  // the poster is the middle of the first scene: the title is already fully on screen
  const firstMiddle = Math.round(((job.scenes[0].durationMs / 1000) * FPS) / 2)
  await renderStill({
    composition: composition,
    serveUrl: address,
    frame: Math.min(firstMiddle, composition.durationInFrames - 1),
    output: path.join(folder, 'poster.jpg'),
    imageFormat: 'jpeg',
    scale,
    inputProps: props,
  })

  return { video, durationMs }
}

async function main() {
  const folder = process.argv[2]
  if (!folder) throw new Error('Usage: npx tsx src/cli.ts <jobFolder>')
  const { video, durationMs } = await renderVideo(path.resolve(folder))
  process.stdout.write(`${JSON.stringify({ ok: true, video, durationMs })}\n`)
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  process.stdout.write(`${JSON.stringify({ ok: false, error: message })}\n`)
  process.exit(1)
})

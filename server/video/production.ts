/**
 * Producing a lesson video: script, voice for each scene, render, HLS and subtitles, all in files.
 *
 * The render runs OUTSIDE this process (`render/`, Remotion), in a child process: it opens a Chrome and burns CPU and
 * memory in bursts, and the server must not freeze along with it. The interface is an isolated job: a folder with
 * `job.json` and the audio files, and the video comes back in the same folder.
 *
 * The question pauses come from the REAL audio durations: the player pauses right before the question scene ends and,
 * if the student gets it wrong, goes back to the start of the previous scene, the explanation they need to review.
 *
 * Output: `courses/<slug>/module-N/lesson-M.video/` (index.m3u8, .ts segments, subtitles.vtt, poster.jpg) and
 * `lesson-M.video.json` (the `ReadyVideo`).
 */

import { createHash } from 'node:crypto'
import { spawn, execFile } from 'node:child_process'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { config } from '../config.js'
import { narrate } from './voice.js'
import type { Language } from '../../shared/languages.js'
import type { Script, ReadyVideo } from '../../shared/video.js'

const execFileAsync = promisify(execFile)

/* a breath between scenes, so the cut does not chop the speech in the middle of the last word */
export const BREATH_MS = 600
/*
 * the pause comes at the END of the question scene, half a second before the cut: the choices come in one at a time
 * while the voice reads the prompt; pausing right at the start would stop the video with only one choice on screen
 */
export const BEFORE_SCENE_END_MS = 500
export const MIN_PAUSE_MS = 1500
/* rendering a 7-minute video takes a few minutes; beyond this, something is stuck */
const RENDER_TIME_MS = 30 * 60_000

export interface VideoRequest {
  slug: string
  module: number
  lesson: number
  script: Script
  /** the course language: picks the voice and the narration pronunciation */
  language: Language
}

export interface ProductionOptions {
  onProgress?: (message: string) => void
}

export function scriptHash(script: Script): string {
  return createHash('sha256').update(JSON.stringify(script)).digest('hex').slice(0, 16)
}

export const lessonFolder = (slug: string, module: number) => path.join(config.coursesFolder, slug, `module-${module}`)

function vttTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  const millis = Math.floor(ms % 1000)
  const second = (n: number) => String(n).padStart(2, '0')
  return `${second(h)}:${second(m)}:${second(s)}.${String(millis).padStart(3, '0')}`
}

/** The subtitles: each scene split into chunks of up to ~14 words, with the time shared out by the length of each. */
export function subtitlesFor(script: Script, starts: number[], durations: number[]): string {
  const lines = ['WEBVTT', '']
  script.scenes.forEach((scene, i) => {
    const words = scene.narration.trim().split(/\s+/).filter(Boolean)
    const blocks: string[][] = []
    for (let j = 0; j < words.length; j += 14) blocks.push(words.slice(j, j + 14))
    let cursor = starts[i]
    for (const block of blocks) {
      const slice = (block.length / Math.max(1, words.length)) * durations[i]
      lines.push(`${vttTime(cursor)} --> ${vttTime(cursor + slice)}`, block.join(' '), '')
      cursor += slice
    }
  })
  return lines.join('\n')
}

/** Where the player pauses on each question and where it goes back to if the student gets it wrong. */
export function pausesOf(script: Script, starts: number[], durations: number[]): ReadyVideo['pauses'] {
  return script.scenes.flatMap((scene, i) =>
    scene.type === 'question'
      ? [
          {
            itemId: scene.item.id,
            atMs: starts[i] + Math.max(MIN_PAUSE_MS, durations[i] - BEFORE_SCENE_END_MS),
            backToMs: starts[Math.max(0, i - 1)],
          },
        ]
      : [],
  )
}

/** Runs the render as a child process; the last stdout line is the result JSON, progress comes on stderr. */
function renderVideo(folder: string, onProgress?: (m: string) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['tsx', 'render/src/cli.ts', folder], {
      cwd: config.root,
      shell: process.platform === 'win32',
    })
    let output = ''
    let childError = ''
    const limit = setTimeout(() => {
      child.kill()
      reject(new Error('The render took more than 30 minutes and was stopped.'))
    }, RENDER_TIME_MS)
    child.stdout.on('data', (d: Buffer) => (output += d.toString()))
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString()
      childError = (childError + text).slice(-4000)
      for (const line of text.split('\n').filter((l) => /Bundling|Rendering|Empacotando|Renderizando/.test(l)))
        onProgress?.(line.trim())
    })
    child.on('error', (e) => {
      clearTimeout(limit)
      reject(new Error(`Could not start the render: ${e.message}`))
    })
    child.on('close', () => {
      clearTimeout(limit)
      const last = output.trim().split('\n').pop() ?? ''
      try {
        const result = JSON.parse(last) as { ok: boolean; error?: string }
        if (result.ok) resolve()
        else reject(new Error(`The render failed: ${result.error ?? 'no detail'}`))
      } catch {
        reject(new Error(`The render finished without a readable result. ${childError.trim()}`.trim()))
      }
    })
  })
}

export async function produceVideo(request: VideoRequest, options: ProductionOptions = {}): Promise<ReadyVideo> {
  const { slug, module, lesson, script } = request
  const notify = options.onProgress ?? (() => undefined)

  const job = await fs.mkdtemp(path.join(os.tmpdir(), `lesson-${slug}-${module}-${lesson}-`))
  try {
    let simulatedVoice = false
    let engine = 'silence'
    const scenes: Array<{ durationMs: number; audio: string }> = []
    for (const [i, scene] of script.scenes.entries()) {
      notify(`Narrating scene ${i + 1} of ${script.scenes.length}`)
      const segment = await narrate(scene.narration, { language: request.language })
      simulatedVoice ||= segment.simulated
      engine = segment.engine
      const name = `scene-${String(i + 1).padStart(2, '0')}.mp3`
      await fs.copyFile(segment.file, path.join(job, name))
      scenes.push({ durationMs: segment.durationMs + BREATH_MS, audio: name })
    }

    await fs.writeFile(path.join(job, 'job.json'), JSON.stringify({ script, scenes, language: request.language }))
    notify('Rendering the video (the first render downloads the Remotion Chrome)')
    await renderVideo(job, notify)

    /* HLS: the video in 6 s segments, so it starts playing quickly and the browser only downloads what it will show */
    notify('Converting to HLS')
    const hls = path.join(job, 'hls')
    await fs.mkdir(hls)
    await execFileAsync('ffmpeg', [
      '-y',
      '-v',
      'error',
      '-i',
      path.join(job, 'video.mp4'),
      '-c',
      'copy',
      '-hls_time',
      '6',
      '-hls_playlist_type',
      'vod',
      '-hls_segment_filename',
      path.join(hls, 'part-%03d.ts'),
      path.join(hls, 'index.m3u8'),
    ])

    const starts: number[] = []
    let cursor = 0
    for (const c of scenes) {
      starts.push(cursor)
      cursor += c.durationMs
    }
    const durations = scenes.map((c) => c.durationMs)
    await fs.writeFile(path.join(hls, 'subtitles.vtt'), subtitlesFor(script, starts, durations))
    await fs.copyFile(path.join(job, 'poster.jpg'), path.join(hls, 'poster.jpg')).catch(() => undefined)

    /* atomic swap: write alongside and rename, so the app never sees a half-written video */
    const moduleFolder = lessonFolder(slug, module)
    const destination = path.join(moduleFolder, `lesson-${lesson}.video`)
    const tempDir = `${destination}.tmp`
    await fs.rm(tempDir, { recursive: true, force: true })
    await fs.mkdir(moduleFolder, { recursive: true })
    await fs.cp(hls, tempDir, { recursive: true })
    await fs.rm(destination, { recursive: true, force: true })
    await fs.rename(tempDir, destination)

    const ready: ReadyVideo = {
      playlist: 'index.m3u8',
      subtitles: 'subtitles.vtt',
      durationMs: cursor,
      pauses: pausesOf(script, starts, durations),
      simulatedVoice,
      voiceEngine: engine,
      generatedAt: new Date().toISOString(),
      scriptHash: scriptHash(script),
    }
    const json = path.join(moduleFolder, `lesson-${lesson}.video.json`)
    await fs.writeFile(`${json}.tmp`, `${JSON.stringify(ready, null, 2)}\n`)
    await fs.rename(`${json}.tmp`, json)
    return ready
  } finally {
    await fs.rm(job, { recursive: true, force: true })
  }
}

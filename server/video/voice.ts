/**
 * The lesson voice, 100% local: each scene's text becomes an mp3 generated on the machine, with no API at all.
 *
 * Engines (variable `VOICE_ENGINE`, default `auto`):
 * - `kokoro`: Kokoro (Apache 2.0), a neural voice running on CPU in an isolated Python process
 *   (`voice/kokoro_worker.py`), installed by `npm run voice:install` into `data/voice/`;
 * - `silence`: no sound, with the duration the speech would have (the video comes out the same and the player warns).
 *
 * The voice follows the course language (`brief.language`): the language's first voice in `shared/languages.ts`
 * (`af_heart` in English, `pf_dora` in Portuguese), or the one in `VOICE` when it belongs to that language. The pace
 * comes from `VOICE_SPEED`. ffmpeg turns everything into 24 kHz mono mp3, ffprobe measures the duration and the result
 * is cached by the hash of engine, voice and text.
 */

import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import { existsSync, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { config } from '../config.js'
import { narrationSeconds } from '../../shared/video.js'
import { LANGUAGE_DATA, DEFAULT_LANGUAGE, ALL_VOICES, voiceLanguage, type Language } from '../../shared/languages.js'
import { PythonProcess } from './pythonProcess.js'

const execFileAsync = promisify(execFile)

/** where the installed engine lives: the Python environment and the model files (outside git) */
export const VOICE_FOLDER = path.join(config.dataFolder, 'voice')
export const CACHE_FOLDER = path.join(config.dataFolder, 'cache', 'audio')
export const ENGINE_SCRIPT = path.join(config.root, 'voice', 'kokoro_worker.py')

export const ENGINES = ['kokoro', 'silence'] as const
export type Engine = (typeof ENGINES)[number]
export type EngineRequest = Engine | 'auto'

/** every Kokoro voice the app knows, in all languages (`shared/languages.ts`) */
export const VOICES = ALL_VOICES as readonly [string, ...string[]]
export type Voice = string

/** The Kokoro v1.0 model files, with the sha256 checked on download. */
export const MODEL_FILES = [
  {
    name: 'kokoro-v1.0.onnx',
    url: 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx',
    sha256: '7d5df8ecf7d4b1878015a32686053fd0eebe2bc377234608764cc0ef3636a6c5',
  },
  {
    name: 'voices-v1.0.bin',
    url: 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin',
    sha256: 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d',
  },
] as const

export interface NarratedSegment {
  /** absolute path of the mp3 in the cache */
  file: string
  durationMs: number
  engine: Engine
  /** true when it is silence: there is no real voice */
  simulated: boolean
}

export interface ChosenEngine {
  engine: Engine
  voice: string
  simulated: boolean
  /** why this one: for the server to show in health and for the person to understand */
  detail: string
}

// ── engine choice (the pure parts come first) ────────────────────────────────

/** Reads `VOICE_ENGINE`; an unknown value becomes `auto`. */
export function requestedEngine(value: string | undefined = process.env.VOICE_ENGINE): EngineRequest {
  const v = (value ?? 'auto').trim().toLowerCase()
  return (ENGINES as readonly string[]).includes(v) ? (v as Engine) : 'auto'
}

/** A language's default voice: the first one in its list. */
export const defaultVoice = (language: Language = DEFAULT_LANGUAGE): Voice => LANGUAGE_DATA[language].voices[0]!

/** Reads `VOICE` for a language; a value not in the list or from another language becomes the language's default voice. */
export function requestedVoice(
  language: Language = DEFAULT_LANGUAGE,
  value: string | undefined = process.env.VOICE,
): Voice {
  const v = (value ?? '').trim().toLowerCase()
  return voiceLanguage(v) === language ? v : defaultVoice(language)
}

/** Reads `VOICE_SPEED` (0.5 to 2; default 1). */
export function requestedSpeed(value: string | undefined = process.env.VOICE_SPEED): number {
  const n = Number((value ?? '').trim().replace(',', '.'))
  return Number.isFinite(n) && n > 0 ? Math.min(2, Math.max(0.5, n)) : 1
}

export const voiceName = (engine: Engine, language?: Language): string =>
  engine === 'kokoro' ? requestedVoice(language) : ''

/** The estimated silence duration: speech takes a bit longer than the word count suggests, because of the pauses. */
export const silenceSeconds = (text: string): number => Math.max(1.5, narrationSeconds(text) * 1.08)

export const chunkHash = (engine: Engine, voice: string, text: string): string =>
  createHash('sha256').update(`${engine}|${voice}|${text}`).digest('hex')

/** The Python of the engine's isolated environment (on Windows the folder is `Scripts`). */
export const enginePython = (platform: NodeJS.Platform = process.platform): string =>
  platform === 'win32'
    ? path.join(VOICE_FOLDER, '.venv', 'Scripts', 'python.exe')
    : path.join(VOICE_FOLDER, '.venv', 'bin', 'python')

// ── availability ─────────────────────────────────────────────────────────────

async function commandExists(command: string, args: string[] = ['--version']): Promise<boolean> {
  try {
    await execFileAsync(command, args, { timeout: 10_000 })
    return true
  } catch (error) {
    // the command exists but exited with an error: still "exists"; only ENOENT means it is not installed
    return (error as NodeJS.ErrnoException).code !== 'ENOENT'
  }
}

export async function ffmpegInstalled(): Promise<boolean> {
  return (await commandExists('ffmpeg', ['-version'])) && (await commandExists('ffprobe', ['-version']))
}

export const FFMPEG_HELP =
  'ffmpeg is not installed (or not on the PATH). Install it: macOS `brew install ffmpeg`; ' +
  'Ubuntu/Debian `sudo apt install ffmpeg`; Windows `winget install Gyan.FFmpeg`. Then open a new terminal.'

async function requireFfmpeg() {
  if (!(await ffmpegInstalled())) throw new Error(FFMPEG_HELP)
}

/** Kokoro is installed: the environment Python and both model files exist. */
export function kokoroInstalled(): boolean {
  return (
    existsSync(enginePython()) &&
    existsSync(ENGINE_SCRIPT) &&
    MODEL_FILES.every((a) => existsSync(path.join(VOICE_FOLDER, a.name)))
  )
}

const KOKORO_HELP = 'Run `npm run voice:install` (downloads the Kokoro voice engine once, about 400 MB).'

/** Which engine speaks now. A requested engine that is unavailable gives a clear error (no hidden fallback to silence). */
export async function chosenEngine(language?: Language): Promise<ChosenEngine> {
  const request = requestedEngine()
  const installed = kokoroInstalled()
  if (request === 'kokoro' && !installed) {
    throw new Error(`The "kokoro" voice engine (VOICE_ENGINE) is not installed. ${KOKORO_HELP}`)
  }
  const engine: Engine = request === 'silence' || !installed ? 'silence' : 'kokoro'
  const detail =
    request !== 'auto'
      ? `VOICE_ENGINE=${request}`
      : engine === 'kokoro'
        ? 'auto: Kokoro installed'
        : `auto: no voice engine installed, videos come out silent. ${KOKORO_HELP}`
  return { engine, voice: voiceName(engine, language), simulated: engine === 'silence', detail }
}

// ── the Kokoro process ───────────────────────────────────────────────────────

const kokoro = new PythonProcess('voice engine', () => ({
  python: enginePython(),
  args: [
    '-I',
    ENGINE_SCRIPT,
    path.join(VOICE_FOLDER, MODEL_FILES[0].name),
    path.join(VOICE_FOLDER, MODEL_FILES[1].name),
  ],
}))

// ── generation ───────────────────────────────────────────────────────────────

export async function fileDuration(file: string): Promise<number> {
  const { stdout } = await execFileAsync('ffprobe', [
    '-v',
    'error',
    '-show_entries',
    'format=duration',
    '-of',
    'csv=p=0',
    file,
  ])
  return Math.round(Number(stdout.trim()) * 1000)
}

async function toMp3(input: string, output: string) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-i',
    input,
    '-ac',
    '1',
    '-ar',
    '24000',
    '-codec:a',
    'libmp3lame',
    '-q:a',
    '4',
    output,
  ])
}

async function generateSilence(text: string, output: string) {
  await execFileAsync('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=24000:cl=mono',
    '-t',
    silenceSeconds(text).toFixed(2),
    '-codec:a',
    'libmp3lame',
    '-q:a',
    '9',
    output,
  ])
}

/**
 * Narrates a chunk with the chosen engine; the same text with the same engine and voice comes from the cache.
 * `options.language` is the course language (picks the voice and the pronunciation); `options.voice` swaps the voice for
 * this line only (Mandy in the Feynman lesson has her own).
 */
export async function narrate(
  text: string,
  options: { voice?: Voice; language?: Language } = {},
): Promise<NarratedSegment> {
  const clean = text.trim()
  if (!clean) throw new Error('There is no text to narrate.')
  await requireFfmpeg()
  const picked = await chosenEngine(options.language)
  const engine = picked.engine
  const voice = engine === 'kokoro' && options.voice ? options.voice : picked.voice
  const speed = requestedSpeed()
  // the speed goes into the hash only when it is not the default, so the old cache stays valid
  const id = chunkHash(engine, speed === 1 ? voice : `${voice}@${speed}`, clean)
  const file = path.join(CACHE_FOLDER, `${id}.mp3`)
  const meta = path.join(CACHE_FOLDER, `${id}.json`)

  try {
    const { durationMs } = JSON.parse(await fs.readFile(meta, 'utf8')) as { durationMs: number }
    await fs.access(file)
    return { file, durationMs, engine, simulated: engine === 'silence' }
  } catch {
    // not in the cache: generate it
  }

  await fs.mkdir(CACHE_FOLDER, { recursive: true })
  const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'voice-'))
  try {
    const tempFile = path.join(folder, 'chunk.mp3')
    if (engine === 'silence') {
      await generateSilence(clean, tempFile)
    } else {
      const wav = path.join(folder, 'chunk.wav')
      const lang = LANGUAGE_DATA[voiceLanguage(voice) ?? DEFAULT_LANGUAGE].kokoro
      await kokoro.send({ text: clean, voice, lang, speed, output: wav })
      await toMp3(wav, tempFile)
    }
    const durationMs = await fileDuration(tempFile)
    await fs.copyFile(tempFile, `${file}.tmp`)
    await fs.rename(`${file}.tmp`, file)
    await fs.writeFile(meta, JSON.stringify({ durationMs, engine, voice, speed }), 'utf8')
    return { file, durationMs, engine, simulated: engine === 'silence' }
  } finally {
    await fs.rm(folder, { recursive: true, force: true })
  }
}

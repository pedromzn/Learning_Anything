/**
 * The focus mode detection models (MediaPipe), downloaded once into `data/focus/` and checked by sha256.
 * The download only happens when the person asks: through the app button (`POST /api/focus/models`) or with
 * `npm run focus:install`. The files are served to the browser by the local server itself.
 */

import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import type { ModelsState } from '../../shared/focus.js'
import { config } from '../config.js'

export const MODELS_FOLDER = path.join(config.dataFolder, 'focus')

/** The MediaPipe WebAssembly folder, which ships in the npm package. */
export const WASM_FOLDER = path.join(config.root, 'node_modules', '@mediapipe', 'tasks-vision', 'wasm')

export const MODELS = [
  {
    name: 'face_landmarker.task',
    url: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
    sha256: '64184e229b263107bc2b804c6625db1341ff2bb731874b0bcc2fe6544e0bc9ff',
    bytes: 3_758_596,
  },
  {
    name: 'efficientdet_lite0.tflite',
    url: 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite',
    sha256: '0720bf247bd76e6594ea28fa9c6f7c5242be774818997dbbeffc4da460c723bb',
    bytes: 4_602_795,
  },
] as const

export const MODEL_NAMES: ReadonlySet<string> = new Set(MODELS.map((m) => m.name))

export function modelsState(): ModelsState {
  const files = MODELS.map((m) => ({ name: m.name, present: existsSync(path.join(MODELS_FOLDER, m.name)) }))
  const bytes = MODELS.reduce((sum, m) => sum + m.bytes, 0)
  return {
    installed: files.every((a) => a.present),
    megabytes: Math.round((bytes / 1_000_000) * 10) / 10,
    files,
  }
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

let installing: Promise<ModelsState> | null = null

/** Downloads what is missing. Concurrent calls wait for the same download. */
export function installModels(warning: (text: string) => void = () => {}): Promise<ModelsState> {
  installing ??= (async () => {
    await mkdir(MODELS_FOLDER, { recursive: true })
    for (const { name, url, sha256: expected } of MODELS) {
      const destination = path.join(MODELS_FOLDER, name)
      if (existsSync(destination)) continue
      warning(`Downloading ${name}...`)
      const answer = await fetch(url, { redirect: 'follow' })
      if (!answer.ok || !answer.body) throw new Error(`The download of ${name} failed (HTTP ${answer.status}).`)
      const partial = `${destination}.partial`
      await pipeline(Readable.fromWeb(answer.body as never), createWriteStream(partial))
      if ((await sha256(partial)) !== expected) {
        await rm(partial, { force: true })
        throw new Error(`The file ${name} did not match the expected sha256. Try again.`)
      }
      await rename(partial, destination)
    }
    return modelsState()
  })().finally(() => {
    installing = null
  })
  return installing
}

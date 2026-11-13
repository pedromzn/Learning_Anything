/**
 * Sets up the Feynman block (teach Mandy) on this machine.
 *   npm run feynman:install [-- --model <name>] [-- --no-model]
 *
 * 1. the Kokoro voice (if missing), because Mandy speaks;
 * 2. local Whisper (faster-whisper + model, ~460 MB at size `small`), because Mandy listens;
 * 3. the brain: if Ollama is running, downloads a model (qwen3:8b on an Apple Silicon Mac or a machine with 24 GB+,
 *    qwen3:4b on the others); if not, explains how to install it. Without Ollama, Mandy works in script mode.
 */

import { existsSync } from 'node:fs'
import os from 'node:os'
import { ollamaState, forgetOllamaState, ollamaUrl } from '../server/feynman/brain.js'
import {
  WHISPER_FOLDER,
  LISTENER_REQUIREMENTS,
  listenerInstalled,
  whisperModelFolder,
  whisperSize,
} from '../server/feynman/listener.js'
import { FFMPEG_HELP, ffmpegInstalled, kokoroInstalled, enginePython } from '../server/video/voice.js'
import { install as installVoice, installRequirements, run } from './voice.js'

const OLLAMA_HELP = [
  'Ollama is not running. Without it Mandy works in script mode (checks keywords and asks ready-made questions).',
  'For a real conversation, install Ollama (https://ollama.com/download):',
  '  macOS:   download the app from https://ollama.com/download and open it (on an Intel Mac, brew builds from scratch and takes very long)',
  '  Linux:   see https://ollama.com/download/linux',
  '  Windows: winget install Ollama.Ollama',
  'Then run "npm run feynman:install" again to download the model.',
].join('\n')

/** The model to download: the 8B where it runs well (Apple Silicon or lots of memory), the 4B elsewhere. */
export function suggestedModel(
  platform = process.platform,
  architecture = process.arch,
  memory = os.totalmem(),
): string {
  const gb = memory / 1024 ** 3
  return (platform === 'darwin' && architecture === 'arm64') || gb >= 24 ? 'qwen3:8b' : 'qwen3:4b'
}

async function downloadOllamaModel(model: string) {
  console.log(`Downloading the model ${model} through Ollama (a few GB, only once)...`)
  const r = await fetch(`${ollamaUrl()}/api/pull`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model, stream: true }),
  })
  if (!r.ok || !r.body) throw new Error(`Ollama could not download ${model} (HTTP ${r.status}).`)
  const reader = r.body.pipeThrough(new TextDecoderStream()).getReader()
  let rest = ''
  let last = -1
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    rest += value
    const lines = rest.split('\n')
    rest = lines.pop() ?? ''
    for (const line of lines) {
      if (!line.trim()) continue
      const m = JSON.parse(line) as { status?: string; completed?: number; total?: number; error?: string }
      if (m.error) throw new Error(m.error)
      if (m.total && m.completed !== undefined) {
        const pct = Math.floor((100 * m.completed) / m.total)
        if (pct >= last + 10) {
          last = pct
          console.log(`  ${pct}%`)
        }
      } else if (m.status) console.log(`  ${m.status}`)
    }
  }
}

export async function installFeynman(argv: string[] = []): Promise<number> {
  const noModel = argv.includes('--no-model')
  const i = argv.indexOf('--model')
  const requestedModel = i >= 0 ? argv[i + 1] : undefined

  if (!(await ffmpegInstalled())) {
    console.log(`Warning: ffmpeg is not on the PATH. Without it Mandy cannot hear your speech.\n${FFMPEG_HELP}`)
  }

  if (!kokoroInstalled()) {
    console.log("1/3 Mandy's voice (Kokoro) is not installed yet: installing...")
    await installVoice()
  } else console.log('1/3 Voice: ok.')

  const size = whisperSize()
  if (!listenerInstalled()) {
    console.log(`2/3 Installing the ears (Whisper ${size})...`)
    await installRequirements(LISTENER_REQUIREMENTS)
    if (!existsSync(whisperModelFolder(size))) {
      console.log(`  Downloading the Whisper ${size} model...`)
      await run(enginePython(), [
        '-I',
        '-c',
        'import sys; from faster_whisper import download_model; download_model(sys.argv[1], cache_dir=sys.argv[2])',
        size,
        WHISPER_FOLDER,
      ])
    }
    if (!listenerInstalled())
      throw new Error('Whisper was installed, but the model did not show up in data/voice/whisper/.')
  } else console.log(`2/3 Ears (Whisper ${size}): ok.`)

  const ollama = await ollamaState()
  if (!ollama.ok) {
    console.log(`3/3 ${OLLAMA_HELP}`)
    return 0
  }
  const target = requestedModel ?? (ollama.model && !requestedModel ? null : suggestedModel())
  if (target && !noModel && !ollama.models.includes(target)) await downloadOllamaModel(target)
  forgetOllamaState()
  const after = await ollamaState()
  console.log(
    after.model
      ? `3/3 Brain: Ollama with ${after.model}.${requestedModel && after.model !== requestedModel ? ` To use ${requestedModel}, set FEYNMAN_MODEL=${requestedModel} in .env.` : ''}`
      : '3/3 Ollama is running, but has no model. Run it again without --no-model.',
  )
  console.log('Done. Open a module in the app and click "Teach Mandy".')
  return 0
}

if (process.argv[1]?.endsWith('feynman.ts')) {
  installFeynman(process.argv.slice(2)).then(
    (c) => process.exit(c),
    (e) => {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`)
      process.exit(1)
    },
  )
}

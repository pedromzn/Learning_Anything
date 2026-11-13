/**
 * Gets the machine ready, part by part, asking before downloading.
 *   npm run setup              checks everything, shows what is missing and asks what to install
 *   npm run setup -- --all     installs what is missing without asking (except Ollama, which is a separate program)
 *   npm run setup -- --check   only shows the state, installs nothing
 *
 * Nothing here uses sudo: what needs the system (ffmpeg, uv, Ollama) is explained, and the person installs it.
 */

import { stdin, stdout } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { ollamaState } from '../server/feynman/brain.js'
import { listenerInstalled } from '../server/feynman/listener.js'
import { modelsState, installModels } from '../server/focus/models.js'
import { ffmpegInstalled, kokoroInstalled } from '../server/video/voice.js'
import { installFeynman } from './feynman.js'
import { PYTHON_HELP, exists, install as installVoice, systemPython } from './voice.js'

const OK = '✔'
const MISSING = '·'
const line = (ok: boolean, text: string) => console.log(`  ${ok ? OK : MISSING} ${text}`)

const FFMPEG_HELP_BY_OS: Record<string, string> = {
  darwin: 'brew install ffmpeg',
  linux: "sudo apt install ffmpeg   (or your distribution's package manager)",
  win32: 'winget install Gyan.FFmpeg   (then reopen the terminal)',
}

const OLLAMA_HELP_BY_OS: Record<string, string> = {
  darwin:
    'download the app from https://ollama.com/download and open it; on an Intel Mac avoid brew, which builds from scratch',
  linux: 'see https://ollama.com/download/linux',
  win32: 'winget install Ollama.Ollama',
}

function isNodeSupported(version: string): boolean {
  const [major, minor] = version.replace(/^v/, '').split('.').map(Number)
  return major! > 22 || (major === 22 && minor! >= 13)
}

async function main(argv: string[]): Promise<number> {
  const everything = argv.includes('--all')
  const checkOnly = argv.includes('--check')
  const interactive = stdin.isTTY && !everything && !checkOnly
  const reader = interactive ? createInterface({ input: stdin, output: stdout }) : null
  const ask = async (text: string): Promise<boolean> => {
    if (checkOnly) return false
    if (!reader) return everything
    const r = (await reader.question(`\n${text} [Y/n] `)).trim().toLowerCase()
    // English and Portuguese answers both work
    return r === '' || r === 'y' || r === 'yes' || r === 's' || r === 'sim'
  }

  try {
    console.log('Learning Anything: setting up the machine\n')
    console.log('Base')
    const node = isNodeSupported(process.version)
    line(node, `Node ${process.version}${node ? '' : ' (needs 22.13 or newer: https://nodejs.org)'}`)
    const ffmpeg = await ffmpegInstalled()
    line(ffmpeg, ffmpeg ? 'ffmpeg' : `ffmpeg: missing. ${FFMPEG_HELP_BY_OS[process.platform] ?? ''}`)
    const uv = await exists('uv', ['--version'])
    const python = uv ? null : await systemPython()
    const hasPython = Boolean(uv || python)
    line(hasPython, uv ? `uv (${uv})` : python ? `system Python (${python})` : 'uv or Python 3.10+: missing')
    if (!node) return 1

    const ollama = await ollamaState()
    const focus = modelsState().installed
    console.log('\nOptional parts')
    line(kokoroInstalled(), 'Voice for the videos and Mandy (Kokoro, ~400 MB)')
    line(listenerInstalled(), "Mandy's ears in the Feynman block (Whisper, ~460 MB)")
    line(
      ollama.ok && Boolean(ollama.model),
      ollama.ok
        ? ollama.model
          ? `Mandy's brain: Ollama with ${ollama.model}`
          : "Mandy's brain: Ollama is running, but has no model"
        : "Mandy's brain (Ollama): without it, Mandy uses script mode",
    )
    line(focus, 'Focus mode webcam detector (~8 MB)')

    if (checkOnly) return 0

    if (!kokoroInstalled() || !listenerInstalled()) {
      if (!hasPython) {
        console.log(`\nThe voice and Whisper need uv or a Python.\n${PYTHON_HELP}`)
      } else {
        if (!kokoroInstalled() && (await ask('Install the voice (Kokoro, ~400 MB)?'))) await installVoice()
        const wantsFeynman =
          kokoroInstalled() &&
          !listenerInstalled() &&
          (await ask("Install Mandy's ears for the Feynman block (Whisper, ~460 MB)?"))
        if (wantsFeynman) await installFeynman(['--no-model'])
      }
    }

    if (ollama.ok && !ollama.model && (await ask('Download a model for Ollama (a few GB)?'))) {
      await installFeynman()
    }

    if (!focus && (await ask('Download the focus mode detector (~8 MB)?'))) {
      const state = await installModels((t) => console.log(`  ${t}`))
      console.log(`  ${OK} ${state.megabytes} MB in data/focus/`)
    }

    console.log('\nDone. Start the app with: npm run dev   (http://localhost:3040)')
    if (!ffmpeg)
      console.log(
        `- Without ffmpeg there are no videos and no speech in the Feynman block: ${FFMPEG_HELP_BY_OS[process.platform] ?? 'install ffmpeg'}`,
      )
    if (!ollama.ok)
      console.log(
        `- For Mandy to really hold a conversation, install Ollama: ${OLLAMA_HELP_BY_OS[process.platform] ?? 'https://ollama.com/download'}. Then run "npm run feynman:install".`,
      )
    console.log('- Check the state any time: npm run setup -- --check')
    return 0
  } finally {
    reader?.close()
  }
}

main(process.argv.slice(2)).then(
  (c) => process.exit(c),
  (e) => {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  },
)

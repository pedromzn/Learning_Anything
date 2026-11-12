/**
 * The local voice from the command line.
 *   npm run voice:install                         installs the Kokoro engine in data/voice/ (once, ~400 MB)
 *   npm run voice:test [-- "phrase"] [--play] [--language en|pt-BR]   speaks a phrase with the chosen engine
 */

import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, createWriteStream, existsSync } from 'node:fs'
import { mkdir, rename, rm } from 'node:fs/promises'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { promisify } from 'node:util'
import { config } from '../server/config.js'
import { MODEL_FILES, VOICE_FOLDER, VOICES, chosenEngine, narrate, enginePython } from '../server/video/voice.js'
import { LANGUAGES, isLanguage, type Language } from '../shared/languages.js'

const execFileAsync = promisify(execFile)

const DEFAULT_PHRASE: Record<Language, string> = {
  en: 'Hello! This is the voice that will narrate your lessons, right from your computer.',
  'pt-BR': 'Olá! Esta é a voz que vai narrar as suas aulas, direto do seu computador.',
}
const REQUIREMENTS = path.join(config.root, 'voice', 'requirements.txt')
const ENV_FOLDER = path.join(VOICE_FOLDER, '.venv')

export const PYTHON_HELP = [
  'Installing the voice needs uv (recommended: it downloads Python on its own) or a Python 3.10+.',
  '  macOS / Linux:  curl -LsSf https://astral.sh/uv/install.sh | sh     (or: brew install uv)',
  '  Windows:        winget install astral-sh.uv',
  'Then open a new terminal and run "npm run voice:install" again.',
].join('\n')

export async function exists(command: string, args: string[]): Promise<string | null> {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, { timeout: 15_000 })
    return (stdout || stderr).trim()
  } catch {
    return null
  }
}

/** A system Python 3.10 to 3.13, for those without uv. */
export async function systemPython(): Promise<string | null> {
  for (const command of process.platform === 'win32' ? ['py', 'python'] : ['python3', 'python']) {
    const version = await exists(command, ['-c', 'import sys; print("%d.%d" % sys.version_info[:2])'])
    const [major, minor] = (version ?? '').split('.').map(Number)
    if (major === 3 && minor >= 10 && minor <= 13) return command
  }
  return null
}

export function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' })
    child.on('error', reject)
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`"${command} ${args.join(' ')}" exited with code ${code}.`)),
    )
  })
}

/** Creates the voice's Python environment (if missing) and installs a requirements file into it. */
export async function installRequirements(requirements: string = REQUIREMENTS) {
  if (existsSync(enginePython())) {
    console.log('Python environment already exists in data/voice/.venv; checking the dependencies...')
  }
  if (await exists('uv', ['--version'])) {
    if (!existsSync(enginePython())) {
      console.log('Creating the isolated Python environment with uv...')
      await run('uv', ['venv', '--quiet', '--python', '3.12', ENV_FOLDER])
    }
    await run('uv', ['pip', 'install', '--quiet', '--python', enginePython(), '-r', requirements])
    return
  }
  const python = await systemPython()
  if (!python) throw new Error(PYTHON_HELP)
  if (!existsSync(enginePython())) {
    console.log(`Creating the isolated Python environment with ${python}...`)
    await run(python, ['-m', 'venv', ENV_FOLDER])
  }
  await run(enginePython(), ['-m', 'pip', 'install', '--quiet', '--disable-pip-version-check', '-r', requirements])
}

async function sha256(file: string): Promise<string> {
  const hash = createHash('sha256')
  await pipeline(createReadStream(file), hash)
  return hash.digest('hex')
}

async function downloadModel() {
  for (const { name, url, sha256: expected } of MODEL_FILES) {
    const destination = path.join(VOICE_FOLDER, name)
    if (existsSync(destination)) continue
    console.log(`Downloading ${name}...`)
    const answer = await fetch(url, { redirect: 'follow' })
    if (!answer.ok || !answer.body) throw new Error(`The download of ${name} failed (HTTP ${answer.status}).`)
    const partial = `${destination}.partial`
    await pipeline(Readable.fromWeb(answer.body as never), createWriteStream(partial))
    if ((await sha256(partial)) !== expected) {
      await rm(partial, { force: true })
      throw new Error(`The file ${name} arrived different from expected (sha256). Try again.`)
    }
    await rename(partial, destination)
  }
}

export async function install(): Promise<number> {
  await mkdir(VOICE_FOLDER, { recursive: true })
  await installRequirements()
  await downloadModel()
  console.log('Done: the Kokoro voice engine is in data/voice/. Test it with "npm run voice:test -- --play".')
  console.log(
    `Voices: ${VOICES.join(', ')} (each course uses the first one of its language; change it with VOICE=... in .env).`,
  )
  return 0
}

async function test(argv: string[]): Promise<number> {
  const play = argv.includes('--play')
  const i = argv.indexOf('--language')
  const request = i >= 0 ? argv[i + 1] : 'pt-BR'
  if (!isLanguage(request)) {
    console.error(`Unknown language: ${request}. Use one of: ${LANGUAGES.join(', ')}.`)
    return 1
  }
  const language: Language = request
  const text =
    argv
      .filter((a, j) => a !== '--play' && (i < 0 || (j !== i && j !== i + 1)))
      .join(' ')
      .trim() || DEFAULT_PHRASE[language]
  const picked = await chosenEngine(language)
  console.log(`Engine: ${picked.engine}${picked.voice ? ` (${picked.voice})` : ''}; ${picked.detail}`)
  const start = Date.now()
  const segment = await narrate(text, { language })
  console.log(`Duration: ${(segment.durationMs / 1000).toFixed(1)}s (generated in ${Date.now() - start} ms)`)
  console.log(`File: ${path.relative(config.root, segment.file)}`)
  if (segment.simulated)
    console.log('No voice: the audio is silence. Run "npm run voice:install" to install the voice.')
  if (play) {
    const player =
      process.platform === 'darwin'
        ? ['afplay', [segment.file]]
        : process.platform === 'linux'
          ? ['ffplay', ['-nodisp', '-autoexit', '-loglevel', 'quiet', segment.file]]
          : null
    if (player) {
      const [command, args] = player as [string, string[]]
      await new Promise<void>((r) =>
        spawn(command, args, { stdio: 'ignore' })
          .on('close', () => r())
          .on('error', () => r()),
      )
    } else console.log('Open the file above in your player to listen.')
  }
  return 0
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'install') return install()
  if (command === 'test') return test(rest)
  console.log('Usage: npm run voice:install  |  npm run voice:test [-- "phrase"] [--play] [--language en|pt-BR]')
  return command ? 1 : 0
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main().then(
    (c) => process.exit(c),
    (e) => {
      console.error(`Error: ${e instanceof Error ? e.message : String(e)}`)
      process.exit(1)
    },
  )
}

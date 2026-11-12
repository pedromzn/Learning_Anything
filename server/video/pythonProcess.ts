/**
 * A live Python process that talks in JSON lines — how the local engines work (the Kokoro voice, the Whisper listener).
 * Loading a model takes seconds, so the process stays open while there is work and closes on its own after being idle
 * for a while (or when Node exits).
 *
 * Protocol: the script writes `{"ready": true}` once loaded; then, for each `{"id": n, ...}` it receives, it answers
 * `{"id": n, "ok": true, ...}` or `{"id": n, "ok": false, "error": "..."}`. A line that is not JSON is a library warning.
 */

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'
import { createInterface } from 'node:readline'

interface Pending {
  resolve: (answer: Record<string, unknown>) => void
  reject: (error: Error) => void
}

export class PythonProcess {
  private child: ChildProcessWithoutNullStreams | null = null
  private ready: Promise<void> | null = null
  private pendingItems = new Map<number, Pending>()
  private nextId = 1
  private idleTimer: NodeJS.Timeout | null = null
  private errorOutput = ''

  /**
   * @param name how the engine shows up in error messages ("voice engine", "listener")
   * @param command returns the executable and the arguments at open time (the paths may change after installing)
   * @param idleMs closes after this long without a request
   */
  constructor(
    private readonly name: string,
    private readonly command: () => { python: string; args: string[] },
    private readonly idleMs = 60_000,
  ) {
    process.on('exit', () => this.close())
  }

  private begin(): Promise<void> {
    const { python, args } = this.command()
    const child = spawn(python, args, { stdio: 'pipe' })
    this.child = child
    this.errorOutput = ''
    child.stderr.on('data', (d: Buffer) => {
      this.errorOutput = (this.errorOutput + d.toString()).slice(-2000)
    })

    return new Promise<void>((resolve, reject) => {
      const lines = createInterface({ input: child.stdout })
      lines.on('line', (line) => {
        let msg: Record<string, unknown> & { ready?: boolean; id?: number; ok?: boolean; error?: string }
        try {
          msg = JSON.parse(line)
        } catch {
          return
        }
        if (msg.ready) return resolve()
        const pending = typeof msg.id === 'number' ? this.pendingItems.get(msg.id) : undefined
        if (!pending || typeof msg.id !== 'number') return
        this.pendingItems.delete(msg.id)
        if (msg.ok) pending.resolve(msg)
        else pending.reject(new Error(`The ${this.name} failed: ${msg.error ?? 'unknown error'}`))
      })
      const onExit = (reason: string) => {
        const last = this.errorOutput.trim().split('\n').pop() ?? ''
        const error = new Error(`The ${this.name} stopped (${reason}). ${last}`.trim())
        reject(error)
        if (this.child !== child) return // an old process, already replaced: leave the current one alone
        for (const p of this.pendingItems.values()) p.reject(error)
        this.pendingItems.clear()
        this.child = null
        this.ready = null
      }
      child.on('error', (e) => onExit(e.message))
      child.on('exit', (code) => onExit(`code ${code}`))
    })
  }

  /** Sends a request and waits for the answer. The first request opens the process. */
  async send(data: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.ready ??= this.begin()
    await this.ready
    const child = this.child
    if (!child) throw new Error(`The ${this.name} is not running.`)
    const id = this.nextId++
    this.hold(child, true)
    try {
      return await new Promise<Record<string, unknown>>((resolve, reject) => {
        this.pendingItems.set(id, { resolve, reject })
        child.stdin.write(JSON.stringify({ ...data, id }) + '\n')
      })
    } finally {
      this.scheduleClose()
    }
  }

  /** While busy, the process keeps Node alive; while idle, it does not (a finished script does not wait for Python). */
  private hold(child: ChildProcessWithoutNullStreams, yes: boolean) {
    for (const target of [child, child.stdin, child.stdout, child.stderr] as Array<{ ref?(): void; unref?(): void }>) {
      if (yes) target.ref?.()
      else target.unref?.()
    }
  }

  private scheduleClose() {
    if (this.child && this.pendingItems.size === 0) this.hold(this.child, false)
    if (this.idleTimer) clearTimeout(this.idleTimer)
    this.idleTimer = setTimeout(() => this.close(), this.idleMs)
    this.idleTimer.unref()
  }

  close() {
    this.child?.stdin.end()
    this.child?.kill()
    this.child = null
    this.ready = null
  }
}

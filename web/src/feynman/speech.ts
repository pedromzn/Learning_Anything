/**
 * Mandy's voice in the browser: asks the local server for the mp3 (Kokoro, in Mandy's voice for the course language),
 * plays it and measures the volume so the orb pulses along. Without the voice installed, Mandy answers in text only
 * (the promise resolves after a reading delay).
 */

export class Speech {
  private context: AudioContext
  private analyser: AnalyserNode
  private audio: HTMLAudioElement | null = null
  private samples: Float32Array<ArrayBuffer>
  private timer: number | null = null
  private finish: (() => void) | null = null
  /** the voice is not installed: no use asking again */
  noVoice = false

  constructor(
    private readonly onLevel: (level: number) => void,
    private readonly voice: string,
  ) {
    // born from a click (the "Start" button), otherwise the browser will not play sound
    this.context = new AudioContext()
    this.analyser = this.context.createAnalyser()
    this.analyser.fftSize = 512
    this.analyser.connect(this.context.destination)
    this.samples = new Float32Array(this.analyser.fftSize)
  }

  async speak(text: string): Promise<void> {
    this.stop()
    if (this.noVoice) return wait(Math.min(6000, 600 + text.length * 45))
    let url: string
    try {
      const r = await fetch('/api/voice/speak', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice: this.voice }),
      })
      if (r.status === 503) {
        this.noVoice = true
        return wait(Math.min(6000, 600 + text.length * 45))
      }
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      url = URL.createObjectURL(await r.blob())
    } catch {
      return wait(1200)
    }
    await this.context.resume()
    const audio = new Audio(url)
    this.audio = audio
    this.context.createMediaElementSource(audio).connect(this.analyser)
    await new Promise<void>((resolver) => {
      this.finish = () => {
        if (this.timer !== null) window.clearInterval(this.timer)
        this.timer = null
        this.onLevel(0)
        URL.revokeObjectURL(url)
        this.finish = null
        resolver()
      }
      audio.onended = () => this.finish?.()
      audio.onerror = () => this.finish?.()
      this.timer = window.setInterval(() => {
        this.analyser.getFloatTimeDomainData(this.samples)
        let sum = 0
        for (const a of this.samples) sum += a * a
        this.onLevel(Math.min(1, Math.sqrt(sum / this.samples.length) / 0.2))
      }, 50)
      audio.play().catch(() => this.finish?.())
    })
  }

  /** Cuts the speech short (the student wants to talk, or left the screen). */
  stop() {
    this.audio?.pause()
    this.audio = null
    this.finish?.()
  }

  close() {
    this.stop()
    void this.context.close()
  }
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

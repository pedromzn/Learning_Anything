/**
 * The focus mode sounds, synthesized with Web Audio: no audio files (and no sound licenses). The audio context
 * must be born from a click — that is why `prepare()` is called when the person presses "Start".
 */

let context: AudioContext | null = null

export function prepare(): void {
  context ??= new AudioContext()
  if (context.state === 'suspended') void context.resume()
}

function tone(start: number, duration: number, frequency: number, volume: number, shape: OscillatorType) {
  if (!context) return
  const osc = context.createOscillator()
  const gain = context.createGain()
  osc.type = shape
  osc.frequency.setValueAtTime(frequency, start)
  gain.gain.setValueAtTime(0.0001, start)
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration)
  osc.connect(gain).connect(context.destination)
  osc.start(start)
  osc.stop(start + duration + 0.05)
}

/** The nudge alarm: longer and harsher at each level (1, 2 or 3). */
export function alarm(volume: number, level: 1 | 2 | 3): void {
  prepare()
  if (!context || volume <= 0) return
  const t = context.currentTime + 0.02
  const v = 0.35 * volume
  const repetitions = level === 1 ? 2 : level === 2 ? 3 : 5
  const shape: OscillatorType = level === 3 ? 'sawtooth' : 'square'
  for (let i = 0; i < repetitions; i++) {
    tone(t + i * 0.32, 0.14, 880, v, shape)
    tone(t + i * 0.32 + 0.15, 0.14, level === 1 ? 660 : 587, v, shape)
  }
}

/** The phase-change chime (break started, focus is back, session ended): soft. */
export function chime(volume: number, rising = true): void {
  prepare()
  if (!context || volume <= 0) return
  const t = context.currentTime + 0.02
  const notes = rising ? [523.25, 659.25, 783.99] : [783.99, 659.25, 523.25]
  notes.forEach((f, i) => tone(t + i * 0.18, 0.9, f, 0.25 * volume, 'sine'))
}

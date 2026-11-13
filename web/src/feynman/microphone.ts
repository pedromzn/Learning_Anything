/**
 * The Feynman lesson microphone: records one student "turn" and notices on its own when they finished speaking
 * (silence detection by volume, with the noise level measured on the spot). The audio only goes from here to the
 * local server, which transcribes it with Whisper and throws it away.
 */
import { t } from '@/i18n'

export interface MicrophoneOptions {
  /** the current volume, from 0 to 1 (for the orb to react) */
  onLevel: (level: number) => void
  /** the turn ended with speech: the recorded audio */
  onSpeak: (audio: Blob) => void
  /** how much silence, after speaking, ends the turn */
  silenceMs?: number
}

const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm']
const STEP_MS = 50
const MAX_TURN_MS = 90_000
const MIN_SPEECH_MS = 400

export class MicRecorder {
  private recorder: MediaRecorder | null = null
  private chunks: Blob[] = []
  private timer: number | null = null
  private samples: Float32Array<ArrayBuffer>
  private noise = 0.01
  private spokeMs = 0
  private silenceMs = 0
  private start = 0
  private issue = false

  /** the microphone is held only while a turn is recorded (see `listen`) */
  private stream: MediaStream | null = null
  private source: MediaStreamAudioSourceNode | null = null
  /** bumps on every listen/stop, so a slow getUserMedia from a cancelled turn is dropped */
  private attempt = 0

  private constructor(
    private readonly context: AudioContext,
    private readonly analyser: AnalyserNode,
    private readonly options: MicrophoneOptions,
  ) {
    this.samples = new Float32Array(analyser.fftSize)
  }

  /**
   * Asks for permission once and lets the microphone go right away. Holding it open while Mandy speaks makes her voice
   * sound robotic: Bluetooth headsets drop to the low-quality "call" profile, and macOS voice processing (echo
   * cancellation) runs over everything the computer plays. Turns never overlap, so there is no echo to cancel.
   */
  static async open(options: MicrophoneOptions): Promise<MicRecorder> {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined')
      throw new Error(t().feynman.noRecording)
    const test = await MicRecorder.takeMicrophone()
    test.getTracks().forEach((track) => track.stop())
    const context = new AudioContext()
    const analyser = context.createAnalyser()
    analyser.fftSize = 1024
    return new MicRecorder(context, analyser, options)
  }

  private static takeMicrophone(): Promise<MediaStream> {
    return navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: true },
    })
  }

  get listening(): boolean {
    return this.recorder?.state === 'recording'
  }

  /** There was speech in this turn already (to enable "Done, I spoke"). */
  get hadSpeech(): boolean {
    return this.spokeMs >= MIN_SPEECH_MS
  }

  /** Starts a student turn: takes the microphone, records, and lets it go when the turn ends. */
  listen() {
    if (this.listening || this.stream) return
    const attempt = ++this.attempt
    void this.context.resume()
    MicRecorder.takeMicrophone().then(
      (stream) => {
        if (attempt !== this.attempt) {
          stream.getTracks().forEach((track) => track.stop())
          return
        }
        this.record(stream)
      },
      () => this.options.onLevel(0),
    )
  }

  private record(stream: MediaStream) {
    this.stream = stream
    this.source = this.context.createMediaStreamSource(stream)
    this.source.connect(this.analyser)
    const type = TYPES.find((t) => MediaRecorder.isTypeSupported(t))
    const recorder = new MediaRecorder(stream, type ? { mimeType: type } : undefined)
    this.recorder = recorder
    this.chunks = []
    this.spokeMs = 0
    this.silenceMs = 0
    this.start = performance.now()
    this.issue = false
    recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data)
    recorder.onstop = () => {
      const audio = new Blob(this.chunks, { type: recorder.mimeType || 'audio/webm' })
      this.chunks = []
      this.release()
      if (this.issue && audio.size > 0) this.options.onSpeak(audio)
    }
    recorder.start(250)
    this.timer = window.setInterval(() => this.measure(), STEP_MS)
  }

  private measure() {
    this.analyser.getFloatTimeDomainData(this.samples)
    let sum = 0
    for (const a of this.samples) sum += a * a
    const rms = Math.sqrt(sum / this.samples.length)
    // background noise rises slowly and falls fast: it follows the room without mistaking speech for noise
    this.noise = rms < this.noise ? this.noise * 0.9 + rms * 0.1 : this.noise * 0.995 + rms * 0.005
    const threshold = Math.max(0.012, this.noise * 2.8)
    this.options.onLevel(Math.min(1, rms / 0.12))
    if (rms > threshold) {
      this.spokeMs += STEP_MS
      this.silenceMs = 0
    } else if (this.hadSpeech) {
      this.silenceMs += STEP_MS
    }
    const tooLong = performance.now() - this.start > MAX_TURN_MS
    if ((this.hadSpeech && this.silenceMs >= (this.options.silenceMs ?? 1500)) || tooLong)
      this.endSession(this.hadSpeech)
  }

  private endSession(issue: boolean) {
    this.attempt++
    if (this.timer !== null) window.clearInterval(this.timer)
    this.timer = null
    this.options.onLevel(0)
    this.issue = issue
    if (this.recorder?.state === 'recording') this.recorder.stop()
    else this.release()
  }

  /** Lets the microphone go (the browser's red dot turns off, headsets go back to high-quality audio). */
  private release() {
    this.source?.disconnect()
    this.source = null
    this.stream?.getTracks().forEach((track) => track.stop())
    this.stream = null
  }

  /** "Done, I spoke": ends the turn now (sends the audio if there was speech). */
  finish() {
    this.endSession(this.hadSpeech)
  }

  /** Cancels the turn without sending anything. */
  stop() {
    this.endSession(false)
  }

  close() {
    this.stop()
    this.release()
    void this.context.close()
  }
}

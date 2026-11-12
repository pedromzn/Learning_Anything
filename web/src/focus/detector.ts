/**
 * The focus mode detector: MediaPipe Tasks Vision running in the browser. It takes the camera `<video>` and returns a
 * short reading — is there a face? where is the head pointing? eyes closed? phone in sight? The image goes nowhere:
 * each frame is read here and thrown away.
 *
 * The files (WebAssembly and models) come from the local server, at `/api/focus/files/`.
 */

import { FaceLandmarker, FilesetResolver, ObjectDetector, type Matrix } from '@mediapipe/tasks-vision'

const BASE = '/api/focus/files'

export interface Pose {
  /** head turned sideways, in degrees */
  yaw: number
  /** head up or down, in degrees */
  pitch: number
}

export interface FaceReading {
  face: boolean
  pose: Pose | null
  /** the average of the blink blendshapes of both eyes, from 0 to 1 */
  blink: number
  /** the average of the look-down blendshapes of both eyes, from 0 to 1 */
  lookDown: number
}

const DEGREES = 180 / Math.PI

/** The head pose from the facial transformation matrix (4x4, column-major). */
export function poseFromMatrix(m: Matrix): Pose {
  const d = m.data
  const r00 = d[0]!
  const r10 = d[1]!
  const r20 = d[2]!
  const r21 = d[6]!
  const r22 = d[10]!
  return {
    yaw: Math.atan2(-r20, Math.hypot(r00, r10)) * DEGREES,
    pitch: Math.atan2(r21, r22) * DEGREES,
  }
}

/** How many degrees the pose is away from the calibrated posture. */
export const poseDeviation = (p: Pose, base: Pose): number => Math.hypot(p.yaw - base.yaw, p.pitch - base.pitch)

async function createWithDelegate<T>(create: (delegate: 'GPU' | 'CPU') => Promise<T>): Promise<T> {
  try {
    return await create('GPU')
  } catch {
    return create('CPU') // no usable WebGL: the CPU handles it, just a bit slower
  }
}

export class Detector {
  private lastTime = 0

  private constructor(
    private readonly faces: FaceLandmarker,
    private readonly objects: ObjectDetector,
  ) {}

  static async create(): Promise<Detector> {
    const files = await FilesetResolver.forVisionTasks(`${BASE}/wasm`)
    const [faces, objects] = await Promise.all([
      createWithDelegate((delegate) =>
        FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: `${BASE}/models/face_landmarker.task`, delegate },
          runningMode: 'VIDEO',
          numFaces: 1,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        }),
      ),
      createWithDelegate((delegate) =>
        ObjectDetector.createFromOptions(files, {
          baseOptions: { modelAssetPath: `${BASE}/models/efficientdet_lite0.tflite`, delegate },
          runningMode: 'VIDEO',
          // a phone on a webcam is small and tilted: the score stays low; the engine requires 2 of 3 readings in a row
          scoreThreshold: 0.3,
          maxResults: 1,
          categoryAllowlist: ['cell phone'],
        }),
      ),
    ])
    return new Detector(faces, objects)
  }

  /** MediaPipe requires ever-increasing timestamps, even across the two tasks. */
  private time(): number {
    this.lastTime = Math.max(this.lastTime + 1, performance.now())
    return this.lastTime
  }

  readFace(video: HTMLVideoElement): FaceReading {
    const r = this.faces.detectForVideo(video, this.time())
    if (!r.faceLandmarks.length) return { face: false, pose: null, blink: 0, lookDown: 0 }
    const matrix = r.facialTransformationMatrixes?.[0]
    const categories = r.faceBlendshapes?.[0]?.categories ?? []
    const score = (name: string) => categories.find((c) => c.categoryName === name)?.score ?? 0
    return {
      face: true,
      pose: matrix ? poseFromMatrix(matrix) : null,
      blink: (score('eyeBlinkLeft') + score('eyeBlinkRight')) / 2,
      lookDown: (score('eyeLookDownLeft') + score('eyeLookDownRight')) / 2,
    }
  }

  /** The score of the most likely phone in the image (0 = none). */
  readPhone(video: HTMLVideoElement): number {
    const d = this.objects.detectForVideo(video, this.time()).detections[0]
    return d?.categories[0]?.score ?? 0
  }

  close() {
    this.faces.close()
    this.objects.close()
  }
}

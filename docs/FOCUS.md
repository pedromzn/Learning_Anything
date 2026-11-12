# Focus mode

A pomodoro with an optional watch through the webcam. The person chooses how long they will study (for example 1 hour)
and the cycle pace (25 min of focus and 5 of break, for example). During the focus blocks, the camera checks that they
are still studying. If they pick up the phone, leave the computer without pausing, keep looking away, doze off or switch
tabs, a nudge shows up on the screen with a sound alarm to bring their attention back.

## Principles

1. **Nothing leaves the machine.** The camera image is read only in the browser, frame by frame, and thrown away. No
   image is saved, neither on disk nor on the local server. The server keeps only the session summary (minutes, number
   of distractions by type).
2. **Optional and explicit.** Focus mode works as a plain pomodoro without the camera. The camera only turns on when the
   person ticks the option and the browser asks for permission. The detection models (~8 MB) are only downloaded when
   the person clicks to download them, and they arrive checked by sha256.
3. **A real break is not a distraction.** Whoever presses "Pause" or is in the pomodoro break can leave freely: the
   watch stops. Only leaving _without going through the app_ triggers a nudge.
4. **No XP.** The gamification rule is "only learning earns points". A running timer is not learning (and it would be
   easy to cheat). Focus shows on the profile as statistics: focused hours, average focus, sessions.
5. **A firm nudge, never a humiliating one.** The tone rises with each distraction in the session (1st: reminder; 2nd:
   firm; 3rd onward: telling-off), but always pulling back to the activity.

## How detection works

All in the browser with [MediaPipe Tasks Vision](https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker/web_js)
(`@mediapipe/tasks-vision`, Apache 2.0). The WebAssembly comes from the npm package itself and is served by the local
server; the models live in `data/focus/`.

| Signal           | How it is read                                                                      | Becomes a distraction when                           |
| ---------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------- |
| **Away**         | the Face Landmarker finds no face                                                   | absent for more than N s (without pausing)           |
| **Phone**        | the Object Detector (EfficientDet-Lite0, COCO) sees a `cell phone`                  | seen for more than N s                               |
| **Looking away** | the head pose matrix, compared with the posture calibrated at the start             | head turned beyond X degrees for more than N s       |
| **Looking down** | eyes (and maybe head) lowered below the calibrated posture, like a phone in the lap | looking down for more than N s                       |
| **Dozing off**   | the Face Landmarker `eyeBlinkLeft/Right` blendshapes                                | eyes closed for more than N s                        |
| **Left the app** | the Page Visibility API (hidden tab)                                                | out of the tab for more than N s (can be turned off) |

- **Calibration:** at the start of each focus block, 3 s of "look at the screen as you do when studying". This records
  the neutral posture; the deviation is measured from it. That way, someone studying with a low laptop is not punished
  for looking down.
- **Pace:** face every 200 ms, phone every 1 s. The GPU (WebGL) is tried first, falling back to the CPU.
- **Sensitivity** (`light`, `normal`, `strict`) changes the time and angle limits. The numbers are in
  `shared/focus.ts` (`LIMITS`).
- **Hidden tab:** the browser slows down the tab's timers. The clock uses real time (it does not count ticks), so the
  time stays right. The alarm plays even with the tab hidden and, if the person allows it, a system notification comes
  with it.

## Flow

1. Floating **Focus** button (on every screen, including the lesson) → settings window: total duration, cycles, camera
   yes or no, watch the tab, sensitivity and volume. The last choice is remembered in the browser.
2. With the camera: if the model is missing, a "Download detector (8 MB)" button. Then the browser asks for the camera,
   and calibration follows.
3. Session running: a floating widget with the time ring, the phase (focus or break), the attention dot (green, yellow,
   red), the camera preview (optional) and the Pause and End buttons. The widget survives screen changes.
4. Distraction → full-screen nudge + alarm. It stays until the person clicks "I'm back". From then on, the counters
   reset.
5. End (or "End") → summary: focused minutes, focus %, distractions by type. The session goes to the profile.
6. Closing the tab in the middle of the session saves it as interrupted (`sendBeacon`).

## Where each part lives

| File                             | What                                                                                                   |
| -------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `shared/focus.ts`                | types, zod schemas, cycle plan, limits, the attention evaluator (pure function) and the messages       |
| `shared/focus.test.ts`           | tests of the evaluator and the cycles                                                                  |
| `server/focus/models.ts`         | the list of models with sha256, their state and the download to `data/focus/`                          |
| `server/focus/sessions.ts`       | saving and summarizing sessions in SQLite (table `focus_sessions`, schema v2)                          |
| `server/routes/focus.ts`         | `GET/POST /api/focus/models`, `/api/focus/files/{models,wasm}/*`, `GET/POST /api/focus/sessions`       |
| `scripts/focus.ts`               | `npm run focus:install`: downloads the models from the terminal                                        |
| `web/src/focus/detector.ts`      | MediaPipe: loads, reads a frame and returns the reading (face, deviation, eyes, phone)                 |
| `web/src/focus/sound.ts`         | the alarm, synthesized with Web Audio (no sound file, no license)                                      |
| `web/src/focus/engine.ts`        | the session engine: camera, detection loop, clock, phases, distractions (outside React)                |
| `web/src/focus/FocusPanel.tsx`   | the interface: button, settings, widget, nudge and summary (mounted in `web/src/components/Shell.tsx`) |
| `web/src/focus/FocusSection.tsx` | the "Focus" section of the profile (`web/src/pages/Profile.tsx`) with the totals and the last sessions |

## Implementation steps

1. Plan (this file) and the `@mediapipe/tasks-vision` dependency with an exact version.
2. `shared/focus.ts` + tests: cycles, limits, evaluator, messages.
3. Server: models (download + sha256), file routes, database v2, sessions, `npm run focus:install`.
4. Front end: detector, sound, engine.
5. Front end: panel (button, settings, calibration, widget, nudge, summary) mounted in the shell.
6. Profile: Focus section.
7. Docs: README, AGENTS.md and privacy.
8. Verification: typecheck, tests, `npm run verify`, open in the browser.

## Left for later

- Weekly focus report and a chart by hour of the day.
- Detect hand on face / yawning as a sign of tiredness and suggest a break.
- Keyboard shortcuts (space pauses, Esc closes the nudge).

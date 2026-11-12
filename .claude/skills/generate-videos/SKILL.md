---
name: generate-videos
description: Use when the person asks to generate, render or redo the videos of a course's lessons, to install or test the local voice, or when a video has no sound, no image or the render fails.
---

# Generate the videos

Video lessons are scripts (`lesson-M.json`). The video (image, voice, subtitles, question pauses) is generated **on the
person's machine**, with no internet once the voice is installed. Nothing goes to external services.

## Prerequisites

- **Node 22.13 or newer** and `npm install` done.
- **ffmpeg** on the PATH (it converts the audio and builds the HLS). Test with `ffmpeg -version`.
  - macOS: `brew install ffmpeg`
  - Debian/Ubuntu: `sudo apt install ffmpeg`
  - Windows: `winget install Gyan.FFmpeg` (reopen the terminal)
    If it is missing, **ask the person to install it**; do not install it with elevated permissions on your own.
- The scripts must be valid: `npm run course:validate -- <slug>`.

## The voice

The voice is **Kokoro** (Apache 2.0), neural, on the CPU, in an isolated Python environment in `data/voice/` (process
`voice/kokoro_worker.py`). It needs `uv` or Python 3.10+ on the machine; if it is missing, **ask the person to install
it**.

```bash
npm run voice:install            # installs the engine (once, ~400 MB, model checked by sha256)
npm run voice:test -- --play     # speaks a sentence, names the engine and plays it
npm run voice:test -- --play --language pt-BR   # the same, in Portuguese
```

The narration speaks the course language (`brief.language`). In `.env` (all optional): `VOICE` = a Kokoro voice
(by default each course uses its language's first voice: `af_heart` in English, `pf_dora` in Portuguese; a voice from
another language is ignored); `VOICE_SPEED` from `0.5` to `2`; `VOICE_ENGINE` = `auto`, `kokoro` or `silence`;
`VIDEO_QUALITY` = `720p` (default, half the render time) or `1080p`. Without the engine installed, the video comes out
silent with the right duration and the player says so.

The audio is cached (`data/cache/audio/`) by text and engine: redoing a video does not spend voice time again. Changed
the engine and want the new one? Use `--force`.

## Generate

```bash
npm run course:video -- <slug>                        # every video lesson still missing
npm run course:video -- <slug> --module 2             # only module 2
npm run course:video -- <slug> --module 2 --lesson 1  # only one lesson
npm run course:video -- <slug> --force                # redoes even the ones that exist
```

Output, next to the script: `module-N/lesson-M.video/` (`index.m3u8`, `part-000.ts`…, `subtitles.vtt`, `poster.jpg`)
and `module-N/lesson-M.video.json` (duration and pauses). These are generated files and are in `.gitignore`: **do not
write them by hand**. The render takes a few minutes per lesson the first time (Remotion downloads the browser it uses,
if needed).

## If it fails

1. **`ffmpeg` not found**: install it (above) and run again.
2. **The voice came out silent**: `npm run voice:test` shows the chosen engine. If it is `silence`, run
   `npm run voice:install` and redo the video with `--force`.
3. **The voice installation failed**: without `uv` or Python 3.10+, the command says how to install them. A network or
   sha256 failure: run it again (it resumes where it stopped). To start over from scratch, delete `data/voice/`.
4. **Validation error before the render**: the command validates the script first; fix the file
   (`npm run course:validate -- <slug>`), usually narration with LaTeX or a duration outside 3.5 to 9 minutes.
5. **The render broke in the middle** (memory, the Remotion browser): run only the problem lesson with
   `--lesson M --force`. On a weak machine, generate one lesson at a time.
6. **The video came out too long or too short**: adjust the script (about 150 words of narration per minute), validate
   and redo with `--force`.
7. **It still fails**: copy the full error message to the person and **do not change the code in `render/` or
   `server/`** unless they ask.

While no video has been generated, the lesson shows as slides with the narration as text; nothing is blocked.

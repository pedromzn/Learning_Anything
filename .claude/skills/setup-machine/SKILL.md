---
name: setup-machine
description: Use when the person has just downloaded the repository and wants everything working ("install everything", "set up the project", "how do I start"), when they want to turn on an optional part (video voice, the Feynman lesson with Ana, Ollama, focus mode with the webcam), when one of those parts does not work (microphone, camera, Ana with no voice, Ana in "script mode", Whisper, slow Ollama) or when they want to uninstall one of them.
---

# Set up the machine

The app starts with Node alone. Everything else is **optional** and turns on one part at a time. Without a part, the
app keeps working and says what is missing. Follow the order below, **checking each step before the next**, and ask
the person what they want to use before downloading gigabytes.

Rules:

- **Never install anything with `sudo` or administrator rights on your own.** Give the command and ask the person to
  run it (or to type `! <command>` in Claude Code).
- Everything the project downloads goes to `data/` (outside git) and is checked by sha256. Nothing leaves the machine
  afterwards.
- It works on macOS (Intel and Apple Silicon), Linux and Windows. Do not assume the machine: check it (`node -v`,
  `uname -m`, `ffmpeg -version`, `uv --version`).

**Shortcut:** `npm run setup -- --check` shows the state of everything (base and optional parts). To install, the person
runs `npm run setup` in their terminal (it asks part by part); you can run `npm run setup -- --all` if they already said
they want everything. Ollama is a separate program: see section 3.

## 0. The minimum: the app

| Needs              | How to check | How to install                                                                           |
| ------------------ | ------------ | ---------------------------------------------------------------------------------------- |
| Node.js **22.13+** | `node -v`    | [nodejs.org](https://nodejs.org) or `brew install node` / `winget install OpenJS.NodeJS` |

```bash
npm install
npm run verify   # typecheck, tests and the sample courses: must pass
npm run dev      # http://localhost:3040
```

With this, these already work: the path, text lessons, exercises, the checkpoint, XP, focus mode **without the camera**
and the Feynman block **by typing** in script mode.

## 1. Base tools (for voice, video and Feynman)

| Tool             | What for                                                         | macOS                 | Debian/Ubuntu                                      | Windows                       |
| ---------------- | ---------------------------------------------------------------- | --------------------- | -------------------------------------------------- | ----------------------------- |
| `ffmpeg`         | building the videos; converting the student's speech for Whisper | `brew install ffmpeg` | `sudo apt install ffmpeg`                          | `winget install Gyan.FFmpeg`  |
| `uv` (preferred) | the isolated Python environment for the voice and Whisper        | `brew install uv`     | `curl -LsSf https://astral.sh/uv/install.sh \| sh` | `winget install astral-sh.uv` |

Without `uv`, a system Python 3.10 to 3.13 will do. After installing on Windows, **reopen the terminal**.

## 2. The voice (videos and Ana)

```bash
npm run voice:install            # Kokoro in data/voice/ (~400 MB, once)
npm run voice:test -- --play     # speaks a sentence and names the engine
```

Details, `.env` variables and problems: the [generate-videos](../generate-videos/SKILL.md) skill.

## 3. Feynman lesson ("Teach Ana")

Ana **listens** (local Whisper), **thinks** (Ollama, optional) and **speaks** (Kokoro, in the course language: voice
`af_heart` in English, `pf_dora` in Portuguese). Overview: `docs/FEYNMAN.md`.

```bash
npm run feynman:install   # voice (if missing) + Whisper small (~460 MB) + the Ollama model, if Ollama is running
```

### Ollama (the brain, optional)

Without Ollama, Ana works in **script mode**: she checks keywords and asks ready-made questions. With it, she really
converses. Ask the person whether they want it (the model is a few GB).

| System  | Install                                                                                                                                                          |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| macOS   | **download the app** from [ollama.com/download](https://ollama.com/download). On an Intel Mac, `brew install ollama` compiles from scratch and takes a long time |
| Linux   | [ollama.com/download/linux](https://ollama.com/download/linux)                                                                                                   |
| Windows | `winget install Ollama.Ollama`                                                                                                                                   |

Then: keep Ollama open (the app sits in the menu bar; from the terminal, `ollama serve`) and run
`npm run feynman:install` again. It downloads `qwen3:8b` on Apple Silicon or with 24 GB+ of RAM, and `qwen3:4b`
otherwise. Another model: `npm run feynman:install -- --model <name>` and `FEYNMAN_MODEL=<name>` in `.env`.

**Speed:** with Apple Silicon or an NVIDIA card, the answer comes in 1 to 3 s. On an Intel Mac (even with an AMD card)
and on machines without a compatible GPU, Ollama runs on the processor: use `qwen3:4b` and expect a few seconds per
answer. Do not say the machine "has no GPU" without checking (`system_profiler SPDisplaysDataType` on macOS,
`nvidia-smi` on Linux/Windows).

## 4. Focus mode with the webcam

```bash
npm run focus:install   # MediaPipe detector (~8 MB) in data/focus/; the app's Focus button does it too
```

Overview and the limits of each distraction: `docs/FOCUS.md`.

## When something does not work

| Symptom                                                       | Likely cause and what to do                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Microphone or camera does not turn on                         | Open via `http://localhost:3040` or `http://127.0.0.1:3040` (secure origins). Allow it in the padlock of the address bar. **macOS:** System Settings → Privacy & Security → Microphone / Camera → turn on the browser and reopen it |
| Ana says "script mode"                                        | Ollama is not running or has no model: open Ollama and run `npm run feynman:install`. Check with `curl http://127.0.0.1:11434/api/tags`                                                                                             |
| Ana does not speak (text only)                                | Kokoro not installed: `npm run voice:install`                                                                                                                                                                                       |
| "The listener is not installed" / speech does not become text | `npm run feynman:install`; and `ffmpeg -version` must work                                                                                                                                                                          |
| Whisper gets technical terms wrong                            | The `cues` in `feynman.json` become a vocabulary hint: include the spoken form ("h times"). On a good machine, `FEYNMAN_WHISPER=medium` in `.env` (and run the installer again)                                                     |
| Ana takes too long                                            | The model is too big for the machine: `FEYNMAN_MODEL=qwen3:4b` (or `gemma3:4b`)                                                                                                                                                     |
| Focus mode does not notice the phone                          | Open the camera preview in the widget: the diagnostics panel shows the numbers. Redo the calibration looking at the screen; try the "Strict" sensitivity                                                                            |
| Focus mode nudges for no reason                               | "Light" sensitivity; good light on the face; camera at eye level; recalibrate                                                                                                                                                       |
| Video with no sound or the render failed                      | The [generate-videos](../generate-videos/SKILL.md) skill                                                                                                                                                                            |

After changing `.env`, restart `npm run dev`.

## Uninstall

| What              | How                                                                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Voice and Whisper | delete `data/voice/`                                                                                                   |
| Focus detector    | delete `data/focus/`                                                                                                   |
| An Ollama model   | `ollama rm <model>`                                                                                                    |
| All of Ollama     | macOS: app to the trash and `rm -rf ~/.ollama` (or `brew uninstall ollama`); Windows: `winget uninstall Ollama.Ollama` |
| Student progress  | `data/progress.sqlite`: **ask first**; deleting it resets XP and certificates and cannot be undone                     |

## When you finish

Tell the person, in a few lines, what is on and what was left out (and what they gain if they turn it on later). Test
what you can from the terminal: `npm run voice:test`, `curl http://127.0.0.1:11434/api/tags` and, with the app running,
`curl http://127.0.0.1:3040/api/focus/models`.

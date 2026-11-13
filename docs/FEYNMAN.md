# Feynman lesson: teach Mandy

In every module, between the last lesson and the checkpoint, there is a **Feynman** block. The student explains the
module's central topic out loud to **Mandy**, an AI with a voice that listens, asks questions, asks for examples and
corrects what is wrong, in the style of a conversational assistant (think of Iron Man's Jarvis). It is the technique
credited to Richard Feynman: whoever can explain something in simple words truly understood it; where the explanation
gets stuck, that is the gap.

## Principles

1. **Nothing leaves the machine.** Speech is transcribed by a local Whisper (`faster-whisper`), the brain is an open
   model running on [Ollama](https://ollama.com) and the voice is Kokoro (Mandy's voice depends on the course language:
   `af_heart` in English, `pf_dora` in Portuguese). No audio or transcript is saved; only the result is kept (score
   and points covered).
2. **The check is anchored in the course.** The AI that writes the course also writes `module-N/feynman.json`: the
   topic, the key points a good explanation must have, the common mistakes with their correction and the follow-up
   questions. Mandy receives this answer key and the summaries of the module's lessons. She does not correct by what she
   "thinks"; she corrects by what was taught.
3. **It works without Ollama, only simpler.** With no model installed, Mandy enters **script mode**: she checks the speech
   against the cues of each key point and asks the ready-made questions. It is not a free conversation, but the exercise
   happens.
4. **It does not block the course.** The checkpoint stays unlocked without the Feynman block (Ollama is optional).
   Passing the Feynman block gives XP: explaining is learning.

## The flow

1. On the path, after the module's lessons, the **Teach Mandy** step appears.
2. The screen shows the topic and the request ("explain it as if to a friend who has never seen this"). An animated orb
   is Mandy: cyan when listening (it reacts to the microphone volume), purple and spinning when thinking, gold and
   pulsing when speaking.
3. Mandy opens the conversation. The microphone turns on by itself when she finishes speaking; a pause of ~1.5 s of
   silence ends the student's turn (or the "Done, I spoke" button).
4. Each utterance goes to `POST …/feynman/listen` (local Whisper) and then to `POST …/feynman/conversation`. The brain
   returns JSON: Mandy's short answer, the key points the utterance covered and, if there was one, the correction of a
   mistake. The answer becomes voice (`POST /api/voice/speak`, with Mandy's voice) and the "3 of 5 key ideas" counter
   goes up.
5. "I finished the explanation" → `POST …/feynman/evaluate`: a score from 0 to 100, each point (covered, partial,
   missing) with a comment, the mistakes that came up and a piece of advice. With 70 or more, the block is passed and
   gives XP.

## The `module-N/feynman.json` file

Written by the course AI (the **Feynman Teacher** role), validated by `feynmanSchema` in `shared/feynman.ts`:

| Field            | What                                                                                                                                                                      |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `topic`          | the central topic the student will explain                                                                                                                                |
| `request`        | the instruction the student reads before starting                                                                                                                         |
| `opening`        | Mandy's first line                                                                                                                                                        |
| `keyPoints`      | 3 to 7: `id`, `idea` (what the explanation must say), `cues` (words and phrases that show the idea, for script mode), `question` (to draw out the point if it is missing) |
| `commonMistakes` | 1 to 6: `error` and `correction`                                                                                                                                          |
| `questions`      | 2 to 6 follow-up questions ("what if…", "why…")                                                                                                                           |
| `skills`         | the ids of the module skills the block exercises                                                                                                                          |

## Where each part lives

| File                         | What                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------- |
| `shared/feynman.ts`          | the file schema, pedagogical rules, conversation and evaluation types, passing score                  |
| `server/feynman/context.ts`  | builds Mandy's prompt from the answer key and the lessons (pure function)                             |
| `server/feynman/script.ts`   | script mode: cues, next question, evaluation without AI (pure function)                               |
| `server/feynman/brain.ts`    | the Ollama client (model choice, JSON output with a schema) and the fallback to script mode           |
| `server/feynman/listener.ts` | the local Whisper: a long-lived Python process (`voice/whisper_worker.py`), audio converted by ffmpeg |
| `server/routes/feynman.ts`   | the block's routes and `POST /api/voice/speak`                                                        |
| `scripts/feynman.ts`         | `npm run feynman:install`: Whisper + the Ollama model                                                 |
| `web/src/feynman/`           | microphone with silence detection, speech queue and the orb                                           |
| `web/src/pages/Feynman.tsx`  | the screen                                                                                            |

## Implementation steps

1. Plan (this file).
2. `shared/feynman.ts` + tests.
3. Course reading: `feynman.json` in the repository, in `course:status`, in `course:validate`, in the AI's next step, in
   `course:schemas`; XP `feynman_passed`; database v3.
4. Server: context, script, brain (Ollama), listener (Whisper), routes, voice with Mandy's voice.
5. `npm run feynman:install`.
6. Front end: microphone, speech, orb, screen, step in the table of contents.
7. Content: `module-1/feynman.json` for the three sample courses.
8. Docs for the AIs: AGENTS.md, skills (create-course, continue-course), the `feynman.md` reference, CONTENT.md,
   README.
9. Verification: typecheck, tests, `npm run verify`, test of the transcription and of script mode.

## Requirements and limits

- **Whisper:** the `small` model (~460 MB, downloaded once). On an old Intel i9, 23 s of speech becomes text in ~3.6 s.
  `FEYNMAN_WHISPER` in `.env` picks another size.
- **Ollama:** the default model is chosen among the installed ones, in this order: `qwen3:8b`, `qwen3:4b`,
  `llama3.1:8b`, `gemma3:4b` (or `FEYNMAN_MODEL` in `.env`). On a processor without a GPU, an 8B answer takes several
  seconds; the 4B is the option for a weak machine.
- **Microphone:** the browser asks for permission; `127.0.0.1` counts as a secure origin.

## Ask the teacher (any course)

The same pieces (Whisper, Ollama, Kokoro) also power **Ask the teacher**: a page of each course
(`/courses/:id/teacher`, button on the course page) where the student talks with Mandy as the course teacher, about the
whole course or about one lesson picked from a list (`?lesson=m1-a2` opens with it chosen).

- **Routes:** `GET /api/courses/:id/teacher` (what Mandy can do, the course language and the lessons she can talk
  about), `POST /api/courses/:id/teacher` (`{ history, lessonId }` → Mandy's answer; `lessonId` null means the whole
  course), `POST /api/courses/:id/teacher/listen?lesson=…` (audio → text). Code: `shared/teacher.ts`,
  `server/teacher/teacher.ts`, `server/routes/teacher.ts`, `web/src/pages/Teacher.tsx`.
- **What Mandy reads:** for the whole course, the syllabus (summary, results, every module with its goal and lesson
  titles) plus every lesson the student can already open; for one lesson, only that lesson. Exercise answer keys and
  hints never enter the material, and the instruction forbids giving the final answer to an exercise.
- **Without Ollama (script mode):** Mandy finds the excerpt that shares the most words with the question (by root, so
  plurals match) and reads its first sentences, saying where it came from ("Module 4: …", "Lesson — part"). If nothing
  matches, she says the course does not cover it.
- **Voice:** it starts only when the student clicks "Talk by voice" (browsers need a click to play sound and use the
  microphone). The microphone is held only while the student speaks.
- **Privacy:** no audio, transcript or question is stored.

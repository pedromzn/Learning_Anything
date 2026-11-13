# Feynman block: `courses/<slug>/module-N/feynman.json`

Between the last lesson and the checkpoint, the student **explains out loud** the module's central topic to **Mandy**,
an AI with a voice that listens, asks and corrects (the Feynman technique). You do not write the conversation: you write
the **answer key** that anchors Mandy to what the module taught. Schema: `feynmanSchema` in `shared/feynman.ts`.
Overview: `docs/FEYNMAN.md`.

Mandy uses the file in two ways:

- **With Ollama** (a local model): it gets the answer key and the summary of the lessons, talks freely and corrects
  against the answer key.
- **Without Ollama** (script mode): it checks the student's speech against each point's `cues` and asks the ready-made
  `question` of the next missing point. That is why the cues and the questions matter as much as the ideas.

## Fields

| Field            | Rule                                                                                                                 |
| ---------------- | -------------------------------------------------------------------------------------------------------------------- |
| `topic`          | text(200): the module's central topic, in a sentence the student understands                                         |
| `request`        | text(600): the instruction the student reads ("explain it to a friend who has never seen..."), asking for an example |
| `opening`        | text(400): Mandy's first line, short, curious, ending in a question. It is spoken: **no `$` and no LaTeX**           |
| `keyPoints`      | 3 to 7 points (see below)                                                                                            |
| `commonMistakes` | 1 to 6: `error` text(300), `correction` text(400). Mistakes students really make on this topic                       |
| `questions`      | 2 to 6 follow-up questions: "why", "what if", "give me an example", "read this word"                                 |
| `skills`         | 1 to 8 skill ids **from the module itself** (the validator checks)                                                   |

Each key point:

| Field      | Rule                                                                                                                                       |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`       | `^[a-z0-9-]{2,40}$`, unique in the file                                                                                                    |
| `idea`     | text(300): what a good explanation MUST say, in one sentence, faithful to the lessons                                                      |
| `cues`     | 2 to 10 short words or phrases (up to 60) that show the idea in speech, with no repeats (the validator compares ignoring accents and case) |
| `question` | text(300): the question Mandy asks if the point does not come up. It does not give the answer away                                         |

## How to write it well

- **The points are the skeleton of the module**, not details: what someone has to say to prove they understood. Cover
  the module's skills; 4 or 5 points is ideal.
- **Cues are what the student SAYS**, not what the book writes. Speech becomes text through Whisper, with no symbols:
  think "h times the frequency", "photons", "two slits", not "E=hf". Include synonyms and the casual form. A single cue
  counts as "partial" in script mode; two or more, "covered". Avoid generic cues that show up in any sentence ("light",
  "letter"): they give points away for free.
- **A correct, checkable idea**: no fact, number or formula that the module's lessons did not teach. Mandy will correct
  the student against it; a mistake here turns into a wrong correction.
- **Real common mistakes**, each with the correction in one sentence. Those are what Mandy watches for.
- **Questions that make you think**: they ask for an example, a cause, a contrast or an application, never a memorized
  "what is X?".
- **An opening in the role of someone who wants to learn**: Mandy introduces herself and asks the first question. In the
  course's language (`brief.language`), in spoken language.

## Minimal valid example

```json
{
  "topic": "Why light, which was a wave, is also made of photons",
  "request": "Explain to a curious friend why light looked like a wave, what stopped fitting, and how the photon solved it. Use an everyday example.",
  "opening": "Hi, I'm Mandy. I always heard that light is a wave, but then people talk about photons and I get lost. Can you explain it from the start?",
  "keyPoints": [
    {
      "id": "light-wave",
      "idea": "Light shows interference: in Young's two slits, bright and dark bands appear, as with a wave.",
      "cues": ["interference", "two slits", "young", "bright bands"],
      "question": "Which experiment convinced physicists that light was a wave?"
    },
    {
      "id": "photon-energy",
      "idea": "Light exchanges energy in packets, the photons, each with energy h times the frequency.",
      "cues": ["photon", "packets", "planck constant", "h times"],
      "question": "What does the energy of each photon depend on?"
    },
    {
      "id": "intensity",
      "idea": "Intensity changes how many photons arrive; frequency changes the energy of each one.",
      "cues": ["intensity", "how many photons", "more photons", "coin"],
      "question": "Does a brighter light have more energetic photons?"
    }
  ],
  "commonMistakes": [
    {
      "error": "Brighter light has photons with more energy.",
      "correction": "Brighter means more photons; the energy of each one depends on the frequency."
    }
  ],
  "questions": ["Why does a blue photon have more energy than a red one?", "What if light were only a wave?"],
  "skills": ["m1-photon-energy"]
}
```

After writing it: `npm run course:validate -- <slug> --module N`.

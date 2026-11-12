# Video script: `courses/<slug>/module-N/lesson-M.json` (a lesson with `type: "video"`)

The video lesson's file is the **script**: a list of typed scenes. **You do not write drawing code.** You pick the scene
type and fill in the data; the app (Remotion) draws it in blackboard style, and the local voice speaks the `narration`.
Schema: `scriptSchema`, `sceneSchema` and the `checkScript` rule in `shared/video.ts`. Everything is `.strict()`.

The video shows **concept and intuition**. The precise definition and the worked example stay in the text lesson.

## Duration and pace rules

- **4 to 7 minutes** (the validator rejects under 3.5 and over 9). The estimate: ~150 words of narration per minute,
  plus 1.2 s per scene. Target: **600 to 1000 words** of narration in total, across 8 to 14 scenes.
- The first scene is `title` (only that one). **1 to 3 `question` scenes**, never the first. One question every 2 or 3
  minutes of explanation, about what was just explained.
- 4 to 16 scenes. One idea per scene.

## The narration

- It is what the voice says. Natural sentences, in the course's language (`brief.language`), like a teacher
  explaining. It describes what is on screen at that moment.
- **No LaTeX, no `$`, no symbols**: write "x squared", not "x^2"; "arrow to the right", not "→". The validator rejects
  narration with `\command` or `$`.
- Numbers and acronyms as they are spoken ("three point one four", "pee aitch"). Words in another alphabet: write the
  approximate pronunciation in the narration and leave the original on screen.
- Straight to the point: no "in this video we will see". Concrete examples.
- Up to 1400 characters per scene.

## The seven scene types

| Type       | Fields (those marked with \* are required)                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `title`    | `title`\* (up to 120), `subtitle` (up to 160), `narration`\*                                                                                                                         |
| `bullets`  | `title`\* (up to 120), `bullets`\* (2 to 5 texts of up to 140; they appear one at a time), `narration`\*                                                                             |
| `equation` | `lines`\* (1 to 5 of LaTeX up to 200; built up in sequence), `captions` (up to 200), `narration`\*                                                                                   |
| `code`     | `lang`\* (`cpp`, `c`, `python`, `javascript`, `pseudocode`), `code`\* (up to 1600, ~20 lines), `highlights` (up to 8 line numbers, 1 = first), `narration`\*                         |
| `diagram`  | `title` (up to 120), `nodes`\* (2 to 8: `id` `[a-z0-9-]` up to 30 and `label` up to 60), `links`\* (up to 10: `from`, `to`, `label`; `from` and `to` are `nodes` ids), `narration`\* |
| `chart`    | `title`, `func`\* (up to 120), `xMin`\*, `xMax`\* (greater than `xMin`), `label` (up to 80), `narration`\*                                                                           |
| `question` | `item`\* (an exact-grading item, see [exercises.md](exercises.md)), `narration`\*                                                                                                    |

- **`equation`** uses LaTeX (KaTeX) in the `lines`; the `narration` speaks in words.
- **`chart`**: `func` only accepts numbers, `x`, `+ - * / ^`, parentheses, `pi`, `e` and
  `sin cos tan exp log ln sqrt abs`. No other variables and no code. Example: `"x^2 - 2*x + 1"`.
- **`diagram`**: a link to an id that does not exist is an error.
- **`question`**: the video pauses at the **end of the previous scene**. If the student gets it wrong, it goes back to
  the start of the previous scene; so the previous scene must contain the explanation that answers it. The question
  uses exact grading (no `open`); question ids are unique in the video. The `narration` introduces the question
  ("Pause and answer: ...").

## Format example (5 scenes)

**Note:** this example shows the format, but the narrations are short, so it **would not pass** the duration rule (the
validator would say the video is about 1 minute). A real script has 600 to 1000 words of narration. To count: `wc -w`
on the narration, or let the validator estimate.

```json
{
  "title": "Cyrillic in three groups",
  "scenes": [
    {
      "type": "title",
      "title": "Cyrillic in three groups",
      "subtitle": "Russian from scratch, module 1",
      "narration": "Today you start reading Russian. The alphabet has thirty-three letters, and you already know a good part of them."
    },
    {
      "type": "bullets",
      "title": "Group 2: the false friends",
      "bullets": ["В sounds like «v»", "Н sounds like «n»", "Р sounds like «r»"],
      "narration": "Watch out for the false friends. The letter that looks like a B sounds like v. The one that looks like an H sounds like n. And the one that looks like a P sounds like r."
    },
    {
      "type": "question",
      "item": {
        "type": "multiple_choice",
        "id": "v1-false-friend-n",
        "skill": "m1-letter-sounds",
        "bloom": "understand",
        "difficulty": 1,
        "prompt": "The Russian letter Н looks like an H. What is its sound?",
        "hints": ["It is in the false friends group."],
        "choices": [
          {
            "text": "It sounds like «h»",
            "explanation": "That is the trap: the rough h sound belongs to the letter Х."
          },
          { "text": "It sounds like «p»", "explanation": "The p sound belongs to П." },
          { "text": "It sounds like «n»", "explanation": "Yes: Н sounds «n», as in «нос»." }
        ],
        "correct": 2,
        "solution": "Н sounds «n». That is why «нос» is read «nos»."
      },
      "narration": "Time for a test. Pause the video and answer: the Russian letter that looks like an H, what is its sound?"
    },
    {
      "type": "diagram",
      "title": "How to read a new word",
      "nodes": [
        { "id": "word", "label": "New word" },
        { "id": "letters", "label": "Split the letters" },
        { "id": "sounds", "label": "Give each one its sound" }
      ],
      "links": [
        { "from": "word", "to": "letters", "label": "" },
        { "from": "letters", "to": "sounds", "label": "" }
      ],
      "narration": "To read a new word, split the letters and give each one its sound. Then just put them together."
    },
    {
      "type": "chart",
      "title": "A parabola, just as a format example",
      "func": "x^2 - 2*x + 1",
      "xMin": -2,
      "xMax": 4,
      "label": "f of x equals x squared minus two x plus one",
      "narration": "This chart shows a parabola that touches the horizontal axis at the point x equals one."
    }
  ]
}
```

The `equation` and `code` types follow the same mold:

```json
{
  "type": "equation",
  "lines": ["v = \\frac{\\Delta s}{\\Delta t}", "v = \\frac{100}{20} = 5"],
  "captions": "Average speed",
  "narration": "Average speed is the change in position divided by the change in time. With one hundred meters in twenty seconds, it comes to five meters per second."
}
```

```json
{
  "type": "code",
  "lang": "python",
  "code": "for i in range(3):\n    print(i)",
  "highlights": [1, 2],
  "narration": "The for loop repeats the block three times. First we highlight the loop, then what it prints."
}
```

A real, complete example: `courses/russo-basico/module-1/lesson-1.json` (a course written in Portuguese).

## What the validator checks (`checkScript`)

1 to 3 questions; the first scene is not a question; exact-grading questions with distinct ids; no diagram link to a
node that does not exist; `xMax > xMin`; a `func` the interpreter accepts; narration without LaTeX; duration between 3.5
and 9 minutes.

## Frequent mistakes

- Narration with `x^2`, `\frac`, `$`: replace them with words.
- A script too short (few words) or too long.
- A question right in the first scene, or 4 questions.
- A `diagram` whose `from`/`to` do not match the nodes' `id`s.
- A question whose content was not explained in the previous scene.
- Several `bullets` scenes in a row: alternate with diagram, equation or code.

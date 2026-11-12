# Exercises: `courses/<slug>/module-N/lesson-M.json` (a lesson with `type: "exercises"`)

Schemas: `exercisesLessonSchema` and `itemSchema` (and the `checkItems` rule) in `shared/course.ts`. The same **item**
format is used for the questions in text lessons, in the checkpoint and in the video's `question` scenes.

## How to write the list

- **8 to 15 items**, from guided to free: the first ones with more support, the last ones with none.
- **20% to 30%** of the items revisit skills from earlier modules (interleaving), when there are any.
- Each item: the `skill` it measures, `bloom`, `difficulty` (1 to 3), up to 3 `hints` (from the lightest to the one that
  almost gives it away, **never the answer**) and the commented `solution` (shown after the attempt).
- **Multiple choice**: 3 to 6 choices, each with an `explanation`. The distractor is a real common mistake. **Vary the
  position of the correct choice** across items; the validator complains if, with 4 or more multiple-choice items, it
  always lands in the same place.
- Prefer exact grading. Use `open` only when the skill is explaining or creating, and always with a rubric.
- **Redo every numeric calculation** before saving. Code: check that it runs and prints what the item says.
- The app **hides the answer key** until the answer; it shuffles `ordering`. That is why `steps` already goes in the
  right order.
- Write in the course's language (`brief.language`).

## Fields common to every item

| Field        | Rule                                                                              |
| ------------ | --------------------------------------------------------------------------------- |
| `id`         | `[a-z0-9-]`, 2 to 40 characters, **unique** in the lesson (and in the checkpoint) |
| `skill`      | text of up to 60 (use the id from the syllabus)                                   |
| `bloom`      | `remember`, `understand`, `apply`, `analyze`, `evaluate`, `create`                |
| `difficulty` | integer from 1 to 3                                                               |
| `prompt`     | 1 to 2500                                                                         |
| `hints`      | up to 3 texts of up to 500 (default `[]`)                                         |
| `solution`   | 1 to 4000                                                                         |

## The six types (each example is a valid item)

**`multiple_choice`** (graded by the app). `correct` is the index (0 to 5) in `choices`.

```json
{
  "type": "multiple_choice",
  "id": "ex-false-friend",
  "skill": "m1-recognize-letters",
  "bloom": "remember",
  "difficulty": 1,
  "prompt": "Which of these letters looks Latin but has a different sound?",
  "hints": ["One of the options looks like an H."],
  "choices": [
    { "text": "К", "explanation": "К sounds «k»: it is a friendly letter." },
    { "text": "М", "explanation": "М sounds «m»: it is a friendly letter." },
    { "text": "Н", "explanation": "Right: Н looks like an H, but sounds «n»." }
  ],
  "correct": 2,
  "solution": "Н is the false friend: it looks like H and sounds «n»."
}
```

**`true_false`** (graded). `correct` is `true` or `false`.

```json
{
  "type": "true_false",
  "id": "ex-tf-r",
  "skill": "m1-letter-sounds",
  "bloom": "remember",
  "difficulty": 1,
  "prompt": "True or false: the letter Р sounds like the English «p».",
  "hints": [],
  "correct": false,
  "solution": "False: Р looks like a P, but sounds «r», a rolled r."
}
```

**`numeric`** (graded). `answer` is a finite number; `tolerance` is absolute (0 = exact); `unit` is optional. The app
accepts "3,14" and "3.14".

```json
{
  "type": "numeric",
  "id": "ex-total-letters",
  "skill": "m1-recognize-letters",
  "bloom": "remember",
  "difficulty": 1,
  "prompt": "How many letters does the Russian Cyrillic alphabet have?",
  "hints": ["It is a number between 30 and 35."],
  "answer": 33,
  "tolerance": 0,
  "unit": "",
  "solution": "The Russian alphabet has 33 letters."
}
```

**`short_answer`** (graded). `accepted` lists the accepted forms (1 to 12); the comparison ignores case, accents, extra
spaces and final punctuation. List the reasonable variations.

```json
{
  "type": "short_answer",
  "id": "ex-read-tam",
  "skill": "m1-read-words",
  "bloom": "apply",
  "difficulty": 1,
  "prompt": "How do you read «там»? Write it in Latin letters.",
  "hints": [],
  "accepted": ["tam", "там"],
  "solution": "Т = t, А = a, М = m: «tam»."
}
```

**`ordering`** (graded). `steps` (3 to 8, **no repeats**) already in the RIGHT ORDER.

```json
{
  "type": "ordering",
  "id": "ex-reading-order",
  "skill": "m1-read-words",
  "bloom": "apply",
  "difficulty": 2,
  "prompt": "Put in order the steps to read a new word in Russian.",
  "hints": ["The first step is to look at the letters."],
  "steps": [
    "Split the letters",
    "Give the sound of each letter",
    "Put the sounds together in order",
    "Compare with a word you know"
  ],
  "solution": "First the letters, then the sounds, then putting them together and, finally, the comparison."
}
```

**`open`** (NOT graded by the app; the person checks it against the `rubric`). `rubric` with 2 to 8 criteria.

```json
{
  "type": "open",
  "id": "ex-explain-reduction",
  "skill": "m1-stress-and-reduction",
  "bloom": "understand",
  "difficulty": 2,
  "prompt": "Explain in your own words why the О in «вода» sounds like «a».",
  "hints": [],
  "rubric": ["Says the О is outside the stressed syllable.", "Says unstressed vowels are reduced in Russian."],
  "solution": "In «вода́» the stress falls on the last syllable. The О in the first syllable is unstressed and is reduced to «a»."
}
```

## The lesson file

| Field      | Limit                                                    |
| ---------- | -------------------------------------------------------- |
| `guidance` | 1 to 800: how to use the list, in two or three sentences |
| `items`    | **8 to 15** items                                        |

```json
{
  "guidance": "Practice recognizing the letters and reading short words. The first items have more support. Use the hints if you get stuck: they give you a push, but they do not give the answer away.",
  "items": ["... 8 to 15 items of the types above ..."]
}
```

(The `"..."` above is only an illustration: in the real file, `items` is a list of 8 to 15 objects.) A complete example:
`courses/russo-basico/module-1/lesson-3.json` (a course written in Portuguese).

## What the validator checks (`checkItems`)

- Repeated ids.
- `correct` outside the choices.
- `ordering` with repeated steps.
- With 4 or more multiple-choice items, the correct choice in the same position in all of them.

## Frequent mistakes

- An extra field (`answer` in a multiple-choice item, `choices` in a true/false): `.strict()` rejects it.
- A negative `tolerance`; `answer` as text instead of a number.
- An empty `accepted`.
- A hint that gives the answer away.
- Two defensible choices (an ambiguous item).

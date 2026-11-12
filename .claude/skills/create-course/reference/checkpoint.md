# Checkpoint: `courses/<slug>/module-N/checkpoint.json`

The short test that closes the module. The student needs **80%** to move on. Schema: `checkpointSchema` in
`shared/course.ts`.

## Rules

- **5 to 8 items**, exact grading only: `multiple_choice`, `true_false`, `numeric`, `short_answer`, `ordering`.
  **`open` is rejected.**
- Cover the module's skills (each one in at least one item) and, if there are any, one or two from earlier modules.
- **New** items, not copies of the exercises: same content, different situation. Mix difficulties 1 to 3, weighted
  toward 2.
- Format of each item: the same as in [exercises.md](exercises.md). `hints` may be `[]` (the checkpoint decides whether
  the person moves on). Unique ids in the file; vary the position of the correct choice.
- An answer key with no ambiguity: if a reviewer argues about the answer, rewrite the item.
- Write in the course's language (`brief.language`).

## Format

```json
{ "items": ["... 5 to 8 exact-grading items ..."] }
```

## Minimal valid example (5 items)

```json
{
  "items": [
    {
      "type": "multiple_choice",
      "id": "cp-false-friend",
      "skill": "m1-recognize-letters",
      "bloom": "remember",
      "difficulty": 1,
      "prompt": "Which letter looks Latin but sounds different?",
      "hints": [],
      "choices": [
        { "text": "К (sounds «k»)", "explanation": "К sounds «k»." },
        { "text": "М (sounds «m»)", "explanation": "М sounds «m»." },
        { "text": "Н (sounds «n»)", "explanation": "Right: Н looks like H and sounds «n»." }
      ],
      "correct": 2,
      "solution": "Н is a false friend: it looks like H and sounds «n»."
    },
    {
      "type": "multiple_choice",
      "id": "cp-sound-sh",
      "skill": "m1-letter-sounds",
      "bloom": "remember",
      "difficulty": 1,
      "prompt": "Which Russian letter has the «sh» sound of «shop»?",
      "hints": [],
      "choices": [
        { "text": "Ш", "explanation": "Right: Ш sounds like the «sh» in shop." },
        { "text": "Ч", "explanation": "Ч sounds «ch», as in church." },
        { "text": "Ц", "explanation": "Ц sounds «ts»." }
      ],
      "correct": 0,
      "solution": "Ш sounds like the «sh» in shop."
    },
    {
      "type": "true_false",
      "id": "cp-tf-final",
      "skill": "m1-signs-and-voicing",
      "bloom": "understand",
      "difficulty": 2,
      "prompt": "True or false: at the end of a word, a voiced consonant like Д sounds «t».",
      "hints": [],
      "correct": true,
      "solution": "True: at the end of a word a voiced consonant becomes voiceless («друг» sounds «druk»)."
    },
    {
      "type": "numeric",
      "id": "cp-total-letters",
      "skill": "m1-recognize-letters",
      "bloom": "remember",
      "difficulty": 1,
      "prompt": "How many letters does the Russian alphabet have?",
      "hints": [],
      "answer": 33,
      "tolerance": 0,
      "unit": "",
      "solution": "There are 33 letters."
    },
    {
      "type": "short_answer",
      "id": "cp-read-nos",
      "skill": "m1-read-words",
      "bloom": "apply",
      "difficulty": 2,
      "prompt": "How do you read «нос» (nose)? Write it in Latin letters.",
      "hints": [],
      "accepted": ["nos", "нос"],
      "solution": "Н = n, О = o, С = s: «nos»."
    }
  ]
}
```

A real example: `courses/russo-basico/module-1/checkpoint.json` (a course written in Portuguese).

## Frequent mistakes

- An `open` item (the checkpoint rejects it).
- Fewer than 5 or more than 8 items.
- Repeated ids, or ids equal to those of a lesson in the same module (use the `cp-` prefix).
- A module skill that no item covers.

# Text lesson: `courses/<slug>/module-N/lesson-M.json` (a lesson with `type: "text"`)

Schema: `textLessonSchema` in `shared/course.ts`. Everything is `.strict()`: no extra fields.

## How to write it

- A short **introduction**: what the person will be able to do at the end. If the lesson follows a bibliography source
  closely, say which one and where (lesson, chapter), and mention that the original is free.
- **2 to 6 sections.** Each one explains **ONE idea** and ends with a self-explanation question (`question`) that makes
  the person think about what they read. Good types for the question: `multiple_choice`, `true_false`, `numeric`,
  `short_answer`.
- A **worked example** with separate steps: the app shows one at a time and the person tries before looking.
- A **summary** of 2 to 6 points.
- `markdown` accepts Markdown, tables, KaTeX (`$x^2$`, `$$\int_0^1 x\,dx$$`) and code blocks with the language
  (` ```python `). In JSON, line breaks are `\n` and LaTeX backslashes must be doubled (`\\frac`).
- Short sentences, concrete examples, no filler. Explain the why, not just the how.
- Original: explain in your own words. No copied passages. Literal quotes only when short, in quotation marks, with the
  source.
- Write in the course's language (`brief.language`).
- The `skill` of each question is an id from the syllabus (or a text of up to 60 characters).

## Limits

| Field           | Limit                                                                                                         |
| --------------- | ------------------------------------------------------------------------------------------------------------- |
| `introduction`  | 1 to 1500                                                                                                     |
| `sections`      | 2 to 6: `title` (up to 160), `markdown` (up to 8000), `question` (one item, see [exercises.md](exercises.md)) |
| `workedExample` | `prompt` (up to 2500) and `steps` (2 to 10 texts of up to 2000)                                               |
| `summary`       | 2 to 6 texts of up to 300                                                                                     |

## Minimal valid example

```json
{
  "introduction": "By the end of this lesson you can give the sound of the friendly letters and read short words. The table follows the alphabet lesson of the open Russian book on Wikibooks (Russian/Alphabet), which you can open for free.",
  "sections": [
    {
      "title": "The friendly letters",
      "markdown": "The **friendly letters** look like ours and sound like them:\n\n- **А а** sounds like the «a» in *father*.\n- **К к** sounds like «k».\n- **М м** sounds like «m».\n- **Т т** sounds like «t».\n\nWith them you can already read «там» (tam, *there*).",
      "question": {
        "type": "short_answer",
        "id": "t-read-tam",
        "skill": "m1-read-words",
        "bloom": "apply",
        "difficulty": 1,
        "prompt": "How do you read the word «там»? Write it in Latin letters.",
        "hints": ["They are three friendly letters: Т, А, М."],
        "accepted": ["tam", "там"],
        "solution": "Т = t, А = a, М = m: «tam»."
      }
    },
    {
      "title": "The false friends",
      "markdown": "Some letters **look Latin but have another sound**:\n\n- **В в** sounds like «v».\n- **Н н** sounds like «n».\n- **Р р** sounds like «r».\n\nThat is why «рот» (mouth) is read «rot», not «pot».",
      "question": {
        "type": "multiple_choice",
        "id": "t-read-rot",
        "skill": "m1-read-words",
        "bloom": "apply",
        "difficulty": 1,
        "prompt": "How do you read the word «рот»?",
        "hints": ["The first letter is a false friend."],
        "choices": [
          { "text": "«pot»", "explanation": "Р looks like a P, but sounds like r." },
          { "text": "«rot»", "explanation": "Right: Р = r, О = o, Т = t." },
          { "text": "«rom»", "explanation": "The last letter is Т (t), not М (m)." }
        ],
        "correct": 1,
        "solution": "Р = r, О = o, Т = t: «rot»."
      }
    }
  ],
  "workedExample": {
    "prompt": "Read the word «нос» (nose).",
    "steps": [
      "Split the letters: Н, О, С.",
      "Give the sound of each one: Н = n, О = o, С = s (they are false friends).",
      "Put the sounds together: «nos»."
    ]
  },
  "summary": [
    "The friendly letters sound like ours.",
    "The false friends look Latin and sound different: В, Н, Р, С, У, Х."
  ]
}
```

A real, complete example: `courses/russo-basico/module-1/lesson-2.json` (a course written in Portuguese).

## Frequent mistakes

- Only one section, or more than 6.
- An `open` question inside a section: use exact grading.
- A forgotten `\n` (JSON does not accept a line break inside a string) or `\frac` without the double backslash.
- An extra field such as `source` or `title` at the root.
- `correct` pointing to a choice that does not exist.

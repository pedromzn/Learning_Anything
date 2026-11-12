# Syllabus: `courses/<slug>/syllabus.json`

All the planned modules of the course, in the method of a great university: prerequisite order, lessons of three types,
skills and one project per module. Schema: `syllabusSchema` (plus the rules of `checkSyllabus`) in `shared/course.ts`.
Everything is `.strict()`.

## How to design it

- About one module per week of study (`hoursPerWeek` and `deadlineWeeks` from the brief).
- Prerequisite order: what comes later only uses what came before.
- **Lessons** (3 to 9 per module), three types:
  - `video`: concept and intuition, 4 to 7 minutes.
  - `text`: precise definition and worked example.
  - `exercises`: the practice.
    Typical sequence: video, text, exercises, repeated.
- **The position in the list is the file number:** the 1st lesson of module 2 becomes `module-2/lesson-1.json`, and so
  on.
- **Skills**: an `id` of 3 to 60 characters `[a-z0-9-]`, unique across the whole course (prefix it with `m<N>-`), a
  `name` and a `bloom` (`remember`, `understand`, `apply`, `analyze`, `evaluate`, `create`). Respect the level's
  ceiling: basic up to `understand`, intermediate `analyze`, advanced `evaluate`, mastery `create`.
- Each module's **project**: `title`, `prompt` (up to 3000) and `rubric` (2 to 8 observable criteria).
- The `results` start with "By the end you can…" and are measurable.
- The `bibliography` comes from the dossier (same references, same addresses).

## Rules the validator checks (`checkSyllabus`)

1. Every module has an exercises lesson and **at least 30%** of its lessons are `exercises`.
2. Every skill cited in a lesson exists in the skill list **of the same module**.
3. Every skill declared in the module is worked on in **at least one lesson**.
4. No skill `id` repeats across modules.

## Limits

| Field                    | Limit                                           |
| ------------------------ | ----------------------------------------------- |
| `title`                  | up to 160                                       |
| `summary`                | up to 1200                                      |
| `results`                | 3 to 10 texts of up to 300                      |
| `prerequisites`          | up to 8 texts of up to 300 (may be `[]`)        |
| `modules`                | 2 to 16                                         |
| `bibliography`           | 3 to 30 references (same format as the dossier) |
| module: `title` / `goal` | up to 160 / up to 500                           |
| module: `skills`         | 1 to 12                                         |
| module: `lessons`        | 3 to 9                                          |
| lesson: `title` / `goal` | up to 160 / up to 400                           |
| lesson: `skills`         | 1 to 6 ids                                      |

## Minimal valid example (2 modules of 3 lessons, 1 of them exercises)

```json
{
  "title": "Russian from scratch",
  "summary": "Learn to read the Cyrillic alphabet and hold your first everyday conversations.",
  "results": [
    "By the end you can read short Cyrillic words out loud.",
    "By the end you can introduce yourself and greet people in Russian.",
    "By the end you can understand and say prices."
  ],
  "prerequisites": ["None."],
  "modules": [
    {
      "title": "Alphabet and sounds",
      "goal": "Recognize the letters and read simple words.",
      "skills": [
        { "id": "m1-recognize-letters", "name": "Recognize the Cyrillic letters", "bloom": "remember" },
        { "id": "m1-read-words", "name": "Read short words out loud", "bloom": "apply" }
      ],
      "lessons": [
        {
          "type": "video",
          "title": "Cyrillic in three groups",
          "goal": "See the alphabet as three groups of letters.",
          "skills": ["m1-recognize-letters"]
        },
        {
          "type": "text",
          "title": "The 33 letters and their sounds",
          "goal": "Learn the sound of each letter.",
          "skills": ["m1-recognize-letters", "m1-read-words"]
        },
        {
          "type": "exercises",
          "title": "Practice: letters and sounds",
          "goal": "Practice reading words.",
          "skills": ["m1-recognize-letters", "m1-read-words"]
        }
      ],
      "project": {
        "title": "Record yourself reading",
        "prompt": "Record yourself reading 15 words from the module's list and compare with the audio from the sources.",
        "rubric": [
          "Reads the 15 words without mixing up the false friends.",
          "Notes at least three differences between your reading and the reference."
        ]
      }
    },
    {
      "title": "Greetings and introductions",
      "goal": "Greet people and introduce yourself.",
      "skills": [{ "id": "m2-greet", "name": "Greet formally and informally", "bloom": "apply" }],
      "lessons": [
        {
          "type": "video",
          "title": "Привет or здравствуйте?",
          "goal": "Pick the right greeting.",
          "skills": ["m2-greet"]
        },
        {
          "type": "text",
          "title": "Introducing yourself",
          "goal": "Say your name, origin and job.",
          "skills": ["m2-greet"]
        },
        {
          "type": "exercises",
          "title": "Practice: introductions",
          "goal": "Practice the first sentences.",
          "skills": ["m2-greet"]
        }
      ],
      "project": {
        "title": "Introduction dialogue",
        "prompt": "Write and record a six-line dialogue in which two people meet.",
        "rubric": ["Uses both the formal and the informal form of address.", "Includes name, origin and job."]
      }
    }
  ],
  "bibliography": [
    {
      "title": "Russian/Alphabet (Wikibooks)",
      "author": "Wikibooks contributors",
      "institution": "Wikibooks",
      "type": "book",
      "url": "https://en.wikibooks.org/wiki/Russian/Alphabet",
      "license": "cc-by-sa",
      "reason": "Sound table with audio."
    },
    {
      "title": "Russian (Wikibooks)",
      "author": "Wikibooks contributors",
      "institution": "Wikibooks",
      "type": "book",
      "url": "https://en.wikibooks.org/wiki/Russian",
      "license": "cc-by-sa",
      "reason": "A complete open course."
    },
    {
      "title": "Russian alphabet (Wikipedia)",
      "author": "Wikipedia contributors",
      "institution": "Wikipedia",
      "type": "article",
      "url": "https://en.wikipedia.org/wiki/Russian_alphabet",
      "license": "cc-by-sa",
      "reason": "The letters in print and handwritten form."
    }
  ]
}
```

A real course usually has 6 to 12 modules with 5 to 7 lessons each. See `courses/russo-basico/syllabus.json` (a course
written in Portuguese).

## Frequent mistakes

- A lesson cites a skill that only exists in another module.
- A declared skill that no lesson works on.
- A skill `id` repeated in different modules (the `m<N>-` prefix was forgotten).
- Too few exercises lessons (under 30%).
- A skill with a `bloom` above the ceiling of the requested level.

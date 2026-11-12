# How to contribute

Thanks for wanting to help. This project accepts code, sample courses, improvements to the AI instructions and bug
reports.

## Before you start

- Node 24 LTS (22.13 or newer works) and `ffmpeg` (only to work on video).
- `git clone`, then `npm install` and `npm run dev` (http://localhost:3040).
- Read [`AGENTS.md`](AGENTS.md) (the course flow) and the table below (where things live).

## Where things live

| Folder                                           | What it holds                                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `shared/`                                        | zod contracts (`course.ts`, `video.ts`, `gamification.ts`) and the HTTP contract (`api.ts`): the source of truth |
| `server/`                                        | Express: reading the courses, API, SQLite, local voice                                                           |
| `web/`                                           | React 19 + Tailwind 4 (the app)                                                                                  |
| `render/`                                        | Remotion: the video scenes                                                                                       |
| `scripts/`                                       | the `course:*` and `voice:*` commands                                                                            |
| `courses/`                                       | content (sample courses)                                                                                         |
| `community/courses/`                             | community courses, one `<slug>.course.json` each (`server/community/` reads, installs and shares them)           |
| `test/fixtures/`                                 | a frozen copy of two sample courses: the tests read it, never `courses/`                                         |
| `.github/`                                       | CI, CodeQL, the community check and catalog, releases, Dependabot, issue and PR templates                        |
| `.claude/skills/`, `.cursor/rules/`, `AGENTS.md` | the instructions for the AI                                                                                      |

## Verification (run before opening the pull request)

```bash
npm run typecheck
npm test
npm run course:validate -- --all
npm run verify       # the three at once
npm run format       # Prettier
```

If you changed a schema in `shared/`: run `npm run course:schemas` (updates `docs/schemas/`), adjust
[`docs/CONTENT.md`](docs/CONTENT.md) and the references in `.claude/skills/create-course/reference/`, and confirm that the
sample courses still pass.

## Conventions

- Strict TypeScript, ESM. Prettier decides the formatting; **code compacted into one line is not accepted**.
- Code, comments and docs in **English**. Interface text lives in `web/src/i18n/` (English is the base, `pt-BR.ts` the
  translation); code names follow what already exists.
- The app **does not call any AI API or voice service**: everything is local. Do not add telemetry or network calls while
  the app runs (downloading the voice with `voice:install` is the exception, and it is explicit).
- The server listens only on `127.0.0.1`. Do not change that without discussion.
- The answer key of the items **does not go to the browser** before the answer (`studentItem`). Do not break that.
- A chart's content (`func`) goes through the closed interpreter `compileFunction`: never `eval`.
- Tests: change the code, change the tests. A new test for every bug fixed.
- No secrets, e-mails or personal data in the repository. `.env` and `data/` stay out of git.

## Contributing a course

Courses are shared through the **community**, not as code: open the course in the app and press **Share in the
community** (it opens the pull request with your GitHub CLI, or hands you the file to upload). The pull request adds
only `community/courses/<slug>.course.json`; the `Community course` check validates it. Before sending it:

1. `npm run course:validate -- <slug>` with no problems;
2. sources with an **exact link** and the license the page declares; no copied text;
3. a skeptical review done ([`review.md`](.claude/skills/create-course/reference/review.md)): check the math, the answer
   keys and the links yourself, because AI makes mistakes;
4. nothing personal in it (the app already removes the brief's goal, prior knowledge and context).

Changes to the sample courses in `courses/` are code pull requests like any other.

## Pull request

- One change per PR, with a description of the problem and how you tested it.
- Show the output of `npm run verify`.
- Visual change: a screenshot helps.

## Maintainers

- `main` is protected: the CI checks must pass. Merge with **squash**, with a title that says what changed.
- Label pull requests (`feature`, `bug`, `docs`, `course`, `dependencies`): the release notes are grouped by label.
- **A release:** bump `version` in `package.json`, merge, then `git tag vX.Y.Z && git push origin vX.Y.Z`. The
  `Release` workflow runs the full verification and publishes the GitHub release with the notes.
- **A community course:** read it as a skeptical teacher (sources, licenses, answer keys, no personal data), then merge.
  The `Community catalog` workflow rebuilds `index.json` on the `community-index` branch, and the course shows up in
  everyone's Community tab within minutes. To remove one, delete its file in a pull request.

## Reporting a problem

Open an issue with: what you did, what you expected, what happened, the system (macOS, Linux or Windows), the Node
version and, if it is about video, the output of `npm run voice:test` and of `ffmpeg -version`. Do not paste personal
data.

## License

By contributing, you agree that your work is published under the project's MIT license.

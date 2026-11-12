<!-- Sharing a course? The app opens this PR for you (Course → Share in the community); only the
     community/courses/<slug>.course.json file should change. For code, fill in below. -->

## What and why

<!-- The problem this solves and how. Link the issue: "Closes #123". -->

## How I tested it

<!-- Commands, screens, systems. A screenshot helps for visual changes. -->

## Checklist

- [ ] `npm run verify` passes (types, tests, every course valid)
- [ ] `npm run format` was run
- [ ] New or changed behavior has a test; a fixed bug has a test that failed before
- [ ] Interface text is in `web/src/i18n/en.ts` **and** `pt-BR.ts`
- [ ] Schema changed? `npm run course:schemas`, `docs/CONTENT.md` and the skill references updated
- [ ] No network calls, telemetry or personal data added (see CONTRIBUTING.md)

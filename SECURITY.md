# Security

Learning Anything runs on your machine: the server listens on `127.0.0.1`, there are no accounts and the app calls
no AI API. The parts that handle outside data are the ones that matter most:

- **community course bundles** (`community/courses/*.course.json` and the in-app install), which are untrusted data;
- **text researched on the web** by your AI, which must never be treated as instructions (see `AGENTS.md`);
- the **local server** itself, if someone exposes it with `HOST=0.0.0.0`.

## Reporting a vulnerability

Please **do not open a public issue**. Use GitHub's private report:
[Security → Report a vulnerability](https://github.com/pedromzn/Learning_Anything/security/advisories/new).

Include what an attacker could do, the steps to reproduce and the version or commit. You will get an answer within
7 days. Once a fix is released, the advisory is published with credit to you, unless you prefer otherwise.

## Supported versions

Only the latest release (and `main`) receives security fixes.

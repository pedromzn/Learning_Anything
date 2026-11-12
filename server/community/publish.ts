/**
 * Sharing a course in the community: the bundle (without the personal brief fields) goes to the project's repository
 * as a pull request, opened with the person's own GitHub CLI (`gh`). The app never holds a token: `gh` does the
 * authentication, and nothing happens without the person pressing the button.
 *
 * The steps, all through `gh api` (no shell, arguments as an array):
 *   1. who is logged in (`gh api user`);
 *   2. a fork of the repository (skipped when the person owns it), synced with upstream;
 *   3. a new branch `course/<slug>-<timestamp>` from upstream `main`;
 *   4. the file `community/courses/<slug>.course.json` committed on that branch;
 *   5. the pull request to upstream `main`.
 * Without `gh`, the screen offers the file to download and the GitHub upload page instead.
 */

import { execFile } from 'node:child_process'
import { COMMUNITY_FOLDER, type SharePreview, type ShareResult } from '../../shared/community.js'
import { PERSONAL_BRIEF_FIELDS, ShareError, exportCourse, type CourseBundle } from '../../scripts/share.js'
import { HttpError } from '../errors.js'
import { readCourse } from '../courses/repository.js'
import { communityList, communityRepo } from './catalog.js'

/** Runs `gh` with arguments (and optional stdin); resolves with stdout. Swappable in the tests. */
export type GhRunner = (args: string[], input?: string) => Promise<string>

export const runGh: GhRunner = (args, input) =>
  new Promise((resolve, reject) => {
    const child = execFile('gh', args, { timeout: 60_000, maxBuffer: 30 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) reject(new Error((stderr || error.message).trim().split('\n').slice(-3).join(' ')))
      else resolve(stdout)
    })
    if (input !== undefined) child.stdin?.end(input)
  })

/** The login when `gh` is installed and authenticated, otherwise null. */
export async function ghLogin(gh: GhRunner = runGh): Promise<string | null> {
  try {
    const login = (await gh(['api', 'user', '--jq', '.login'])).trim()
    return /^[A-Za-z0-9-]{1,39}$/.test(login) ? login : null
  } catch {
    return null
  }
}

export const bundleText = (bundle: CourseBundle) => `${JSON.stringify(bundle, null, 2)}\n`

async function sharedBundle(slug: string, author: string | null): Promise<CourseBundle> {
  try {
    return await exportCourse(slug, undefined, { author })
  } catch (e) {
    if (e instanceof ShareError) throw new HttpError(422, e.message, 'invalid')
    throw e
  }
}

export async function sharePreview(slug: string, gh: GhRunner = runGh): Promise<SharePreview> {
  const course = readCourse(slug)
  if (!course) throw new HttpError(404, 'Course not found.', 'not_found')
  const bundle = await sharedBundle(slug, null)
  const repo = communityRepo()
  const login = await ghLogin(gh)
  let alreadyShared = false
  try {
    alreadyShared = (await communityList()).courses.some((c) => c.slug === slug)
  } catch {
    /* no catalog: it does not change what is published */
  }
  return {
    slug,
    title: course.title,
    files: Object.keys(bundle.files).length,
    bytes: Buffer.byteLength(bundleText(bundle)),
    writtenModules: course.modules.filter((m) => m.state === 'ready').length,
    modules: course.modules.length,
    removedFields: PERSONAL_BRIEF_FIELDS.filter((f) => {
      const v = (course.brief as Record<string, unknown>)[f]
      return typeof v === 'string' && v.trim() !== ''
    }),
    gh: { ready: Boolean(login), login },
    repo,
    alreadyShared,
    uploadUrl: `https://github.com/${repo}/upload/main/${COMMUNITY_FOLDER}`,
  }
}

/** The file to download when there is no `gh` (signed or not). */
export async function shareFile(slug: string, author: string | null): Promise<string> {
  return bundleText(await sharedBundle(slug, author))
}

const json = async <T>(gh: GhRunner, args: string[], input?: unknown): Promise<T> =>
  JSON.parse(
    await gh(
      input === undefined ? args : [...args, '--input', '-'],
      input === undefined ? undefined : JSON.stringify(input),
    ),
  ) as T

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function publishCourse(
  slug: string,
  options: { sign: boolean; gh?: GhRunner; now?: Date; wait?: (ms: number) => Promise<void> },
): Promise<ShareResult> {
  const gh = options.gh ?? runGh
  const wait = options.wait ?? sleep
  const login = await ghLogin(gh)
  if (!login)
    throw new HttpError(
      409,
      'The GitHub CLI (gh) is not logged in. Run "gh auth login" or send the file by hand.',
      'gh_missing',
    )
  const repo = communityRepo()
  const owner = repo.split('/')[0]!
  const bundle = await sharedBundle(slug, options.sign ? login : null)
  const file = `${COMMUNITY_FOLDER}/${slug}.course.json`

  try {
    // 2. where the branch lives: the person's fork (or the repository itself, for its owner)
    let head = repo
    if (login.toLowerCase() !== owner.toLowerCase()) {
      const fork = await json<{ full_name: string }>(gh, ['api', '-X', 'POST', `repos/${repo}/forks`], {
        default_branch_only: true,
      })
      head = fork.full_name
      // GitHub creates the fork in the background: wait until it answers
      for (let i = 0; ; i++) {
        try {
          await gh(['api', `repos/${head}`, '--jq', '.full_name'])
          break
        } catch (e) {
          if (i >= 10) throw e
          await wait(3000)
        }
      }
      await gh(['api', '-X', 'POST', `repos/${head}/merge-upstream`, '-f', 'branch=main']).catch(() => '')
    }

    // 3. a fresh branch from upstream main
    const base = (await gh(['api', `repos/${repo}/git/ref/heads/main`, '--jq', '.object.sha'])).trim()
    const stamp = (options.now ?? new Date()).toISOString().replace(/\D/g, '').slice(0, 14)
    const branch = `course/${slug}-${stamp}`
    await gh(['api', '-X', 'POST', `repos/${head}/git/refs`, '-f', `ref=refs/heads/${branch}`, '-f', `sha=${base}`])

    // 4. the file (updating it when the course was shared before)
    const existing = await gh(['api', `repos/${head}/contents/${file}?ref=${branch}`, '--jq', '.sha'])
      .then((s) => s.trim())
      .catch(() => '')
    await json(gh, ['api', '-X', 'PUT', `repos/${head}/contents/${file}`], {
      message: `${existing ? 'Update' : 'Add'} community course: ${bundle.title}`,
      content: Buffer.from(bundleText(bundle)).toString('base64'),
      branch,
      ...(existing ? { sha: existing } : {}),
    })

    // 5. the pull request
    const pr = await json<{ html_url: string }>(gh, ['api', '-X', 'POST', `repos/${repo}/pulls`], {
      title: `${existing ? 'Update' : 'Add'} community course: ${bundle.title}`,
      head: head === repo ? branch : `${head.split('/')[0]}:${branch}`,
      base: 'main',
      maintainer_can_modify: true,
      body: [
        `Shared from the Learning Anything app.`,
        '',
        `- **Course:** ${bundle.title} (\`${slug}\`, ${bundle.language})`,
        `- **Files:** ${Object.keys(bundle.files).length}`,
        `- **File:** \`${file}\``,
        '',
        'The `community` check validates the bundle with the same rules as `npm run course:import`.',
        'A maintainer still reviews the sources, the licenses and the quality before merging.',
      ].join('\n'),
    })
    return { pullRequest: pr.html_url }
  } catch (e) {
    if (e instanceof HttpError) throw e
    throw new HttpError(502, `GitHub refused the request: ${e instanceof Error ? e.message : e}`, 'github')
  }
}

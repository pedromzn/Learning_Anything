import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { exportCourse } from '../../scripts/share.js'
import {
  bundleUrl,
  clearCommunityCache,
  communityList,
  communityRepo,
  entryOf,
  indexUrl,
  installFromCommunity,
  networkAllowed,
} from './catalog.js'
import { publishCourse, type GhRunner } from './publish.js'
import { validateStaged, checkBundle } from '../../scripts/share.js'
import type { CommunityIndex } from '../../shared/community.js'

const SLUG = 'russo-basico'

async function fakeIndex(): Promise<{ index: CommunityIndex; bundle: string }> {
  const bundle = await exportCourse(SLUG)
  const text = JSON.stringify(bundle)
  const { serialized } = checkBundle(JSON.parse(text))
  const entry = await validateStaged(SLUG, serialized, (c) => entryOf(bundle, c, text.length))
  return {
    index: { format: 'learning-anything-community', version: 1, generatedAt: 'now', courses: [entry] },
    bundle: text,
  }
}

const fetchFrom = (routes: Record<string, string>): typeof fetch =>
  (async (url: string | URL | Request) => {
    const body = routes[String(url)]
    return body === undefined ? new Response('nope', { status: 404 }) : new Response(body)
  }) as typeof fetch

let tmp: string
beforeEach(() => {
  tmp = mkdtempSync(path.join(tmpdir(), 'la-community-'))
  clearCommunityCache()
})
afterEach(() => rmSync(tmp, { recursive: true, force: true }))

describe('community catalog', () => {
  it('reads the repository and the network switch from the environment', () => {
    expect(communityRepo(undefined)).toBe('pedromzn/Learning_Anything')
    expect(communityRepo('someone/fork')).toBe('someone/fork')
    expect(communityRepo('bad repo; rm -rf')).toBe('pedromzn/Learning_Anything')
    expect(networkAllowed('off')).toBe(false)
    expect(networkAllowed(undefined)).toBe(true)
    expect(indexUrl('a/b')).toBe('https://raw.githubusercontent.com/a/b/community-index/index.json')
  })

  it('summarizes a bundle and marks the installed courses', async () => {
    const { index } = await fakeIndex()
    expect(index.courses[0]).toMatchObject({ slug: SLUG, language: 'pt-BR', writtenModules: 1, author: null })
    const list = await communityList({ fetcher: fetchFrom({ [indexUrl()]: JSON.stringify(index) }) })
    expect(list.source).toBe('remote')
    expect(list.courses[0]!.installed).toBe(true) // the fixture folder has it
  })

  it('falls back to the local folder when GitHub does not answer', async () => {
    const list = await communityList({ fetcher: fetchFrom({}) })
    expect(list.source).toBe('local')
    expect(list.offline).toMatch(/404/)
  })

  it('installs a downloaded bundle with the import checks, and refuses a mismatched file', async () => {
    const { index, bundle } = await fakeIndex()
    const routes = { [indexUrl()]: JSON.stringify(index), [bundleUrl(`${SLUG}.course.json`)]: bundle }
    const result = await installFromCommunity(SLUG, { fetcher: fetchFrom(routes), coursesFolder: tmp })
    expect(result.slug).toBe(SLUG)
    expect(readdirSync(tmp)).toEqual([SLUG])

    clearCommunityCache()
    const tampered = {
      ...routes,
      [bundleUrl(`${SLUG}.course.json`)]: JSON.stringify({ ...JSON.parse(bundle), slug: 'other' }),
    }
    await expect(
      installFromCommunity(SLUG, { fetcher: fetchFrom(tampered), coursesFolder: path.join(tmp, 'x') }),
    ).rejects.toThrow(/does not match/)
    await expect(installFromCommunity('missing', { fetcher: fetchFrom(routes) })).rejects.toThrow(
      /not in the community/,
    )
  })
})

describe('sharing through gh', () => {
  function fakeGh(login: string) {
    const calls: { args: string[]; input?: unknown }[] = []
    const gh: GhRunner = async (args, input) => {
      calls.push({ args, input: input ? JSON.parse(input) : undefined })
      const [, ...rest] = args
      const joined = rest.join(' ')
      if (joined === 'user --jq .login') return `${login}\n`
      if (joined.includes('/forks')) return JSON.stringify({ full_name: `${login}/Learning_Anything` })
      if (joined.includes('git/ref/heads/main')) return 'abc123\n'
      if (joined.includes('contents/') && !joined.includes('PUT')) throw new Error('404 Not Found')
      if (joined.includes('/pulls')) return JSON.stringify({ html_url: 'https://github.com/pr/1' })
      return '{}'
    }
    return { gh, calls }
  }

  it('forks, branches, commits the signed bundle and opens the pull request', async () => {
    const { gh, calls } = fakeGh('student')
    const now = new Date('2026-11-12T10:20:30Z')
    const result = await publishCourse(SLUG, { sign: true, gh, now, wait: async () => {} })
    expect(result.pullRequest).toBe('https://github.com/pr/1')
    const flat = calls.map((c) => c.args.join(' '))
    expect(flat.some((a) => a.includes('repos/pedromzn/Learning_Anything/forks'))).toBe(true)
    expect(flat).toContain(
      'api -X POST repos/student/Learning_Anything/git/refs -f ref=refs/heads/course/russo-basico-20261112102030 -f sha=abc123',
    )
    const put = calls.find((c) => c.args.includes('PUT'))!
    const file = JSON.parse(Buffer.from((put.input as { content: string }).content, 'base64').toString('utf8'))
    expect(file.author).toBe('student')
    expect(file.files['brief.json']).not.toHaveProperty('goal')
    const pr = calls.find((c) => c.args.some((a) => a.endsWith('/pulls')))!
    expect(pr.input).toMatchObject({ head: 'student:course/russo-basico-20261112102030', base: 'main' })
  })

  it('skips the fork for the repository owner and refuses without gh', async () => {
    const { gh, calls } = fakeGh('pedromzn')
    await publishCourse(SLUG, { sign: false, gh, wait: async () => {} })
    expect(calls.some((c) => c.args.join(' ').includes('/forks'))).toBe(false)
    const put = calls.find((c) => c.args.includes('PUT'))!
    expect(JSON.parse(Buffer.from((put.input as { content: string }).content, 'base64').toString())).not.toHaveProperty(
      'author',
    )
    const noGh: GhRunner = async () => {
      throw new Error('gh: command not found')
    }
    await expect(publishCourse(SLUG, { sign: true, gh: noGh })).rejects.toThrow(/gh auth login/)
  })
})

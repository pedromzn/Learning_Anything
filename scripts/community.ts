/**
 * The community catalog, for the maintainers and the GitHub Actions:
 *
 *   npm run community:check [-- <file>...]   validates bundles in community/courses/ (all, or just these files)
 *   npm run community:index [-- --out <file>] writes the catalog (index.json) from every valid bundle
 *
 * Both use the same checks as `course:import` (see `scripts/share.ts`); `check` exits with 1 when any bundle fails.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { COMMUNITY_FOLDER } from '../shared/community.js'
import { config } from '../server/config.js'
import { buildIndex, inspectBundleFile } from '../server/community/catalog.js'

const folder = path.join(config.root, COMMUNITY_FOLDER)

async function check(files: string[]): Promise<number> {
  const targets = files.length ? files : null
  if (!targets) {
    const { index, problems } = await buildIndex(folder)
    for (const c of index.courses) console.log(`ok   ${c.file} — ${c.title}`)
    for (const p of problems) console.log(`FAIL ${p.file}\n${p.message}`)
    console.log(`\n${index.courses.length} valid, ${problems.length} with problems.`)
    return problems.length ? 1 : 0
  }
  let failures = 0
  for (const f of targets) {
    const resolved = path.resolve(f)
    if (path.dirname(resolved) !== folder || !resolved.endsWith('.course.json')) {
      console.log(
        `FAIL ${f}\nA community course is ONE file directly in ${COMMUNITY_FOLDER}/, named <slug>.course.json.`,
      )
      failures++
      continue
    }
    try {
      const entry = await inspectBundleFile(resolved)
      console.log(
        `ok   ${entry.file} — ${entry.title} (${entry.language}, ${entry.writtenModules}/${entry.modules} modules)`,
      )
    } catch (e) {
      console.log(`FAIL ${f}\n${e instanceof Error ? e.message : String(e)}`)
      failures++
    }
  }
  return failures ? 1 : 0
}

async function index(out: string | null): Promise<number> {
  const { index, problems } = await buildIndex(folder)
  for (const p of problems) console.warn(`skipped ${p.file}: ${p.message.split('\n')[0]}`)
  const file = path.resolve(out ?? 'index.json')
  await mkdir(path.dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(index, null, 2)}\n`)
  console.log(`Wrote ${index.courses.length} course(s) to ${file}`)
  return 0
}

async function main(): Promise<number> {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'check') return check(rest)
  if (command === 'index') {
    const i = rest.indexOf('--out')
    return index(i >= 0 ? (rest[i + 1] ?? null) : null)
  }
  console.log('Usage: community:check [-- <file>...] | community:index [-- --out <file>]')
  return command ? 1 : 0
}

main().then(
  (code) => process.exit(code),
  (error) => {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    process.exit(1)
  },
)

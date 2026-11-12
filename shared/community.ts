/**
 * The community catalog: courses other people made with Learning Anything and sent to the project's GitHub repository
 * (`community/courses/<slug>.course.json`, one bundle per course, see `scripts/share.ts`). A GitHub Action rebuilds
 * the catalog (`index.json`) on every merge and publishes it on the `community-index` branch; the app reads it only
 * when the person opens the Community tab.
 */

import { z } from 'zod'
import { LEVELS } from './course.js'
import { languageSchema } from './languages.js'

/** The repository that holds the community courses. A fork can point elsewhere with `COMMUNITY_REPO=owner/name`. */
export const COMMUNITY_REPO = 'pedromzn/Learning_Anything'
/** Where the bundles live in the repository. */
export const COMMUNITY_FOLDER = 'community/courses'
/** The branch the catalog is published to (only `index.json`, force-pushed by the Action). */
export const COMMUNITY_INDEX_BRANCH = 'community-index'

export const INDEX_FORMAT = 'learning-anything-community'

export const communityEntrySchema = z.object({
  slug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}$/),
  title: z.string().min(1).max(200),
  summary: z.string().max(2000),
  topic: z.string().max(200),
  language: languageSchema,
  level: z.enum(LEVELS),
  /** modules planned in the syllabus */
  modules: z.number().int().min(0).max(99),
  /** modules whose lessons are all written */
  writtenModules: z.number().int().min(0).max(99),
  lessons: z.number().int().min(0).max(9999),
  /** the GitHub login of whoever shared it, if they chose to sign it */
  author: z.string().max(60).nullable(),
  /** the bundle file, relative to `community/courses/` */
  file: z.string().regex(/^[a-z0-9][a-z0-9-]{1,60}\.course\.json$/),
  bytes: z.number().int().min(0),
  exportedAt: z.string().max(40),
})
export type CommunityEntry = z.infer<typeof communityEntrySchema>

export const communityIndexSchema = z.object({
  format: z.literal(INDEX_FORMAT),
  version: z.literal(1),
  generatedAt: z.string(),
  courses: z.array(communityEntrySchema).max(5000),
})
export type CommunityIndex = z.infer<typeof communityIndexSchema>

// ── the API ──────────────────────────────────────────────────────────────────

export interface CommunityCourse extends CommunityEntry {
  /** a course with this slug already exists in the person's `courses/` */
  installed: boolean
}

export interface CommunityList {
  /** `remote`: the catalog on GitHub; `local`: the bundles in this folder's `community/courses/` (offline) */
  source: 'remote' | 'local'
  repo: string
  courses: CommunityCourse[]
  /** why the remote catalog could not be read, when the list fell back to the local copy */
  offline: string | null
}

export interface InstallResult {
  slug: string
  files: number
}

/** What will be published, shown before the person confirms. */
export interface SharePreview {
  slug: string
  title: string
  files: number
  bytes: number
  /** modules with every lesson written */
  writtenModules: number
  modules: number
  /** brief fields that can hold personal context and are REMOVED from the shared copy */
  removedFields: string[]
  /** the GitHub CLI (`gh`) is installed and logged in: the app can open the pull request by itself */
  gh: { ready: boolean; login: string | null }
  repo: string
  /** a course with the same slug is already in the community catalog (sharing again updates it) */
  alreadyShared: boolean
  /** the page to upload the file by hand when there is no `gh` */
  uploadUrl: string
}

export interface ShareResult {
  pullRequest: string
}

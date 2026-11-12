/**
 * Runs before every test file: the tests read a frozen copy of two sample courses (`test/fixtures/courses/`), never
 * the person's `courses/` folder, so adding, editing or deleting a course there does not break the suite.
 */

import path from 'node:path'
import { config } from '../server/config.js'

config.coursesFolder = path.join(config.root, 'test', 'fixtures', 'courses')

/**
 * The server configuration, all through environment variables (with a `.env` at the root, if there is one). No dotenv:
 * Node reads the file on its own.
 */

import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

try {
  process.loadEnvFile(path.join(root, '.env'))
} catch {
  /* no .env: the defaults apply */
}

export const config = {
  port: Number(process.env.PORT) || 3040,
  host: process.env.HOST || '127.0.0.1',
  production: process.env.NODE_ENV === 'production',
  root,
  /** the content: the AI writes here */
  coursesFolder: path.join(root, 'courses'),
  /** the requests from "New course" */
  requestsFolder: path.join(root, 'requests'),
  /** what is generated and stays out of git: database, voices, cache */
  dataFolder: path.join(root, 'data'),
}

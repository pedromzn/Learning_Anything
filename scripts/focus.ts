/**
 * The focus mode detector from the terminal.
 *   npm run focus:install    downloads the MediaPipe models (~8 MB) to data/focus/, checked by sha256
 * The same download can also be done with the focus mode button in the app.
 */

import { modelsState, installModels } from '../server/focus/models.js'

async function main(): Promise<number> {
  if (modelsState().installed) {
    console.log('The focus mode detector is already in data/focus/.')
    return 0
  }
  const state = await installModels((text) => console.log(text))
  console.log(`Done: ${state.megabytes} MB in data/focus/. Turn on the camera with the app's Focus button.`)
  return 0
}

main().then(
  (c) => process.exit(c),
  (e) => {
    console.error(`Error: ${e instanceof Error ? e.message : String(e)}`)
    process.exit(1)
  },
)

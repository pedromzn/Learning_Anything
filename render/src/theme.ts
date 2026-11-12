/**
 * The notebook theme: warm paper, ink, thin lines and one accent, the same palette as the web app
 * (web/src/style/theme.css, light). Colors, fonts, measurements and the time scale shared by every scene live in this
 * single file so the look does not drift between one scene and another.
 */

export const COLOR = {
  /** the paper */
  background: '#f6f2e9',
  card: '#fffdf8',
  sunken: '#efe9dc',
  tint: '#e9e2d2',
  /** the ink */
  text: '#1f1b16',
  secondary: '#5a5246',
  faint: '#877e70',
  line: 'rgb(31 27 22 / 0.12)',
  lineStrong: 'rgb(31 27 22 / 0.24)',
  /** forest green: the main color (highlights, chart lines, active diagram arrows) */
  accent: '#2e5e4e',
  /** terracotta: what is happening "now" (the question pause) */
  info: '#b0532c',
  /** ochre: ONLY for achievement */
  gold: '#a86e12',
  error: '#b4321f',
  success: '#2f7a4d',
} as const

/** A light syntax palette for code on sunken paper. */
export const SYNTAX = {
  keyword: '#2e5e4e',
  string: '#9a4a24',
  number: '#7a5a10',
  comment: '#877e70',
} as const

export const FONT = {
  title: '"Fraunces Variable", "Fraunces", Georgia, serif',
  text: '"Instrument Sans Variable", "Instrument Sans", sans-serif',
  code: '"Geist Mono Variable", "Geist Mono", monospace',
} as const

export const WIDTH = 1920
export const HEIGHT = 1080
export const FPS = 30

/** generous margin: nothing touches the edge of the video */
export const MARGIN = 120

/** the smallest text allowed: in video, anything below this is unreadable on a phone */
export const MIN_TEXT = 34

/** the bottom strip is reserved for the "learning anything" mark, so content does not run over it */
export const BRAND_RESERVE = 70

export const AREA_UTIL = {
  width: WIDTH - MARGIN * 2,
  height: HEIGHT - MARGIN * 2 - BRAND_RESERVE,
}

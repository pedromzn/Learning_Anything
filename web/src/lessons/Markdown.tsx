/**
 * The lesson text: Markdown with formulas (KaTeX) and code, in the theme's `.reading` class.
 *
 * The text comes from an AI that read web pages. That is why `react-markdown` keeps its default, which does NOT
 * interpret HTML (no `rehype-raw`), links open in another tab without `opener`, and KaTeX runs with `trust: false`.
 */

import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkMath from 'remark-math'
import rehypeKatex from 'rehype-katex'
import { join } from '@/components/ui'

const COMPONENTS: Components = {
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
}

const PLUGINS_REMARK = [remarkGfm, remarkMath]
const REHYPE_PLUGINS = [[rehypeKatex, { trust: false, throwOnError: false }]] as never

/** `compact`: without the reading width or the first and last paragraph margins (choices, steps, lists). */
export function Markdown({
  text,
  compact = false,
  className,
}: {
  text: string
  compact?: boolean
  className?: string
}) {
  return (
    <div
      className={join(
        'reading',
        compact && 'max-w-none text-[1rem] leading-[1.55] [&>:first-child]:mt-0 [&>:last-child]:mb-0',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={PLUGINS_REMARK} rehypePlugins={REHYPE_PLUGINS} components={COMPONENTS}>
        {text}
      </ReactMarkdown>
    </div>
  )
}

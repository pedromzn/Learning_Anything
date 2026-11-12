/**
 * The app kit. Few pieces, each with one job: the button, the card panel, the badge, the bar, the command to copy
 * and the loading, empty and error states. Color and radius come from the tokens in `style/theme.css`.
 */

import { useState, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router-dom'
import { Check, Copy, WarningCircle } from '@phosphor-icons/react'
import { useT } from '@/i18n'

const join = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ')
export { join }

// ── button ───────────────────────────────────────────────────────────────────

type Variant = 'main' | 'subtle' | 'ghost'

const VARIANTS: Record<Variant, string> = {
  main: 'bg-accent text-white lift hover:bg-accent-hover active:translate-y-px disabled:opacity-50 disabled:shadow-none',
  subtle: 'card text-ink hover:border-line-strong hover:bg-tint/50 disabled:opacity-50',
  ghost: 'text-ink-soft hover:text-ink hover:bg-ink/5 disabled:opacity-40',
}

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-pill font-medium transition-[background,color,box-shadow,transform] duration-200 select-none disabled:cursor-not-allowed'

const SIZES = { normal: 'h-11 px-5 text-[15px]', small: 'h-9 px-4 text-sm', large: 'h-13 px-7 text-base' }

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: keyof typeof SIZES
  icon?: ReactNode
}

export function Button({ variant = 'main', size = 'normal', icon, className, children, ...rest }: ButtonProps) {
  return (
    <button type="button" className={join(BUTTON_BASE, SIZES[size], VARIANTS[variant], className)} {...rest}>
      {icon}
      {children}
    </button>
  )
}

export function LinkButton({
  variant = 'main',
  size = 'normal',
  icon,
  className,
  children,
  ...rest
}: LinkProps & { variant?: Variant; size?: keyof typeof SIZES; icon?: ReactNode }) {
  return (
    <Link className={join(BUTTON_BASE, SIZES[size], VARIANTS[variant], className)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}

// ── surfaces ─────────────────────────────────────────────────────────────────

export function Panel({
  className,
  children,
  as: Tag = 'section',
}: {
  className?: string
  children: ReactNode
  as?: 'section' | 'div' | 'article' | 'aside'
}) {
  return <Tag className={join('card rounded-panel', className)}>{children}</Tag>
}

/** The badge: a short label. `tone` says what it means; it is not decoration. */
export function Badge({
  children,
  tone = 'neutral',
  className,
}: {
  children: ReactNode
  tone?: 'neutral' | 'now' | 'achievement' | 'action' | 'error'
  className?: string
}) {
  const tones = {
    neutral: 'border-line text-ink-soft',
    now: 'border-info/35 text-info bg-info/8',
    achievement: 'border-gold/40 text-gold bg-gold/8',
    action: 'border-accent-ink/40 text-accent-ink bg-accent/10',
    error: 'border-error/40 text-error bg-error/8',
  }
  return (
    <span
      className={join(
        'inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-0.5 text-[13px] leading-5',
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  )
}

/** The progress bar: a thin ink line on the page. Gold only when it means achievement (a finished course). */
export function Bar({
  value,
  className,
  tone = 'accent',
}: {
  value: number
  className?: string
  tone?: 'accent' | 'gold'
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100
  return (
    <div
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      className={join('h-1.5 overflow-hidden rounded-pill bg-ink/10', className)}
    >
      <div
        className={join(
          'h-full rounded-pill transition-[width] duration-700 ease-out',
          tone === 'gold' ? 'bg-gold' : 'bg-accent',
        )}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

// ── the command for the AI ───────────────────────────────────────────────────

/** A text to paste into the AI (or a terminal command), with a copy button. */
export function Command({ text, label, className }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  const t = useT()
  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* no clipboard permission (http outside localhost): select it for Ctrl+C */
      const range = document.createRange()
      const target = document.getElementById(`cmd-${text.length}`)
      if (target) {
        range.selectNodeContents(target)
        window.getSelection()?.removeAllRanges()
        window.getSelection()?.addRange(range)
      }
    }
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  return (
    <div className={join('group relative rounded-tile border border-line bg-sunken', className)}>
      {label && <div className="border-b border-line px-4 py-2 text-[13px] text-ink-soft">{label}</div>}
      <div className="flex items-start gap-3 p-4">
        <code
          id={`cmd-${text.length}`}
          className="min-w-0 flex-1 font-mono text-[13.5px] leading-6 break-words whitespace-pre-wrap text-ink"
        >
          {text}
        </code>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 rounded-lg border border-line p-2 text-ink-soft transition-colors hover:border-line-strong hover:text-ink"
          aria-label={copied ? t.general.copied : t.general.copy}
        >
          {copied ? <Check size={16} weight="bold" className="text-success" /> : <Copy size={16} />}
        </button>
      </div>
    </div>
  )
}

// ── states ───────────────────────────────────────────────────────────────────

/** Loading: three ink dots taking turns, instead of a generic spinner. */
export function Loading({ text, className }: { text?: string; className?: string }) {
  const t = useT()
  return (
    <div className={join('flex items-center justify-center gap-3 py-16 text-ink-soft', className)} role="status">
      <span className="flex gap-1" aria-hidden>
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-throb rounded-full bg-accent"
            style={{ animationDelay: `${i * 0.25}s`, animationDuration: '1.2s' }}
          />
        ))}
      </span>
      <span className="text-sm">{text ?? t.general.loading}</span>
    </div>
  )
}

export function ScreenError({ error, onRetry }: { error: { message: string }; onRetry?: () => void }) {
  const t = useT()
  return (
    <Panel className="mx-auto mt-10 max-w-lg p-6">
      <div className="flex gap-3">
        <WarningCircle size={22} className="mt-0.5 shrink-0 text-error" />
        <div>
          <p className="text-ink">{error.message}</p>
          {onRetry && (
            <Button variant="subtle" size="small" className="mt-4" onClick={onRetry}>
              {t.general.tryAgain}
            </Button>
          )}
        </div>
      </div>
    </Panel>
  )
}

/** A screen header: a big title and, if any, a supporting line and the actions on the right. */
export function Header({
  title,
  note,
  actions,
  className,
}: {
  title: ReactNode
  note?: ReactNode
  actions?: ReactNode
  className?: string
}) {
  return (
    <header className={join('flex flex-wrap items-end justify-between gap-x-6 gap-y-4', className)}>
      <div className="min-w-0">
        <h1 className="text-[clamp(1.75rem,3.4vw,2.6rem)]">{title}</h1>
        {note && <p className="mt-2 max-w-[60ch] text-ink-soft">{note}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

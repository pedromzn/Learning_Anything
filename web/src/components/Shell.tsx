/**
 * The shell: the paper background, the navigation and the reward toasts. On a computer the navigation is a thin
 * column on the left; on a phone, a floating dock at the bottom. `immersive` hides everything (the lesson and the
 * checkpoint take the whole screen).
 */

import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { House, PencilSimpleLine, UserCircle, UsersThree, X } from '@phosphor-icons/react'
import { FocusPanel } from '@/focus/FocusPanel'
import { Brand } from './Brand'
import { join } from './ui'
import { useRewards } from '@/lib/rewards'
import { useT } from '@/i18n'

const DESTINATIONS = [
  { to: '/', navKey: 'home', icon: House, end: true },
  { to: '/new', navKey: 'newCourse', icon: PencilSimpleLine, end: false },
  { to: '/community', navKey: 'community', icon: UsersThree, end: false },
  { to: '/profile', navKey: 'profile', icon: UserCircle, end: false },
] as const

function Destination({ to, navKey, icon: Icon, end, compact }: (typeof DESTINATIONS)[number] & { compact?: boolean }) {
  const label = useT().nav[navKey]
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        join(
          'group relative flex items-center rounded-2xl transition-colors',
          compact ? 'h-12 w-16 flex-col justify-center gap-0.5 text-[11px]' : 'h-14 w-14 justify-center',
          isActive ? 'text-accent-ink' : 'text-ink-faint hover:text-ink',
        )
      }
    >
      {({ isActive }) => (
        <>
          {isActive && (
            <span className="absolute inset-0 rounded-2xl bg-accent/12 shadow-[inset_0_0_0_1px_var(--line-strong)]" />
          )}
          <Icon size={compact ? 22 : 24} weight={isActive ? 'fill' : 'regular'} className="relative" />
          {compact ? (
            <span className="relative">{label}</span>
          ) : (
            <span className="pointer-events-none absolute left-full ml-3 rounded-lg border border-line bg-card px-2.5 py-1 shadow-sm text-sm whitespace-nowrap text-ink opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              {label}
            </span>
          )}
        </>
      )}
    </NavLink>
  )
}

function Warnings() {
  const { warnings, dismiss } = useRewards()
  const t = useT()
  return (
    <div
      className="pointer-events-none fixed top-4 right-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
      aria-live="polite"
    >
      {warnings.map(({ id, reward: r }) => (
        <div key={id} className="card pointer-events-auto animate-appear rounded-tile border-gold/30 p-4">
          <div className="flex items-start gap-3">
            <span className="font-display text-xl text-gold">+{r.xp}</span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="text-ink">
                {r.levelAfter > r.levelBefore ? t.reward.level(r.levelAfter) : t.reward.xpEarned}
                {r.goalReachedNow && t.reward.goalReached}
              </p>
              {r.streak > 1 && <p className="text-ink-soft">{t.reward.streak(r.streak)}</p>}
              {r.achievements.map((c) => (
                <p key={c.code} className="mt-1 text-gold">
                  {t.reward.achievement(t.achievements[c.code]?.[0] ?? c.title)}
                </p>
              ))}
            </div>
            <button
              type="button"
              onClick={() => dismiss(id)}
              className="text-ink-faint hover:text-ink"
              aria-label={t.general.close}
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}

export function Shell({ children, immersive = false }: { children: ReactNode; immersive?: boolean }) {
  const t = useT()
  return (
    <div className="relative isolate min-h-dvh">
      <Warnings />
      <FocusPanel />
      {!immersive && (
        <>
          <nav
            aria-label={t.nav.main}
            className="fixed inset-y-0 left-0 z-40 hidden w-24 flex-col items-center py-6 md:flex"
          >
            <NavLink to="/" aria-label={t.nav.start} className="mb-8">
              <Brand size={38} />
            </NavLink>
            <div className="card flex flex-col gap-1 rounded-[28px] p-1.5">
              {DESTINATIONS.map((d) => (
                <Destination key={d.to} {...d} />
              ))}
            </div>
          </nav>
          <nav
            aria-label={t.nav.main}
            className="card fixed bottom-3 left-1/2 z-40 flex -translate-x-1/2 gap-1 rounded-[26px] p-1.5 md:hidden"
          >
            {DESTINATIONS.map((d) => (
              <Destination key={d.to} {...d} compact />
            ))}
          </nav>
        </>
      )}
      <main className={join('relative', !immersive && 'px-4 pt-8 pb-28 sm:px-8 md:pl-32 md:pr-10 md:pb-16')}>
        {children}
      </main>
    </div>
  )
}

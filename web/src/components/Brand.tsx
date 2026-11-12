/** The brand: a notebook with a bookmark ribbon. It is the app icon and the favicon. Colors come from the theme. */
export function Brand({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" className={className} aria-hidden>
      <rect x="5" y="3.5" width="22" height="25" rx="3.5" fill="var(--accent)" />
      <rect x="9" y="3.5" width="18" height="25" rx="3" fill="var(--card)" />
      <path
        d="M12.5 10.5h10M12.5 14.5h10M12.5 18.5h7"
        stroke="var(--ink-faint)"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M21 3.5v8.5l2-1.6 2 1.6V3.5z" fill="var(--info)" />
    </svg>
  )
}

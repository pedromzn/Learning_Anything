/**
 * "Share in the community": shows exactly what will be published (and what never is), then either opens the pull
 * request with the person's GitHub CLI or walks them through the upload by hand. Nothing is sent until they press
 * the button.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowSquareOut, CheckCircle, DownloadSimple, GithubLogo, X } from '@phosphor-icons/react'
import type { SharePreview, ShareResult } from '@shared/community'
import { api, useData } from '@/lib/api'
import { Button, Loading, ScreenError } from '@/components/ui'
import { errorMessage, useT } from '@/i18n'

export function ShareDialog({ courseId, onClose }: { courseId: string; onClose: () => void }) {
  const t = useT()
  const { data, error, loading, reload } = useData<SharePreview>(`/api/community/share/${courseId}`)
  const [sign, setSign] = useState(true)
  const [sending, setSending] = useState(false)
  const [problem, setProblem] = useState<string | null>(null)
  const [result, setResult] = useState<ShareResult | null>(null)

  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', key)
    return () => window.removeEventListener('keydown', key)
  }, [onClose])

  async function send() {
    setSending(true)
    setProblem(null)
    try {
      setResult(await api.post<ShareResult>(`/api/community/share/${courseId}`, { sign }))
    } catch (e) {
      setProblem(errorMessage(e))
    } finally {
      setSending(false)
    }
  }

  let body: React.ReactNode
  if (loading) body = <Loading text={t.share.loading} className="py-10" />
  else if (error || !data) body = <ScreenError error={error ?? { message: t.general.noData }} onRetry={reload} />
  else if (result)
    body = (
      <div className="text-center">
        <CheckCircle size={40} weight="fill" className="mx-auto text-accent" />
        <p className="mx-auto mt-3 max-w-[40ch] text-ink-soft">{t.share.sent}</p>
        <a
          href={result.pullRequest}
          target="_blank"
          rel="noreferrer"
          className="mt-5 inline-flex h-11 items-center gap-2 rounded-pill bg-accent px-5 font-medium text-white lift hover:bg-accent-hover"
        >
          {t.share.viewPr} <ArrowSquareOut size={16} />
        </a>
      </div>
    )
  else {
    const removed = data.removedFields.map((f) => t.share.fieldNames[f] ?? f).join(', ')
    body = (
      <div className="space-y-4 text-[15px]">
        <p className="font-display text-lg leading-snug">{data.title}</p>
        <ul className="space-y-2 text-ink-soft">
          <li>{t.share.what(data.files, Math.max(1, Math.round(data.bytes / 1024)))}</li>
          <li>{t.share.written(data.writtenModules, data.modules)}</li>
          <li>{t.share.never}</li>
          {removed && <li>{t.share.removed(removed)}</li>}
          {data.alreadyShared && <li className="text-info">{t.share.again}</li>}
        </ul>
        <p className="rounded-tile border border-line bg-sunken p-3 text-sm text-ink-soft">{t.share.review}</p>

        <label className="flex cursor-pointer items-center gap-3 text-sm">
          <input
            type="checkbox"
            checked={sign}
            onChange={(e) => setSign(e.target.checked)}
            className="h-4 w-4 accent-[var(--accent)]"
          />
          {data.gh.login ? t.share.sign(data.gh.login) : t.share.signPlain}
        </label>

        {data.gh.ready ? (
          <>
            <p className="flex items-center gap-2 text-sm text-ink-faint">
              <GithubLogo size={16} /> {t.share.ghReady(data.gh.login ?? '')}
            </p>
            <Button className="w-full" onClick={() => void send()} disabled={sending}>
              {sending ? t.share.sending : t.share.send}
            </Button>
          </>
        ) : (
          <div>
            <p className="text-sm font-medium">{t.share.manualTitle}</p>
            <ol className="mt-3 space-y-3 text-sm">
              <li className="flex gap-3">
                <Step n={1} />
                <a
                  href={`/api/community/share/${courseId}/file${sign ? '?sign=1' : ''}`}
                  download={`${courseId}.course.json`}
                  className="inline-flex items-center gap-1.5 text-accent-ink underline underline-offset-2"
                >
                  <DownloadSimple size={15} /> {t.share.manualDownload}
                </a>
              </li>
              <li className="flex gap-3">
                <Step n={2} />
                <a
                  href={data.uploadUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-accent-ink underline underline-offset-2"
                >
                  {t.share.manualUpload} <ArrowSquareOut size={14} />
                </a>
              </li>
              <li className="flex gap-3">
                <Step n={3} />
                <span className="text-ink-soft">{t.share.manualPropose}</span>
              </li>
            </ol>
            <p className="mt-4 text-xs text-ink-faint">{t.share.ghTip}</p>
          </div>
        )}
        {problem && <p className="text-sm text-error">{problem}</p>}
      </div>
    )
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-end justify-center bg-page/70 p-3 backdrop-blur-sm sm:items-center sm:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t.share.title}
        className="card max-h-[calc(100dvh-1.5rem)] w-full max-w-lg animate-appear overflow-y-auto rounded-panel p-5 sm:p-7"
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-[20px]">{t.share.title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-faint hover:text-ink"
            aria-label={t.general.close}
          >
            <X size={18} />
          </button>
        </div>
        {body}
      </div>
    </div>,
    document.body,
  )
}

function Step({ n }: { n: number }) {
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-line font-mono text-xs text-ink-soft">
      {n}
    </span>
  )
}

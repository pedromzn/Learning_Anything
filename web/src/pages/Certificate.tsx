/**
 * The certificate, to view and print (the browser's "Save as PDF" makes the file). On screen it follows the
 * notebook theme; in print it becomes white paper with dark, readable text. The text says what it is
 * and what it is not.
 */

import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Printer, SealCheck } from '@phosphor-icons/react'
import type { CertificateDetail } from '@shared/api'
import { useData } from '@/lib/api'
import { Brand } from '@/components/Brand'
import { Button, LinkButton, Loading, ScreenError } from '@/components/ui'
import { format, useT } from '@/i18n'

const PRINT_CSS = `
@media print {
  @page { size: A4 landscape; margin: 14mm }
  html, body { background: #fff !important }
  body * { visibility: hidden }
  .certificado, .certificado * { visibility: visible }
  .certificado {
    position: absolute; inset: 0; margin: 0 !important; max-width: none !important;
    background: #fff !important; color: #1f1b16 !important; border: 3px double #1f1b16 !important;
    box-shadow: none !important; backdrop-filter: none !important; border-radius: 0 !important;
  }
  .certificado .print-light { color: #1f1b16 !important; background: none !important; -webkit-text-fill-color: #1f1b16 !important; text-shadow: none !important; filter: none !important }
  .certificado .print-soft { color: #5a5246 !important }
  .certificado .print-border { border-color: #877e70 !important }
  .certificado .print-gold { color: #a86e12 !important }
}
`

export default function Certificate() {
  const { code = '' } = useParams()
  const { data: c, error, loading, reload } = useData<CertificateDetail>(`/api/certificates/${code}`)
  const t = useT()

  if (loading) return <Loading className="min-h-dvh" />
  if (error || !c)
    return <ScreenError error={error ?? { message: t.certificate.notFound }} onRetry={() => void reload()} />

  const issued = format.date(c.issuedAt)
  const noName = !c.name.trim()

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-10">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to="/profile" className="inline-flex items-center gap-1.5 text-[14px] text-ink-soft hover:text-ink">
          <ArrowLeft size={16} aria-hidden />
          {t.certificate.backToProfile}
        </Link>
        <Button variant="subtle" onClick={() => window.print()} icon={<Printer size={17} />} disabled={noName}>
          {t.certificate.print}
        </Button>
      </div>

      {noName ? (
        <div className="card flex flex-wrap items-center justify-between gap-3 rounded-tile border-gold/35 p-4 print:hidden">
          <p className="text-[15px] text-ink">{t.certificate.noName}</p>
          <LinkButton to="/profile" size="small">
            {t.certificate.fillName}
          </LinkButton>
        </div>
      ) : null}

      <article className="certificado card relative overflow-hidden rounded-panel border-gold/30 px-6 py-10 sm:px-14 sm:py-14">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent print:hidden"
          aria-hidden
        />
        <div className="flex items-center gap-3">
          <Brand size={34} />
          <span className="print-light font-display text-[16px] text-ink">Learning Anything</span>
        </div>

        <p className="print-soft mt-12 text-[14px] text-ink-soft">{t.certificate.title}</p>
        <h1 className="print-light accent-text mt-3 text-[clamp(2rem,6vw,3.4rem)] leading-[1.05]">
          {c.name.trim() || t.certificate.yourName}
        </h1>
        <p className="print-soft mt-6 max-w-[56ch] text-[17px] leading-relaxed text-ink-soft">
          {t.certificate.completed1} <strong className="print-light font-semibold text-ink">{c.title}</strong>
          {t.certificate.completed2(t.levels[c.level], c.lessons, c.modules)}
        </p>

        <div className="print-border mt-12 flex flex-wrap items-end justify-between gap-8 border-t border-line pt-6">
          <div className="print-soft text-[14px] text-ink-soft">
            <p>{t.certificate.issued(issued)}</p>
            <p className="mt-1">
              {t.certificate.code} <span className="print-light font-mono text-ink">{c.code}</span>
            </p>
          </div>
          <div className="print-gold flex items-center gap-2 text-gold">
            <SealCheck size={40} weight="fill" aria-hidden />
            <span className="print-soft text-[13px] leading-tight text-ink-soft">
              {t.certificate.badge1}
              <br />
              {t.certificate.badge2}
            </span>
          </div>
        </div>

        <p className="print-soft mt-8 text-[12px] text-ink-faint">{t.certificate.footer}</p>
      </article>
    </div>
  )
}

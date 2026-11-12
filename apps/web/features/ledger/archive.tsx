import { formatDateTime } from '@skyclause/i18n/format'
import { DownloadIcon } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '#ui/sheet'
import { t } from './i18n'
import type { ArchiveFile } from './operations'

export function ArchiveSheet({
  files,
  open,
  onClose,
  locale
}: {
  files: ArchiveFile[]
  open: boolean
  onClose: () => void
  locale: 'en' | 'ms'
}) {
  return (
    <Sheet
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose()
      }}
    >
      <SheetContent className="ledger-sheet" lang={locale}>
        <SheetHeader>
          <SheetTitle>{t('ledger.archive', {}, locale)}</SheetTitle>
          <SheetDescription>{t('ledger.archiveDescription', {}, locale)}</SheetDescription>
        </SheetHeader>
        <div className="ledger-sheet-body">
          <ul>
            {files.map((file) => (
              <li key={`${file.kind}-${file.captured_at}`}>
                <h3>{t(`ledger.kinds.${file.kind}`, {}, locale)}</h3>
                <time className="ledger-sub" dateTime={file.captured_at}>
                  {t('ledger.captured', { time: formatDateTime(file.captured_at, locale) }, locale)}
                </time>
                <a href={file.url} download className="evidence-reading-ref">
                  <DownloadIcon aria-hidden="true" focusable="false" className="size-4" />
                  {t('ledger.download', { label: t(`ledger.kinds.${file.kind}`, {}, locale) }, locale)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </SheetContent>
    </Sheet>
  )
}

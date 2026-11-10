import { formatDateTime } from '@skyclause/i18n/format'
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
        <ul className="ledger-sheet-body">
          {files.map((file) => (
            <li key={`${file.kind}-${file.captured_at}`}>
              <h3>{t(`ledger.kinds.${file.kind}`, {}, locale)}</h3>
              <p>{t('ledger.captured', { time: formatDateTime(file.captured_at, locale) }, locale)}</p>
              <a href={file.url} download>
                {t('ledger.download', { label: t(`ledger.kinds.${file.kind}`, {}, locale) }, locale)}
              </a>
            </li>
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  )
}

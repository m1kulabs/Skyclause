import { notFound } from 'next/navigation'
import { Mode } from '@skyclause/contracts'
import { brandStates } from '@skyclause/elements'
import { t } from '@skyclause/i18n/brand'
import { ModeBadge } from '../../../features/brand'
import { Glyph } from '../../../features/brand/glyph'

export const instant = false

// Enum specimens only: this route is compiled solely in Playwright's planted test build.
export default async function BrandHarness({ searchParams }: { searchParams: Promise<{ locale?: string }> }) {
  if (process.env.APP_ENV !== 'test') notFound()
  const locale = (await searchParams).locale === 'ms' ? 'ms' : 'en'
  return (
    <main className="p-4" lang={locale}>
      <h1>{t('brand.test.title', {}, locale)}</h1>
      <a href="/_test/tokens" data-before className="inline-flex min-h-6 items-center">
        {t('brand.test.back', {}, locale)}
      </a>
      <div className="flex flex-col items-start gap-2" data-badges>
        {([...Mode.options, 'storm_watch', 'no_call'] as const).map((mode) => (
          <div className="flex max-w-full flex-col items-start gap-1" key={mode}>
            <ModeBadge mode={mode} locale={locale} />
            {(['sky', 'crowd'] as const)
              .filter((pack) =>
                pack === 'sky' ? mode !== 'surge_night' : ['normal', 'surge_night', 'no_call'].includes(mode)
              )
              .map((pack) => (
                <ModeBadge key={pack} mode={mode} pack={pack} locale={locale} />
              ))}
          </div>
        ))}
      </div>
      <div className="flex flex-col items-start gap-2" data-glyphs>
        {Object.entries(brandStates).map(([state, mapping]) => (
          <div key={state} className="flex max-w-full items-center gap-1">
            <Glyph state={state as keyof typeof brandStates} />
            <span>{t(mapping.word, {}, locale)}</span>
          </div>
        ))}
      </div>
      <a href="/_test/tokens" data-after className="inline-flex min-h-6 items-center">
        {t('brand.test.after', {}, locale)}
      </a>
    </main>
  )
}

import { notFound } from 'next/navigation'
import { t } from '@skyclause/i18n'
import { Gallery } from './gallery.plant'

export default function Tokens() {
  if (process.env.APP_ENV !== 'test') notFound()
  return (
    <main className="mx-auto flex max-w-[1208px] flex-col gap-8 px-4 py-8 md:px-8">
      <h1 className="type-title">{t('shell.tokens')}</h1>
      <Gallery />
    </main>
  )
}

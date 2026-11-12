import { Channels } from '../../../channels'

export default function Panel({ locale }: { locale?: 'en' | 'ms' }) {
  return <Channels locale={locale} />
}

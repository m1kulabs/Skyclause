import { t } from '@skyclause/i18n'
import { Attribution, AttributionList } from '../../../../../features/public-chrome'
import { sourceFixtures } from '../../../../../test/public-chrome/source-fixtures'

export default function AttributionTestPage() {
  return (
    <main>
      <h1>{t('legal.attribution.heading')}</h1>
      <ul>
        {sourceFixtures.map((source) => (
          <li key={source.id}>
            <Attribution source={source}>{source.name}</Attribution>
          </li>
        ))}
      </ul>
      <AttributionList sources={sourceFixtures} />
    </main>
  )
}

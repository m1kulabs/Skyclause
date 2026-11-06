'use client'

import { useState } from 'react'
import { t } from '@skyclause/i18n'

export function LanguageSuggestion() {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <aside lang="ms" data-language-suggestion className="language-suggestion type-landing-small">
      <a href="/ms/legal/privacy">{t('marketing.privacy_suggestion', {}, 'ms')}</a>
      <button type="button" onClick={() => setDismissed(true)}>
        {t('marketing.dismiss_suggestion', {}, 'ms')}
      </button>
    </aside>
  )
}

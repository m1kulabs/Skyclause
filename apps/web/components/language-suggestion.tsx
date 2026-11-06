'use client'

import { useState } from 'react'

export function LanguageSuggestion({ privacyLabel, dismissLabel }: { privacyLabel: string; dismissLabel: string }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <aside lang="ms" data-language-suggestion className="language-suggestion type-landing-small">
      <a href="/ms/legal/privacy">{privacyLabel}</a>
      <button type="button" onClick={() => setDismissed(true)}>
        {dismissLabel}
      </button>
    </aside>
  )
}

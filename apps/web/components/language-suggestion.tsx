'use client'

import { useState } from 'react'

export function LanguageSuggestion({ privacyLabel, dismissLabel }: { privacyLabel: string; dismissLabel: string }) {
  const [dismissed, setDismissed] = useState(false)
  if (dismissed) return null
  return (
    <aside lang="ms" data-language-suggestion className="language-suggestion type-landing-small">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Next's greedy dynamic-route regexp mistakes the camera path for this unbuilt route. */}
      <a href="/ms/legal/privacy">{privacyLabel}</a>
      <button type="button" onClick={() => setDismissed(true)}>
        {dismissLabel}
      </button>
    </aside>
  )
}

// Test-only (built when PLANTED_ROUTES=1): labelled fields that each break one NFR-6 rule the crawl must fail on (#116):
// an email in a text field, a code in a number field, an inputmode against the type and a generated name.
export default function PlantedFormTypes() {
  return (
    <>
      <a href="#main" style={{ display: 'inline-block', minHeight: 24 }}>
        Skip to content
      </a>
      <main id="main">
        <h1>Planted form types</h1>
        <label>
          Email <input id="planted-email" name="email" autoComplete="email" spellCheck={false} />
        </label>
        <label>
          Postcode{' '}
          <input id="planted-postcode" type="number" name="postcode" autoComplete="postal-code" spellCheck={false} />
        </label>
        <label>
          Webhook{' '}
          <input
            id="planted-webhook"
            type="url"
            name="webhook"
            autoComplete="url"
            inputMode="numeric"
            spellCheck={false}
          />
        </label>
        <label>
          Notes <input id="planted-notes" name="_r_1_" autoComplete="off" />
        </label>
      </main>
    </>
  )
}

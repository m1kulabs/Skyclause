// Test-only (built when PLANTED_ROUTES=1): a clean page inside a route group, for e2e/quality/vitals.spec.ts.
export default function PlantedVitals() {
  return (
    <>
      <a href="#main" style={{ display: 'inline-block', minHeight: 24 }}>
        Skip to content
      </a>
      <main id="main">
        <h1>Planted vitals page</h1>
        <p>This page exists only in test builds.</p>
      </main>
    </>
  )
}

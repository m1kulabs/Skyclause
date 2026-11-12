// Test-only (built when PLANTED_ROUTES=1): a clean page inside a route group, for e2e/quality/vitals.spec.ts.
export default function PlantedVitals() {
  return (
    <>
      <a href="#landing-main" style={{ display: 'inline-block', minHeight: 24 }}>
        Skip to content
      </a>
      {/* The marketing layout's skip link targets the group's main by this id, as the landing's does. */}
      <main id="landing-main" tabIndex={-1}>
        <h1>Planted vitals page</h1>
        <p>This page exists only in test builds.</p>
      </main>
    </>
  )
}

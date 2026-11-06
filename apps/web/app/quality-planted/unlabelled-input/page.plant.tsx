// Test-only (built when PLANTED_ROUTES=1): the crawl must fail on this unlabelled input (#116).
export default function PlantedUnlabelledInput() {
  return (
    <>
      <a href="#main" style={{ display: 'inline-block', minHeight: 24 }}>
        Skip to content
      </a>
      <main id="main">
        <h1>Planted failure</h1>
        <input />
      </main>
    </>
  )
}

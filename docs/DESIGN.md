---
name: Skyclause
description: 'The call for every window. A quiet black-and-crimson landing page and a dark data-terminal app for live rain, haze and stadium-crowd signals around Bukit Jalil, approved calls and next-day grades.'
colors:
  brand:
    crimson: '#b11226'
    crimson-foreground: '#ffffff'
  landing:
    background: '#0a0a0a'
    surface: '#151515'
    foreground: '#efefef'
    muted-foreground: '#8c8c8c'
    primary: '#b11226'
    primary-foreground: '#ffffff'
    field: '#efefef'
    field-foreground: '#0a0a0a'
    field-muted-foreground: '#595959'
  dark:
    background: '#171719'
    card: '#131217'
    popover: '#212023'
    foreground: '#ffffff'
    secondary-foreground: '#bdbdc0'
    muted-foreground: '#8a8c92'
    primary: '#ffffff'
    primary-foreground: '#131217'
    secondary: '#212023'
    muted: '#212023'
    accent: '#212023'
    accent-foreground: '#ffffff'
    border: '#222224'
    rule: '#1b1a1f'
    control: '#3a3a3e'
    input: '#6a6c72'
    ring: '#ffffff'
    selection: '#f0566c'
    destructive: '#f0566c'
    sidebar: '#171719'
    chart-1: '#f0566c'
    chart-2: '#bdbdc0'
    chart-3: '#8a8c92'
    chart-4: '#d9a441'
    chart-5: '#3a3a3e'
    grid: '#2a292e'
    status:
      neutral: { background: '#212023', foreground: '#bdbdc0' }
      warning: { background: '#2a2416', foreground: '#d9a441' }
      critical: { background: '#2c1a20', foreground: '#f0566c' }
      no-call: { background: 'transparent', foreground: '#bdbdc0', border: '#6a6c72' }
  light:
    background: '#f6f6f7'
    card: '#ffffff'
    popover: '#ffffff'
    foreground: '#111113'
    secondary-foreground: '#3f4246'
    muted-foreground: '#5f6368'
    primary: '#1d1f20'
    primary-foreground: '#ffffff'
    secondary: '#f0f0f2'
    muted: '#f0f0f2'
    accent: '#f0f0f2'
    accent-foreground: '#111113'
    border: '#e4e4e7'
    rule: '#efeff1'
    control: '#d1d3d8'
    input: '#8b8e94'
    ring: '#111113'
    selection: '#b11226'
    destructive: '#9b0f24'
    sidebar: '#f6f6f7'
    chart-1: '#b11226'
    chart-2: '#5f6368'
    chart-3: '#8b8e94'
    chart-4: '#966400'
    chart-5: '#d1d3d8'
    grid: '#e4e4e7'
    status:
      neutral: { background: '#ededef', foreground: '#3f4246' }
      warning: { background: '#fdf3dc', foreground: '#966400' }
      critical: { background: '#fdecef', foreground: '#9b0f24' }
      no-call: { background: 'transparent', foreground: '#3f4246', border: '#8b8e94' }
  high-contrast-dark:
    background: '#000000'
    popover: '#121212'
    foreground: '#ffffff'
    muted-foreground: '#d4d4d4'
    border: '#8a8a8a'
    input: '#ffffff'
    ring: '#ffffff'
    selection: '#ff6b80'
    warning: '#ffc04d'
  high-contrast-light:
    background: '#ffffff'
    popover: '#ffffff'
    foreground: '#000000'
    muted-foreground: '#2b2b2b'
    border: '#575757'
    input: '#000000'
    ring: '#000000'
    selection: '#8f0b1e'
    warning: '#6b4500'
typography:
  # One family plus a code face: JetBrains Mono for code, CLI output and the clause condition field only.
  sans: '"Work Sans Variable", "Work Sans", system-ui, sans-serif'
  code: '"JetBrains Mono Variable", ui-monospace, monospace'
  numerals: tabular-nums
  landing:
    display: { size: 'clamp(48px, 5vw, 80px)', weight: 300, line-height: 1, tracking: '-0.035em' }
    head: { size: 'clamp(26px, 2.1vw, 32px)', weight: 500, line-height: 1.1, tracking: '-0.02em' }
    lead: { size: 'clamp(20px, 1.1rem + 0.7vw, 26px)', weight: 400, line-height: 1.3 }
    body: { size: 'clamp(17px, 1rem + 0.25vw, 19px)', weight: 400, line-height: 1.55 }
    small: { size: '14px', weight: 400, line-height: 1.5 }
  app:
    title: { size: 26, weight: 700, line-height: 32 }
    answer-figure: { size: 30, weight: 500, line-height: 36 }
    section: { size: 20, weight: 400, line-height: 28, color: muted-foreground }
    card-title: { size: 16, weight: 600, line-height: 24 }
    figure: { size: 20, weight: 500, line-height: 28 }
    body: { size: 13, weight: 400, line-height: 20 }
    body-comfortable: { size: 14, weight: 400, line-height: 20 }
    small: { size: 12, weight: 400, line-height: 16 }
    badge: { size: 12, weight: 500, line-height: 16 }
    code: { size: 13, family: code, line-height: 20 }
rounded: { landing: 0, card: 6, input: 6, menu-item: 4, control: 9999, badge: 9999, timeline-bar: 4, chart-bar: 0 }
spacing:
  base: 4
  app: { page-padding: 32, gap: 24, card-padding: 20, band-gap: 64 }
  landing: { margin: 40, margin-phone: 20, column: 520, section-gap: 128 }
components:
  button: { height: 34, padding-x: 14, radius: 9999 }
  # Hero button light (#efefef, #0a0a0a label); the call-to-action button is the crimson one.
  button-landing: { height: 40, padding-x: 18, radius: 0, hero-fill: '#efefef', cta-fill: '#b11226' }
  button-phone: { height: 44 }
  input: { form: 40, toolbar: 34, radius: 6 }
  rows: { table: 42, table-comfortable: 48, table-header: 38, list: 28, tab: 40, nav: 34 }
  marks: { badge: 20, chip: 20, touch-target: 44 }
  sidebar: { width: 224, collapsed: 50, icon: 16, label: 14 }
  bottom-bar: { height: 56, item-min: 44 }
  window-strip: { lane-5min: 48, lane-60min: 72, lane-span: 20, axis: 20 }
---

# Skyclause design

How Skyclause looks and behaves: tokens, the art direction of the landing page and the app, components, screen specs, charts, embeds, voice and accessibility rules. The YAML frontmatter carries the tokens for the shadcn design-system flow; requirements and routes live in the [PRD](/docs/PRD.md#information-architecture) and words in the [glossary](/docs/PRODUCT.md#glossary). Every example is a real reading, a labelled replay or labelled arithmetic, each with its date.

Contents:

1.  [Overview](#overview)
1.  [Inspirations](#inspirations)
    1.  [References by surface](#references-by-surface)
    1.  [Patterns to avoid](#patterns-to-avoid)
1.  [Landing art direction](#landing-art-direction)
    1.  [Landing composition](#landing-composition)
    1.  [Landing copy deck](#landing-copy-deck)
    1.  [The live window picker](#the-live-window-picker)
    1.  [Landing imagery](#landing-imagery)
    1.  [Landing motion](#landing-motion)
1.  [App style](#app-style)
    1.  [App shell](#app-shell)
    1.  [Colour budget and face](#colour-budget-and-face)
1.  [Themes](#themes)
1.  [Colour](#colour)
    1.  [Mode colours](#mode-colours)
    1.  [Contrast ratios](#contrast-ratios)
1.  [Typography](#typography)
1.  [Layout](#layout)
1.  [Elevation](#elevation)
1.  [Shapes](#shapes)
1.  [Motion](#motion)
1.  [Components](#components)
    1.  [shadcn style and setup](#shadcn-style-and-setup)
    1.  [Components per need](#components-per-need)
    1.  [Product components](#product-components)
    1.  [CLI output](#cli-output)
1.  [Screens](#screens)
    1.  [Dashboard](#dashboard)
    1.  [Approvals queue](#approvals-queue)
    1.  [Bundle and call detail](#bundle-and-call-detail)
    1.  [Approver alert](#approver-alert)
    1.  [Project overview](#project-overview)
    1.  [Create project and first run](#create-project-and-first-run)
    1.  [Windows](#windows)
    1.  [Signals](#signals)
    1.  [Clause sheet editor](#clause-sheet-editor)
    1.  [Ledger](#ledger)
    1.  [Evidence requests and packs](#evidence-requests-and-packs)
    1.  [Analysis](#analysis)
    1.  [Subscribers and preferences](#subscribers-and-preferences)
    1.  [Developer playground](#developer-playground)
    1.  [Connect your AI](#connect-your-ai)
    1.  [Settings](#settings)
    1.  [Organisation settings](#organisation-settings)
    1.  [Sign-in and guest entry](#sign-in-and-guest-entry)
    1.  [The Commons](#the-commons)
    1.  [Public project page and public ledger](#public-project-page-and-public-ledger)
    1.  [Embed widget](#embed-widget)
    1.  [Docs site](#docs-site)
1.  [Data visualisation](#data-visualisation)
1.  [Web components and brand assets](#web-components-and-brand-assets)
    1.  [Mark and wordmark](#mark-and-wordmark)
    1.  [Favicons](#favicons)
    1.  [Open Graph card](#open-graph-card)
    1.  [oEmbed card](#oembed-card)
    1.  [Custom elements](#custom-elements)
    1.  [Subscribe button](#subscribe-button)
    1.  [Email notice and ICS entry](#email-notice-and-ics-entry)
1.  [Voice and content](#voice-and-content)
1.  [Accessibility](#accessibility)
1.  [Responsive](#responsive)
1.  [Do's and don'ts](#dos-and-donts)
1.  [Known gaps](#known-gaps)
1.  [See also](#see-also)

## Overview

- **The idea.** On this page, **the window** (a class, an event or a commute wave: the 15:30 release wave on 2 November 2026, when the gauge by LRT Bukit Jalil logged 39.0 mm in the 60 minutes to 15:00, or an evening event on a stadium night) becomes **a minute-by-minute strip with one crimson line marking the window**. The competitor test holds: a weather app has no declared window, and a crowd forecaster has no approved call to mark on it.
- **Two surfaces, one family.** The landing page adopts the dealt sheet "The quiet instrument" (seed 1236965075, Work Sans, black and crimson, hero "Control that reads the page"); the app adopts "Data terminal" (seed 134039495, dark, every selection a 1px accent line, signs not colour on numbers), dealt with the landing's palette and type kept, with one redraw recorded under [App shell](#app-shell).
- **The face.** Crimson `#b11226` from the brand replaces the app sheet's dealt blue as the one accent line; on dark app surfaces it is lifted to `#f0566c` so a 1px line holds 5.33:1 on the ground. It never fills an app button and never colours a number.
- **The signature element: the window strip.** A minute-by-minute strip of one window: 5-minute rain bars, the rolling 60-minute total against the Lebat line (31 mm in an hour, JPS's class), the MET warning's valid span, the arrival and exit periods of a stadium night, and each input's age, with the window itself marked by a 1px crimson line exactly as wide as it. It appears in the landing hero (live), on bundle, call and project pages, on public pages, in `<skyclause-window>` and on Open Graph cards.
- **The data behind the examples.** The 2 November 2026 figures at 5-minute resolution come from the [JPS 5-minute series][jps-series] for `0232901RF`, captured at 21:12 MYT on 5 November 2026 and [stored][jps-capture], since the endpoint keeps 7 days; every 60-minute total is our arithmetic on that series. APIMS readings come from the [APIMS map feed][apims-map] and MET warnings from the [data.gov.my warning feed][met-warn], both captured a minute later, at 21:13 MYT, and stored too ([APIMS][apims-capture], [warnings][met-capture]). No bundle, approval or notice has ever happened, so those states appear only as templates with named fields.
- **What the design never does.** Show a value that is not live or not labelled replay; swap to a recording when a feed fails; let colour carry a mode alone; draw a chart without a scale and dates.

## Inspirations

Gathered on 5 November 2026 from Awwwards, Best Designs on X and the galleries ranked on [mkdir.directory](https://mkdir.directory/) (38 galleries, voted). Patterns were judged from gallery captures and cover frames, not from the live sites, and nothing is copied: each reference lends a principle to one Skyclause surface.

### References by surface

- **Landing.** [UserJot][userjot] (Saaspo, "Thin layout"): one narrow column interrupted by a dark app fragment used as the picture, which is the landing's column and its `data-ui` fragments. [Townhouse][townhouse] (Awwwards Nominee, 13 October 2026): a one-line live status under the real product, which becomes the hero's freshness line. [fromearth / 2050][fromearth] (Awwwards Nominee, 26 October 2026): a large label on a tick-mark scrubber, which becomes the hero's window picker and its large mode word. [DeepBook][deepbook] (Awwwards Site of the Day, 3 November 2026): one accent used only on actions and data, which is the crimson rule. [incident.io][incident] (SaaS Landing Page): near-black with crimson and an investigation checklist, which calibrates the accent and the agent trace. [Monolog][monolog] (Footer.design): a local clock in the footer, which becomes "Kuala Lumpur, 21:12 MYT".
- **App shell, queue and ledger.** [Agent approval cards][kvnkld-cards] (@kvnkld, 20 August and 8 September 2026): title, what will happen, a checklist and a primary action with its key hint, which shapes the bundle card; its "Auto Approve in 28s" becomes the window's expiry, never an automatic approval. [Clerk dashboard][clerk] (Navbar Gallery): a breadcrumb of scope switchers and a "Watching for users" empty state, which shapes the breadcrumb, the first run and Connect your AI. [Osha_Lion audit log][collectui-table] (CollectUI) and [Marathon changelog][marathon] (Saaspo): flat rows, filter chips, CSV export and "Viewing 1 to 15 of 145", which is the ledger and the audit log. [Weave][weave] (Design Details): one accent used only on deltas, which keeps colour on what needs a decision. [batukrskl settings][collectui-settings] (CollectUI): grouped settings nav, read-only IDs with copy, which is settings.
- **Signals, charts and grades.** [Sensor details][dejv] (@dejvdesign, 1 June 2026): tabs per sensor group and a dense table with status chips, which is the signals screen. [Monitor overview][monitor] (@disarto_max, 11 July 2026): a strip of thin tick bars per check and "last checked 3 min ago", which is the source health row. [Neon][neon] (Design Details): a limit line with the breach annotated in place, which is the Lebat line and its crossing label. [Prompt Injection Scanner][scanner] (@jeetnirnejak, 12 August 2026): a threshold marker with itemised reasons, which is the clause test result. [Mebius charts kit][mebius] (Movin): a ghost target behind the actual, which is the Crowd forecast band against gate taps. [Climate TRACE][climate-trace] (Awwwards Honorable Mention, 11 March 2024): one figure with its method note, which is the grade card. [Field Rank][field-rank] (Awwwards Nominee, 16 October 2026): "Every rank traces back to finish lines", which is the provenance line under every grade. [Departures in pixel art][departures] (@txnioh, 27 September 2026): a station board with the next departure as a block, which shapes the Crowd night lane.
- **Agent and developer surfaces.** [PayPath][paypath] (Design Details) and [kvnkld's agent conversation][collectui-agents] (CollectUI): an ordered column of agent events with durations, the last one live, and flagged evidence lines, which is the agent trace. [stormy][stormy] (@ash1sh0kumar, 12 July 2025): aligned key and value output, which is the CLI's layout. [Attio help](https://www.navbar.gallery/navbar/attio-help) (Navbar Gallery): tree nav with search, breadcrumb, title and "On this page", which is the docs site.
- **Embeds, favicons, cards and states.** [Devouring Details][devouring] and [Toolbar][toolbar] Open Graph images (Sections.wtf): one shape plus typographic corners, and one real UI fragment, which is the Open Graph card. The [Best Designs on X OG gallery][og-gallery]: Railway's real state chips drawn into the card. [Impractical favicon][favicon] (@AdityaSur11, 13 October 2026): state in the tab, which is the live favicon, done by static swaps. [Numbers][wherescz] (@wherescz, 9 September 2026): "only the columns whose digit moved turn", which is how live numbers change on the landing. [Kobbe 404][kobbe] (404s): a label, one sentence and three exits, which is every error page.

[userjot]: https://saaspo.com/pages/userjot-landing-page
[townhouse]: https://www.awwwards.com/sites/townhouse
[fromearth]: https://www.awwwards.com/sites/fromearth-2050
[deepbook]: https://www.awwwards.com/sites/deepbook
[incident]: https://saaslandingpage.com/incident-io/
[monolog]: https://www.footer.design/sites/monolog
[kvnkld-cards]: https://bestdesignsonx.com/kvnkld/status/2089693820313366635
[clerk]: https://www.navbar.gallery/navbar/clerk-dashboard
[collectui-table]: https://collectui.com/designs/table-ui-design-inspiration
[marathon]: https://saaspo.com/pages/marathon-changelog-page
[weave]: https://designdetails.io/sections/weaveos-com--home--features-4
[collectui-settings]: https://collectui.com/designs/settings-page-ui-design-inspiration
[dejv]: https://bestdesignsonx.com/dejvdesign/status/2061031980775403785
[monitor]: https://bestdesignsonx.com/disarto_max/status/2075626855386787882
[neon]: https://designdetails.io/sections/neon-com--home--features-3
[scanner]: https://bestdesignsonx.com/jeetnirnejak/status/2087169824418046287
[mebius]: https://movin.design/video/mebius-free-charts-kit/
[climate-trace]: https://www.awwwards.com/sites/climate-trace
[field-rank]: https://www.awwwards.com/sites/field-rank
[departures]: https://bestdesignsonx.com/anaclumos/status/2103081108502135084
[paypath]: https://designdetails.io/sections/paypath-ai--home--features-6
[collectui-agents]: https://collectui.com/designs/ai-agents-ui-design-inspiration
[stormy]: https://bestdesignsonx.com/ash1sh0kumar/status/1943316174894231597
[devouring]: https://sections.wtf/shots/devouring-details-open-graph
[toolbar]: https://sections.wtf/shots/toolbar-open-graph
[og-gallery]: https://bestdesignsonx.com/og-images
[favicon]: https://bestdesignsonx.com/AdityaSur11/status/2109214925465776535
[wherescz]: https://bestdesignsonx.com/wherescz/status/2097469280514441687
[kobbe]: https://www.404s.design/sites/kobbe

### Patterns to avoid

- **Glass, glow and gradients:** frosted strips, "liquid glass" panels, gradient-glow pills and gradient blobs on Open Graph cards, all seen in the same galleries.
- **Fake dashboards in device frames:** DeepBook's monitor shot and Bluejack's tilted collage. Skyclause shows its real interface with real readings, or nothing.
- **Hero furniture:** award pills, a dial ringed by floating feature cards, numbered three-up feature cards (Field Rank's weakest section).
- **Spectacle over data:** fromearth's red heat halo and globe-first scroll.
- **Automatic approval countdowns:** the approval card's "Auto Approve in 28s". A bundle shows when it expires and waits for a person.
- **Monospace as costume:** the mono metadata of Field Rank, Superscript, Townhouse, the Axiom card and @kyleanthony's terminal labels. Their content (IDs, times, counts) is kept and set in Work Sans tabular figures.
- **Vanity counters and sparklines:** Superscript's "2,048,510 Transactions" strip, a sparkline in every table row. Skyclause prints a count only with its n and period.

## Landing art direction

The landing page adopts "The quiet instrument" whole: radical understatement, a narrow column, small exact demonstrations and composed emptiness. PRD's [landing requirements](/docs/PRD.md#landing-page-lnd) set what it must do; this section sets how it looks and what it says.

### Landing composition

- **Ground, inks and crimson:** `#0a0a0a` ground, `#efefef` ink, `#8c8c8c` soft ink, `#151515` for the hero's lighter half. Crimson marks one element per screen: in the hero, the window line inside the picker (a `data-ui` fragment, so the app's lifted `#f0566c`), while the hero button stays light (`#efefef` fill, `#0a0a0a` label) as the blueprint asks; in the showcase, the window line on the middle copy's strip; in features, the selection line inside the panel; in the FAQ, the selected question's dot; in the call to action, the button (`#b11226`, white label). How it works, proof and pricing carry none. No accent characters in any heading (house rule over the palette's "a few characters in a heading").
- **Frame:** one pair of 40px outer margins (20px on phones), a 12-column grid with 24px gutters for the section blueprints, the text column 520px wide starting at about 22% of the viewport. Sections are separated by space only, 120–140px. Nothing spans the width until the footer row.
- **Hero, "Control that reads the page":** two halves split by tone at 50%: left `#0a0a0a`, right `#151515`. Left: the mark top-left at 40px, two-thirds empty ground (the page's one deliberate rest), then bottom-left the h1, one supporting sentence in soft ink held to 44ch, and one light rectangular button. Right: the live window picker, about 450px square, root marked `data-ui`. No navigation bar; one text link top-right, "Sign in", at 15px.
- **Hierarchy:** the one large thing on the first screen is the picker's mode word ("Normal") at `clamp(48px, 5vw, 80px)`, weight 300. The h1 stays at the blueprint's `clamp(26px, 2.1vw, 32px)`, weight 500, and section headings use the same step, as the sheet's idea asks ("a headline barely larger than body text").
- **Section order:** showcase (one row, three states) → how it works (itinerary on a slip) → proof (one quiet row of source names) → features (panel with margin notes) → pricing (prices like a menu) → FAQ (question index, one answer) → call to action (a plain sentence, one action) → footer row. Each keeps its blueprint's geometry; lines and borders appear only inside tables, forms and `data-ui` fragments. Pricing and the FAQ may invert to `#efefef` ground with `#0a0a0a` ink and `#595959` soft ink (6.09:1).

### Landing copy deck

Numbers come from the [JPS 5-minute series][jps-series] (2 November replay), [the Skyclause idea](/docs/ideas/02-skyclause.md#storms-the-exit-wave-meets-the-afternoon-cell), [the Fanfall idea](/docs/ideas/04-fanfall.md#problem-and-evidence) and readings captured at 21:12 MYT on 5 November 2026; the page links each number to its source ([LND-4](/docs/PRD.md#landing-page-lnd)).

- **h1 (25 characters):** "The call for every window"
- **Supporting sentence:** "Skyclause reads the rain gauge, the haze index and the stadium listings around Bukit Jalil, and makes one approved, graded call for each class, event or commute window."
- **The one action:** a light button "Open the Commons" to `/guest`. Top-right text link: "Sign in".
- **Showcase, heading "One window, three moments":** three copies at 640px of the clause engine verdict for the 15:30 release wave on 2 November 2026 (89 sessions ended at 15:30, per the Skyclause idea), labelled in the left columns "Before", "Crossing" and "After". Before, the 14:55 reading: "Normal · 29.5 mm in 60 min · Lebat starts at 31 mm". Crossing, the 15:00 reading at the 15:05 poll: "Commute disruption · Storm confirmed · 39.0 mm in 60 min (Lebat)". After, the 16:00 reading: "Commute disruption holds · 24.0 mm in 60 min; the window's span peaked at 59.5 mm at 15:35". The middle copy is live: focusing or clicking it reveals the fired clause's inputs and ages (gauge `0232901RF`, reading 15:00, 5 min old at the 15:05 poll; clause span 15:00–16:30, from 30 minutes before to 60 minutes after the window ends; Lebat 31–60 mm). Caption: "Replay of 2 November 2026 from the JPS 5-minute series; 60-minute totals are our arithmetic. Clause engine verdict: not reviewed, not sent."
- **How it works, heading "From gauge to notice":** paragraph "Every call ends as a ledger row, and the row is its receipt. Here is one, printed." The slip, under three headings: **Every weekday** (rain gauge polled, every 5 min · MET warnings polled, every 10 min · APIMS index read, hourly · morning run, 06:45); **Monday 2 November** (60-minute rain reaches Lebat, 39.0 mm, 15:00 · the 15:05 poll changes the verdict: the crossing, 15:05 · decision agent drafts the bundle, by 15:15 · approver approves, about 15:20 · 89 sessions end, 15:30); **The next morning** (window graded against the gauge, by 06:45 · stadium night graded against Rapid Rail gate taps, D+1). Inverted final row: "One approved call, on the record · about 15 min from the crossing". Under the slip at 14px: "Worked example from the Skyclause idea: times after 15:05 are inferred from documented delays, not measured, and no call was made that day."
- **Proof, opening words as the h2 "Readings from":** then the names at 22px: JPS Infobanjir · MET Malaysia · DOE APIMS · Rapid Rail · GoLive · Wikipedia. Under the row at 14px in soft ink: "Public data, used under each source's terms. Skyclause is not affiliated with or endorsed by APU, KPT, JPS, MET Malaysia, DOE, Prasarana or Rapid KL, or the stadium." No logos.
- **Features, heading "Read before you approve":** the bundle page at 380×680px as a template: its measured parts (fired clause, readings, ages, strip) filled from the 2 November replay, the rest as named fields (`{recipients}`, `{wording}`, `{approver}`). Six notes: "Disagreement first" (if the agent and the clause engine differ, the bundle says so before anything else); "Fired clauses" (each with its reading and age: gauge 39.0 mm in 60 min, 5 min old at the 15:05 poll); "Warning, verbatim" (MET text in Malay with an English gloss and its valid span); "The window strip" (five-minute rain, the Lebat line and the window on one clock); "Who hears it" (the recipients each call covers, and their wording); "Approve, edit, reject" (one approval per bundle; a rejected call is still graded).
- **Pricing, heading "What it costs":** two groups. **Free:** Commons ("One shared live project for Bukit Jalil; guest windows last 14 days"), Community ("One project of your own"). **Paid:** Team and Campus, with the MYR prices and inclusions from [PRODUCT's pricing](/docs/PRODUCT.md#packaging-and-pricing). Every price, free ones included, carries "proposal, untested" beside it ([LND-6](/docs/PRD.md#landing-page-lnd)).
- **FAQ, heading "Common questions":** "Is this an emergency warning service?" → "No. Skyclause is not a safety or emergency service. In an emergency, call 999." · "Who makes the call?" → "An AI agent drafts it from the clause sheet; a person on the approver rota approves it before anyone hears it." · "Can my AI approve a call?" → "No. AI tools can read, draft and ask for evidence. Only a person with the Approver role or above approves." · "What happens when a feed fails?" → "The call says so, for example 'No call: gauge silent 25 min'. It never shows an old reading." · "Where does the data come from?" → "JPS gauge `0232901RF`, MET Malaysia, DOE APIMS, Rapid Rail gate taps at `SP17`, and GoLive and Wikipedia listings." · "Is it right?" → "Every call is graded after the fact and published with n and a 95% interval. No live grades yet (n=0)." · "Does it work outside Bukit Jalil?" → "The Sky pack works with any station JPS, MET and APIMS cover in Malaysia; the Crowd pack needs a venue with listings and a rail station with gate taps." · "Does it excuse attendance?" → "No. Teaching mode is the lecturer's and the university's decision."
- **Call to action:** "Open the Commons and read the call for Bukit Jalil right now." Crimson button "Open the Commons"; text link "Read the docs".
- **Footer row:** left "Skyclause · Kuala Lumpur, 21:12 MYT" (a live clock); centre "Docs · Status · Terms · Bahasa Melayu"; right "© 2026 · Privacy".

### The live window picker

The hero's control is the product's defining control: pick a window and read the verdict. It acts on the live world, never on recordings ([LND-1 to LND-3](/docs/PRD.md#landing-page-lnd)).

- **Control:** a date row (Today, then 7 named days, the MET forecast's horizon) and a 24-hour minute strip on which the visitor drags a window, or sets start and end in two time fields with 15-minute steps. The chosen span is marked by the 1px crimson line as wide as the window. Keyboard: arrows move the start by 15 minutes, Shift with arrows changes the length; the fields are the no-drag path.
- **Readout:** the mode word per pack at the display step, then at 14px every fired clause, every input with source, station ID and age, and the label "Clause engine verdict: not reviewed, not sent". Under it, the latest approved call by permalink, or "No approved call yet (n=0)".
- **Captured example, 21:12 MYT on 5 November 2026, window 21:30–23:00:** Sky: Normal; no clause fires. Inputs, from the stored [gauge][jps-capture], [APIMS][apims-capture] and [warning][met-capture] captures: gauge `0232901RF` 0.5 mm in 60 min, 12 min old · API 67 at Cheras `CA16W`, 12 min old · 1 MET thunderstorm warning in force 21:00–01:00, not naming Kuala Lumpur, 7 min old. Crowd: The Weeknd listed, forecast 26,997 exits (band 19,268–32,053, the Fanfall idea's arithmetic from 07:25 MYT).
- **Errors are errors:** a stale input reads "No call for Storm confirmed: gauge `0232901RF` silent since {HH:MM} MYT", the shape PRD fixes; a failed fetch reads "Couldn't reach the JPS gauge at {HH:MM}. Retry". In both, no rain value is shown and nothing recorded stands in ([LND-2](/docs/PRD.md#landing-page-lnd)).
- **Without script:** the server renders the verdict for the next hour with ages and a plain form for the window.

### Landing imagery

Interface fragments built from real data carry most of the page (the hero picker, the three showcase copies, the features panel), each marked `data-ui` so the app's borders and radii apply inside. Real pictures of Bukit Jalil's world carry three places, each captioned with what it is and credited under it; none is presented as Skyclause's users or product. Candidates found with `assets.mjs` on 5 November 2026 (Openverse returned HTTP 500; all from Wikimedia Commons):

| Picture                                                    | Creator         | Licence      | Use                  |
| ---------------------------------------------------------- | --------------- | ------------ | -------------------- |
| [Bukit Jalil National Stadium at night][img-stadium]       | Pak Misai       | CC BY-SA 4.0 | Pricing, 4:5 crop    |
| [Rain, Kuala Lumpur][img-rain]                             | Eutah Mizushima | CC0          | How it works, 3:2    |
| [Bukit Jalil LRT Panorama][img-lrt-pano] (2025)            | Pixdoet         | CC BY 4.0    | FAQ, data sources    |
| [Haze in Kuala Lumpur (September 2026, AQI 200)][img-haze] | Renek78         | CC0          | Reserve, haze season |
| [The exterior of Bukit Jalil LRT Station][img-lrt-ext]     | Fikku fiq       | CC BY-SA 4.0 | Reserve              |
| [Pagar A Stadium Nasional Bukit Jalil][img-gate-a]         | PeaceSeekers    | CC BY 4.0    | Reserve              |

No honest clip of rain at Bukit Jalil exists in the open collections (Commons returned Kerala and Grand Canyon rain), so the moving picture is a slow drift on the stadium photograph plus the hero's live bars.

[img-stadium]: https://commons.wikimedia.org/wiki/File:Bukit_Jalil_National_Stadium_at_night.jpg
[img-lrt-pano]: https://commons.wikimedia.org/wiki/File:Bukit_Jalil_LRT_Panorama.jpg
[img-rain]: https://commons.wikimedia.org/wiki/File:Rain,_Kuala_Lumpur_(Unsplash).jpg
[img-haze]: https://commons.wikimedia.org/wiki/File:Haze_in_Kuala_Lumpur_(September_2026,_AQI_200).jpg
[img-lrt-ext]: https://commons.wikimedia.org/wiki/File:The_exterior_of_Bukit_Jalil_LRT_Station.jpg
[img-gate-a]: https://commons.wikimedia.org/wiki/File:Pagar_A_Stadium_Nasional_Bukit_Jalil.jpg

### Landing motion

- **Signature, the masked headline:** each line of the h1 rises from behind its own baseline in 900ms with `cubic-bezier(0.16, 1, 0.3, 1)` (the second line on phones 110ms later); the sentence and button then fade up together over 300ms.
- **Section entrances:** heading, then text, then fragment or picture, staggered 70ms, rising 24px with opacity, once per section; content is never hidden if script fails.
- **Feedback and live movement:** button press scales to 0.98 in 100ms; soft ink brightens to full in 150ms; the FAQ pane crossfades in 150ms; a new 5-minute bar grows from the baseline in 400ms and changed digits turn per column. The stadium photograph drifts from scale 1.00 to 1.04 over 24s. Under reduced motion every rise, drift and growth is dropped and content is in place at first paint ([LND-5](/docs/PRD.md#landing-page-lnd), [NFR-7](/docs/PRD.md#non-functional-requirements)).

## App style

The app adopts "Data terminal": a monitoring screen read in long sessions, cards darker than the ground, tabular digits that stack, signs instead of colour, and every selection (tab, toggle, range, nav item, the window on a strip) marked by the same 1px crimson line exactly as wide as its label, lying on the nearest existing edge. Everything the sheet does not fix comes from the shared app-screen defaults.

### App shell

- **Redraw, recorded:** the sheet's unlabelled icon rail is replaced by a labelled sidebar, because Skyclause has nine destinations and the app-screen rules name "an icon rail where people needed labels" as a failure. The style's move, the 1px crimson selection line, stays.
- **Sidebar, 224px,** on the page ground with a 1px `#222224` edge: the mark and "Skyclause" at the top over the organisation switcher; 16px outline icons with 14px labels on 34px rows: Dashboard, Approvals (the count of bundles needing review, the only count), Projects, Analysis; a gap; Developers, Connect your AI; at the foot Settings, Account and Help. The active item is its label in full ink with a 1px crimson line under the label, as wide as the label; the rest are muted.
- **Collapsed rail, a preference:** a control at the sidebar's foot (kept per account) folds it to a 50px rail of icons, each with a tooltip and an accessible name equal to its label; the active item then carries a 1px crimson bar on the rail's right edge, as tall as the icon.
- **Scope and tabs:** a 48px top line holds the breadcrumb "organisation › project" as two switchers, the freshness stamp and the palette hint "⌘K". Under it, on a full-width 1px rule, the project tabs: Overview, Windows, Signals, Clauses, Calls, Ledger, Analysis, Subscribers, Settings; the active one is white with the crimson line under its label. No filled pills.
- **Phone:** a bottom bar of five labelled items (Dashboard, Approvals, Projects, Analysis, More); the tab row scrolls sideways inside its own row.

### Colour budget and face

- **Budget:** under 3% of pixels on any screen. Crimson appears only as 1px selection lines, the main data element of a live chart (the 60-minute rain line, the Crowd forecast mark), critical mode badges and error chips. The primary button is inverted white with a near-black label.
- **Numbers:** white for the identity and the figure that answers the screen's question, grey for the rest; signs live in the text ("+1,240 exits above baseline", "−3 min").
- **Where the face shows first:** the dashboard's first needs-review bundle and the project overview carry an inline window strip; the call page opens on the full strip; the Commons opens on the live strip for the next hour.

## Themes

- **Dark (default):** the app sheet's tokens with crimson on the accent role. Landing pages and the hero stay dark in every theme.
- **Light (derived):** the same roles and budget: `#f6f6f7` ground, white cards with a `#e4e4e7` border, `#111113` ink, `#5f6368` muted, crimson `#b11226` as the selection line and chart hue, near-black primary button. Derived here, not dealt; checked for contrast only.
- **System and high contrast:** system follows `prefers-color-scheme` live, and `prefers-contrast: more` turns high contrast on. High contrast is a modifier on dark or light: pure black or white ground, borders at 6:1 or more, selection lines 2px, pills lose their tints and gain a 1px border in their ink, chart grids drop, focus ring 3px. Under `forced-colors: active` the app uses system colours and keeps every glyph and word.
- **Applying the setting:** `/account/appearance` stores theme, contrast, density (compact 13px body and 42px rows; comfortable 14px and 48px), sidebar collapse, reduced motion and language on the account ([SET-2](/docs/PRD.md#settings-set)). The server renders `class="dark hc"` on `<html>` from the account, so no theme flash; `color-scheme` and `<meta name="theme-color">` match the ground. Public pages and embeds follow the viewer's `prefers-color-scheme` or the embed's `theme` attribute.

## Colour

Tokens are in the frontmatter as hex and map onto shadcn variables one to one: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `muted-foreground`, `accent` (the ghost hover wash, not crimson), `border`, `input`, `ring`, `destructive`, `sidebar` and `chart-1` to `chart-5`. Four tokens have no shadcn slot and get their own variables in `@theme inline`: `--selection` (the 1px line), `--rule`, `--control` and `--grid`, plus the status pairs.

- **Cards darker than the ground** in dark (`#131217` on `#171719`), white on grey in light. Two greys carry words: `#bdbdc0` secondary and `#8a8c92` meta in dark; `#3f4246` and `#5f6368` in light.
- **Crimson is one family:** in dark, selection, the data hue, the error and the critical status share `#f0566c`; in light, selection and data use `#b11226` and critical text `#9b0f24`.
- **Nothing that is fine is coloured.** Normal, fresh and sent are neutral. No green anywhere.
- **Inputs** carry a `#6a6c72` border in dark (3.41:1 on the ground) so a field reads as a field; buttons, which carry labels, use the quieter `#3a3a3e`.

### Mode colours

Every mode and state has a word and a glyph; colour only repeats them. Glyphs are a Skyclause set of SVGs on a 12px grid with a 1.5px stroke.

| Mode or state      | Pack  | Glyph                    | Colour level |
| ------------------ | ----- | ------------------------ | ------------ |
| Normal             | Both  | Ring                     | Neutral      |
| Storm watch        | Sky   | Hollow triangle          | Neutral      |
| Outdoor-limited    | Sky   | Half-filled disc         | Warning      |
| Commute disruption | Sky   | Filled triangle          | Critical     |
| Hybrid recommended | Sky   | Filled square            | Critical     |
| Surge night        | Crowd | Three rising bars        | Warning      |
| No call            | Both  | Dashed ring with a slash | No call      |
| Stale input        | Both  | Clock                    | Warning      |
| Input error        | Both  | Cross                    | Critical     |

The dataviz validator, run on 5 November 2026, separates warning from critical for deuteranopia in dark (`#d9a441` against `#f0566c`, ΔE 10.5) and in light only after the light pair moved to `#966400` and `#9b0f24` (ΔE 10.3; the first pair scored 2.3). Glyph and word stay mandatory either way.

### Contrast ratios

Computed with the WCAG 2.2 relative-luminance formula. Text needs 4.5:1, lines and UI parts 3:1. Tight pairs are in bold.

| Pair (foreground on background)                           | Ratio                                              |
| --------------------------------------------------------- | -------------------------------------------------- |
| Landing ink `#efefef` on `#0a0a0a` / `#151515`            | 17.22 / 15.88                                      |
| Landing soft ink `#8c8c8c` on `#0a0a0a` / `#151515`       | 5.89 / 5.43                                        |
| White on brand crimson `#b11226` (call-to-action button)  | 7.04                                               |
| Inverted field: `#0a0a0a` / `#595959` on `#efefef`        | 17.22 / 6.09                                       |
| Brand crimson `#b11226` on `#0a0a0a` (non-text)           | **2.81**: decorative only, never a sole state mark |
| Dark text `#ffffff` on ground / card / raised             | 17.90 / 18.64 / 16.21                              |
| Dark secondary `#bdbdc0` on card / raised                 | 9.95 / 8.65                                        |
| Dark muted `#8a8c92` on ground / card / raised            | 5.33 / 5.55 / **4.82**                             |
| Selection `#f0566c` on ground / card (1px line)           | 5.33 / 5.55                                        |
| Critical `#f0566c` / warning `#d9a441` on their tints     | **4.90** / 6.85                                    |
| Dark input border `#6a6c72` on ground / card              | **3.41** / 3.55                                    |
| Light text `#111113` on ground / card                     | 17.46 / 18.86                                      |
| Light muted `#5f6368` on card / ground / raised           | 6.05 / 5.60 / 5.32                                 |
| Light selection `#b11226` on card / ground                | 7.04 / 6.52                                        |
| Light critical `#9b0f24` / warning `#966400` on tints     | 7.41 / **4.62**                                    |
| Light input border and chart-3 `#8b8e94` on white         | **3.28** (marks and borders only)                  |
| High contrast: `#d4d4d4` / `#ff6b80` / `#ffc04d` on black | 14.17 / 7.67 / 12.90                               |
| High contrast: `#2b2b2b` / `#8f0b1e` / `#6b4500` on white | 14.16 / 9.40 / 8.48                                |

## Typography

- **One family plus a code face.** Work Sans for everything, on the landing and in the app, loaded as `@fontsource-variable/work-sans` (300–700); JetBrains Mono for code, CLI output and the clause condition field only. Station IDs in running text stay in Work Sans with `translate="no"`.
- **Tabular figures:** on 5 November 2026 both the `google/fonts` Work Sans variable file and Google's served Latin subset carried `tnum`, and the default digits are proportional (390–622 units wide), so `font-variant-numeric: tabular-nums` is set on every table, figure, time and live value.
- **Landing, five sizes:** display `clamp(48px, 5vw, 80px)` at 300 with −0.035em, only for the picker's mode word; head `clamp(26px, 2.1vw, 32px)` at 500 with −0.02em for the h1 and section headings; lead 20–26px (state words, proof names, the FAQ answer at 1.3 leading); body 17–19px at 1.55; small 14px (captions, credits, footer, the readout). Nothing below 14px.
- **App:** title 26/700; the answer figure 30/500 (at least 1.3 times its siblings); section titles 20/400 in muted; card titles 16/600; figures 20/500; body 13/20 (14/20 comfortable); labels, axis ticks and badges 12; nothing below 12.
- **Case and text:** sentence case for every heading, button and label (house rule; it overrides the Web Interface Guidelines' Title Case, as [NFR-8](/docs/PRD.md#non-functional-requirements) records); no uppercase tracked labels; `…` not `...`; curly quotes; non-breaking spaces in "10 min", "⌘ K" and "LRT Bukit Jalil"; `text-wrap: balance` on headings.

## Layout

- **App canvas:** the 224px sidebar, then fluid content with 32px side padding and one 24px gutter used both ways. At 1440px the content is 1152px: 12 columns of 74px and 11 gutters of 24px (888 + 264 = 1152); with the sidebar collapsed to 50px it is 1326px (12 × 88.5 + 264). Bands sit 64px apart.
- **Two-column rows:** 43/57 for list beside chart (485 + 24 + 643 = 1152); a narrow table of five columns or fewer runs to about 760px and pairs with the next block. Rows: tables 42px (48 comfortable) with a 38px header, card lists on a 28px pitch, two-line rows 44px.
- **Settings:** a 428px label column, a 24px gap and a 700px panel (428 + 24 + 700 = 1152). The approvals list runs 420px beside the bundle pane (420 + 24 + 708 = 1152).
- **Sticky parts** (the approval bar, table headers) set `scroll-padding` so a focused row is never under them.

## Elevation

- **At rest, no shadow:** a dark card is one tone step below the ground with a 1px `#222224` border; a light card is white with a `#e4e4e7` border. A border or a shadow, never both.
- **Floating only:** menus, popovers, the command palette, dialogs, sheets and toasts sit on `#212023` (dark) or white (light) with `0 12px 28px rgba(0,0,0,.2)` in dark and `0 8px 24px rgb(17 17 19 / .08)` in light, and no border. In shadcn, `--shadow-xs` and `--shadow-sm` are `0 0 #0000` and `--shadow-lg` takes the float shadow.
- **Landing:** no shadows; fragments marked `data-ui` keep the app's borders.

## Shapes

- **App radii:** cards, dialogs, inputs and selects 6px; menu items 4px; buttons, toggles, chips and badges fully round; timeline bars 4px; chart bars square. Three panel radii at most per screen.
- **shadcn radius pins:** `--radius-sm` 4px, `--radius-md` 4px, `--radius-lg` 6px, `--radius-xl` 6px, `--radius-2xl` 8px, `--radius-4xl` 9999px; `Button`'s variants change to `rounded-full`.
- **Landing:** square corners on everything outside `data-ui`; the slip's bottom edge is a zigzag cut with `clip-path`.
- **Selection line:** 1px tall (2px in high contrast), as wide as its label, square ends.

## Motion

App screens perform no entrances; motion is feedback, within PRD's [NFR-7](/docs/PRD.md#non-functional-requirements).

- **Durations:** hover and press 100–120ms; menus, popovers and tooltips 150ms; sheets and drawers 200ms with `cubic-bezier(0.32, 0.72, 0, 1)`; the selection line slides between tabs in 150ms.
- **Live data:** a new bundle row fades in over 200ms without sliding; a changed value updates in place and the freshness stamp changes; nothing pulses or glows. Under reduced motion the line jumps and sheets appear without travel.

## Components

### shadcn style and setup

- **Style: `nova`.** Its 32–36px controls match the app's 34px control height, its hairlines and tone steps match cards that carry no shadow, and its radius sits at the tight 6px. `mira` is denser (28–32px controls) than the sheet's 34px; `lyra`'s boxy edges suit the landing but not the app's round buttons.
- **Setup:** shadcn CLI 4.23.0 on Base UI (the default since July 2026), Tailwind CSS 4.3.4, Recharts v3 through `Chart`, versions per TRD's [stack](/docs/TRD.md#stack): `bunx --bun shadcn@latest init --base base --preset nova --template next`. Tokens go into the CSS file `info` names, hex kept; heights move together (button, input, select, toggle, tabs at 34px; form fields at 40px).
- **Focus:** a 2px solid `--ring` outline with a 2px offset on actions and fields. The ring is white or near-black, never crimson, so focus never reads as selection.

### Components per need

| Need                   | shadcn component                                                                                                             | Skyclause use                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Shell                  | `Sidebar` (224px, `collapsible="icon"` to 50px), `Tooltip`                                                                   | Labelled sidebar, rail as a preference                |
| Scope and tabs         | `Breadcrumb`, `DropdownMenu`, `Tabs` (line variant, 1px `--selection`)                                                       | Switchers, project tab row, analysis tabs             |
| Command palette        | `Command` in `Dialog`                                                                                                        | Cmd/Ctrl+K: projects, stations (`SP17`), calls        |
| Tables                 | `Table`, `ScrollArea`, `Pagination`                                                                                          | Ledger, signals, approvals, members, audit log        |
| Charts                 | `Chart` (Recharts v3)                                                                                                        | Analysis lines and columns; the strip is its own SVG  |
| Marks and callouts     | `Badge`, `Alert`                                                                                                             | Mode badge, "Replay", disagreement first, No call     |
| Empty and loading      | `Empty`, `Skeleton` (static, no pulse), `Spinner`, `Progress`                                                                | n=0 with the next action; first-run steps             |
| Agent activity         | `Trace`, `TraceLine`, `TraceCollapsible`                                                                                     | The run trace on bundle and call pages                |
| Forms                  | `Field`, `FieldGroup`, `FieldSet`, `Input`, `InputGroup`, `Select`, `Combobox`, `Textarea`, `Switch`, `Checkbox`, `Calendar` | Window, subscriber, settings and source forms         |
| Option sets            | `ToggleGroup` (text items, 1px selection line)                                                                               | Range (7D 30D 90D All), theme, view switch            |
| Overlays               | `Dialog`, `AlertDialog`, `Sheet`, `Drawer`, `Popover`, `HoverCard`                                                           | Re-check confirm, destructive confirm, phone approval |
| Feedback and keys      | `toast` (Base UI), `Kbd`                                                                                                     | "Saved", key hints A, E, R, J, K                      |
| Code                   | `Code Block`                                                                                                                 | CLI, curl, TypeScript, Python snippets                |
| Split panes and people | `Resizable`, `Avatar` with `AvatarFallback`                                                                                  | Clause grid beside its test pane; rota initials       |

### Product components

| Component         | Built on               | Anatomy                                                                                                                                                                             |
| ----------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window strip      | SVG, `Tooltip`         | Shared minute axis; lanes for 5-minute rain, 60-minute total with the Lebat line, warnings, crowd periods and input ages; the window as a 1px crimson line; "Now" as a 1px ink line |
| Call row          | `Table` row, `Badge`   | Mode badge · window and time · fired clause with values · input-age chips · state · expiry; actions on hover or focus                                                               |
| Bundle card       | `Card`, `Badge`, `Kbd` | `{trigger}` at `{HH:MM}` · project and pack · calls by mode · `{m} min` of SLA left · "Agrees" or "Disagrees on `{n}`" · escalation · "Approve `{n}` calls"                         |
| Listing card      | `Card`, `Badge`        | `{show}` · `{venue}` · `{date}` · doors and show times · `{source}` revision `{id}` · Proposed, Changed or Cancelled · "Single source" flag · List or Reject                        |
| Clause grid       | `Table`, `Field`       | Clause · reads · fires when (CEL, code face) · proposes · verdict now with age · last fired; the row under test outlined                                                            |
| Input-age chip    | `Badge`, `HoverCard`   | "gauge 12 min old"; stale adds the clock glyph and "stale"; error reads "gauge error since `{HH:MM}`"; hover shows source time, receipt time, status, latency                       |
| Source health row | `Table` row            | Source · station ID · latest value with unit · age · cadence · state word and glyph · 48 ticks of history (received, missed, error) · licence link                                  |
| Grade card        | `Card`, SVG            | Metric · value · "7 of 8" · the Wilson 95% interval as a bar on a 0–1 scale with the point as a 2px tick · n · period · source line · "Replay" when replayed                        |
| Mode badge        | `Badge`                | 20px pill: glyph, then the mode word; pack shown when both packs appear                                                                                                             |
| Approval bar      | `ButtonGroup`, `Kbd`   | Sticky at the bundle's foot: "Approve `{n}` calls" (A), "Reject" per call (R), expiry and SLA, the re-check result                                                                  |
| Night lane        | SVG                    | Arrival period as a pale fill, exit period as a 1px diagonal hatch, show name and source; forecast exits with band; D+1 actual as a tick                                            |

### CLI output

`skyclause` prints the same facts as the app in the same words ([CLI requirements](/docs/PRD.md#cli-cli); flags per TRD's [CLI](/docs/TRD.md#cli)). Rules: a header naming the station, source and time zone once; units in column headers; right-aligned tabular numbers; a dash for missing; mode and state words always printed, colour only as repetition (crimson for critical and error, amber for warning) and none under `NO_COLOR` or when not a TTY; a capture line at the foot; `--json` prints the same fields with ISO times and ages in seconds. The block below is real: the [JPS 5-minute series][jps-series] for 2 November 2026, captured at 21:12 MYT on 5 November and [stored][jps-capture]; the 60-minute column is our arithmetic.

```console
$ skyclause signals tail 0232901RF --since 2026-11-02T14:30+08:00 --until 2026-11-02T15:40+08:00
Sg. Kuyoh di LRT Bukit Jalil · 0232901RF · JPS rain · MYT
time     mm/5 min   mm/60 min
14:30         0.0         0.0
14:35         0.5         0.5
14:40         2.5         3.0
14:45         9.0        12.0
14:50         9.0        21.0
14:55         8.5        29.5
15:00         9.5        39.0   Lebat (31–60 mm in 60 min)   Storm confirmed
15:05         5.5        44.5   Lebat
15:10         5.0        49.5   Lebat
15:15         4.5        54.0   Lebat
15:20         2.0        56.0   Lebat
15:25         1.5        57.5   Lebat
15:30         1.0        58.5   Lebat
15:35         1.5        59.5   Lebat
15:40         0.5        57.5   Lebat
15 readings · infobanjirjpskl.water.gov.my station 75 · captured 2026-11-05 21:12 MYT
```

## Screens

Each screen answers one question first, states its one finding under the title, shows every block's header and first rows at 1440×900, and keeps its main job one click away. Routes are PRD's ([information architecture](/docs/PRD.md#information-architecture)); roles are cumulative, Viewer < Editor < Approver < Admin < Owner ([roles](/docs/PRD.md#roles-and-permissions)), and a control the role cannot use is not rendered. No bundle, approval or send has happened yet, so those states are templates with named fields (`Sent {HH:MM} · {n} min from crossing`), filled from the first real call; measured parts come from the 2 November replay.

### Dashboard

- **Question:** what needs my approval, and which of today's windows are at risk? ([DSH-1](/docs/PRD.md#dashboard-dsh)) **Finding:** "`{n}` bundles need review: `{mode}` for `{window}`, `{m}` min of SLA left", or "Nothing to approve (n=0)".
- **Blocks, in order:** needs review (bundle cards by SLA left, the first with an inline window strip); today's windows at risk across projects (call rows, capped at 6 with "View all"); signal health (source health rows with ages); next listed shows and forecast storm afternoons (listed: BABYMONSTER 14 November, 5 Seconds of Summer 17 November, My Chemical Romance 19–20 November, Evanescence 28 November, none forecast yet; MET's 5 November forecast gives thunderstorms every afternoon to 11 November, quoted verbatim with a gloss, such as "menyeluruh" (widespread) for 6 November); yesterday's grades. **Primary job:** "Review `{n}` bundles" in the title row, opening the one with the least SLA left.
- **States:** grades with none read "No graded windows yet (n=0). Grades arrive by 06:45 the morning after a window."; loading shows every header with values as static bars at their real size; an erroring source reads "`{source}` error since `{HH:MM}` · HTTP `{status}`", never a stale value; first run puts "Create a project" where the bundles go, with the steps of [Create project and first run](#create-project-and-first-run).

### Approvals queue

- **Question:** which bundle runs out of time first? ([DSH-4](/docs/PRD.md#dashboard-dsh)) **Finding:** "`{project}` · `{pack}` · `{m}` min of SLA left · drafted `{HH:MM}`".
- **Blocks:** the queue (420px, bundle cards sorted by SLA left, project, pack and "Listings" filters in the URL) beside the selected item's detail; the selected row takes the `--accent` fill so it never reads as focus or hover.
- **Listings:** Crowd listing cards share the queue ([CAL-14](/docs/PRD.md#calls-and-approvals-cal)): Proposed, Changed (with the diff) or Cancelled, each with its source URL and revision, "Single source" when one undocumented source lists it, and "List" or "Reject". The first real cards will carry shows the Wikipedia stadium and arena pages listed when checked on 5 November 2026 (revisions 1381307107 and 1381135293).
- **Primary job:** "Approve `{n}` calls" in the approval bar, or A with the list focused. Keys: J and K move, Enter opens, A approves, E edits and R rejects the focused call, ? lists keys; single-key shortcuts work only while the queue has focus and can be turned off.
- **States:** "No bundles need review" with the rota's next shift; "Superseded by a newer run" with the link and no Approve; "Expired, not sent" ([CAL-7, CAL-8](/docs/PRD.md#calls-and-approvals-cal)); an escalated bundle names who was notified and when.

### Bundle and call detail

- **Question:** should these calls go out as drafted? ([CAL-13](/docs/PRD.md#calls-and-approvals-cal)) **Finding:** the disagreement if any ("Agent and clause engine disagree on `{n}` windows"), otherwise "`{mode}`: `{clause}`, `{input}` `{value}` (`{class}`)"; from the replay, "Commute disruption: Storm confirmed, gauge 39.0 mm in 60 min to 15:00 (Lebat)".
- **Blocks, in order:** disagreement first (an `Alert` listing each window with both verdicts and a choice per window); the bundle header (trigger, crossing time, pack, SLA, re-check state); per call: the window strip, fired clauses with values and ages, the MET warning verbatim in Malay with its English gloss and valid span, recipients and wording per language, expiry ("Expires `{HH:MM}`, at the window's start", or its end for Storm confirmed and Flash-flood risk); the agent trace as `Trace` lines (inputs read with ages, clauses evaluated, wording drafted, each with its duration); the delay line "Crossing `{HH:MM}` · drafted `{HH:MM}` · approved `{HH:MM}` · sent `{HH:MM}`" with the minutes between.
- **Replay content (2 November 2026):** the crossing is the clause engine's verdict change at the 15:05 poll, when the 15:00 reading took the 60-minute total to 39.0 mm; the total peaked at 59.5 mm at 15:35 (our arithmetic). Only the crossing time is measured; drafted, approved and sent stay fields.
- **Primary job:** "Approve `{n}` calls" (the count falls as calls are rejected). On press the engine re-checks; if anything changed, a "Changed since drafting" panel lists each changed input with old and new values and ages before a second confirm ([CAL-9](/docs/PRD.md#calls-and-approvals-cal)). A session older than 12 hours re-authenticates first.
- **States:** all-Normal runs show the trace only ("Normal; 5 inputs fresh" with ages) and no Approve; No call names the input and since when; "Expired, not sent" per call; a Hybrid recommended edit that removes the teaching-mode line blocks Approve with the reason; guests see "Draft: not reviewed, not sent" and no approve control.

### Approver alert

- **Job:** tell the approver on duty that a bundle needs them, and open it; an alert never approves ([CAL-10](/docs/PRD.md#calls-and-approvals-cal), [NTC-6](/docs/PRD.md#notices-and-channels-ntc)).
- **Channels:** email and in-app (the sidebar count, the tab favicon, a toast), and web push in P1 ([NTC-12](/docs/PRD.md#notices-and-channels-ntc)).
- **Permission prompt:** never on page load. When a person is first assigned a shift, the rota page shows a card "Get an alert on this device when a bundle needs you during your shifts" with "Turn on alerts"; only that press calls the browser prompt. Denied shows how to re-enable it in the browser; the state is listed in Account › Notifications.
- **Content:** title "`{n}` calls need review · `{project}`"; body "`{mode}` for `{window}` · `{m}` min of SLA left · `{input}` `{value}`, `{age}` old"; escalation "Escalated to you: `{mode}` for `{window}`, `{m}` min past SLA". One alert per bundle, replaced rather than stacked; no recipient names or window titles from subscribers.

### Project overview

- **Question:** what is the call here now, and what is next? ([PRJ-4](/docs/PRD.md#projects-prj)) **Finding:** the current mode per pack and its deciding input; for the Commons at 21:12 MYT on 5 November 2026, "Sky: Normal; 5 inputs reporting, oldest 12 min".
- **Blocks:** mode per pack with fired clauses and ages; the live window strip for the next hour; today's windows at risk; signal health; the latest bundle; the next listed show or forecast storm afternoon. **Primary job:** "Declare a window".
- **States:** each block with no data prints n=0 and its next action ("Bind a source", "Declare a window").

### Create project and first run

- **Question:** what does this project watch, and from where? ([ORG-1](/docs/PRD.md#organisations-org), [PRJ-1 to PRJ-3](/docs/PRD.md#projects-prj)) **Finding:** the nearest station per source and how old its latest reading is.
- **First run:** a `Progress` at its true share over six steps: create the organisation (`/new`) → create the project (name, slug, site with coordinates, time zone defaulting to MYT, packs) → bind sources → declare the first window → set the rota → connect a channel. Each done step shows its result ("`CA16W` bound · API `{value}`, `{age}` old"). Nothing sample is created.
- **Source picker:** per adapter, a table sorted by distance from the site: station ID and name, distance, licence or "no published terms", cadence, latest reading and its age; search by name or ID. For a site at APU it lists `0232901RF` Sg. Kuyoh di LRT Bukit Jalil (JPS, no published terms, 5 min), `CA16W` Cheras at about 5.9 km (APIMS, no published terms, hourly) and `SP17` Bukit Jalil at about 880 m (Rapid Rail, CC BY 4.0, daily).
- **States:** a station erroring at bind time shows its error and can still be bound; the Crowd toggle names what is missing (a venue with listings, a rail station with gate taps).

### Windows

- **Question:** which of my windows have a call, and which nights or afternoons threaten them? ([WIN-2](/docs/PRD.md#windows-win)) **Finding:** the next window at risk or, with none declared, the next listed show: BABYMONSTER on 14 November 2026.
- **Views:** a timeline (default) and a month calendar, switched by `ToggleGroup`, the view in the URL.
- **Timeline:** windows down a 200px left column grouped under kind subheaders (Class, Event, Commute wave, Guest window), days across with faint 1px day lines, weekends one step darker, today a 1px crimson line with its date in ink. Bars 22px at radius 4 on a 32px pitch. Marks per kind: a window is a pale fill; a drafted call a dashed outline; needs review a solid outline with the mode glyph; sent a fill with the glyph; expired a darker grey step; guest windows a dashed outline with "Guest". Listed shows cross every row as columns: arrival period pale, exit period hatched, the show's name on top. Forecast storm afternoons carry the MET wording at the day's head. The legend is built from the same kinds map and lists only kinds on screen.
- **Calendar:** each day lists up to 3 windows with glyphs and "+2 more"; listed shows sit as a strip at the top of the day. **Primary job:** "Declare a window" in the title row.
- **States:** "0 windows. Declare one, or import an ICS calendar." on a new project; recurring occurrences show their series; validation errors sit beside their fields ([WIN-8](/docs/PRD.md#windows-win)).

### Signals

- **Question:** is every input fresh, and what does each read now? ([SIG-5](/docs/PRD.md#signals-sig)) **Finding:** the worst state first; at 21:12 MYT on 5 November 2026, "Sky: 5 inputs reporting; oldest 12 min".
- **Blocks:** source health rows: at that minute, gauge `0232901RF` 0.5 mm in 60 min at 21:00; APIMS `CA16W` Cheras 67, `CA19B` Petaling Jaya 57 and `CA17W` Putrajaya 62, all "Moderate" at 21:00 ([APIMS map feed][apims-map]); 1 MET thunderstorm warning issued 21:05, valid 21:00–01:00, not naming Kuala Lumpur ([warning feed][met-warn]). The selected source's detail: for the gauge, the last 24 hours as a window strip without a window; for APIMS, the hourly API per station with reference lines at 100, 150 and 180 (the school rules); for Rapid Rail, daily `SP17` exits with the eight-week same-weekday baseline; error rows listed with HTTP status, never hidden. **Primary job:** "Open source" per row; "Copy tail command" for the CLI.
- **States:** a late Rapid Rail file reads "Pending until `{HH:MM}`" from the metadata's `next_update`; "Pi offline since `{HH:MM}`"; the camera on probation shows n and agreement so far.

### Clause sheet editor

- **Question:** what does this sheet say now, and what would it have said? ([clauses](/docs/PRD.md#clauses-cls)) **Finding:** what the draft changes, such as "Storm confirmed fires on the 15:00 reading of 2 November (replay)".
- **Blocks:** the clause grid (left, resizable) with each clause's verdict now and its age; the test pane (right): evaluate the draft against live Commons indicators or a labelled replay, such as 2 November 2026 14:00–16:30, with the result per clause and the inputs used; the version history with a diff. **Primary job:** "Test against replay", then "Publish version" for Approver and above.
- **States:** a CEL type error underlines the expression and names the problem; unsaved changes warn before leaving; Viewers and guests see the grid read-only.

### Ledger

- **Question:** what was called, approved and graded, and how fast? ([LED-7](/docs/PRD.md#ledger-and-evidence-led)) **Finding:** "No entries yet (n=0)" until the first approved call; then the median minutes from crossing to sent, with n.
- **Blocks:** filter chips (date, pack, mode, state) in the URL; the total ("1–50 of `{n}`"); flat rows: date, window, mode, approver role, delay (crossing → approved → sent), grade; "Export CSV"; the integrity check's result. **Primary job:** "Request evidence" for a chosen window.
- **States:** "No entries yet (n=0). The ledger records every approved, edited or rejected call, notice, grade and clause version." Long lists virtualise; a correction is a new row pointing at the old one.

### Evidence requests and packs

- **Question:** what did the project know about this window, and when? ([LED-3 to LED-6](/docs/PRD.md#ledger-and-evidence-led)) **Finding:** the request's state: "Not reviewed" (guests), "Waiting for approval" when the reply leaves the organisation, or "Replied `{HH:MM}`".
- **Request:** a window (date, start, end) or a call, from the app, email ("evidence for 2 Nov 14:00–16:30"), API or MCP.
- **Pack:** a header with window, project and the received, drafted, approved and replied times; readings with source times and station IDs (for 2 November 14:00–16:30, the gauge's 5-minute readings, as in [CLI output](#cli-output)); warnings in force verbatim with a gloss, or "No warning record for this window"; calls, approvals and grades; frames where held. Every value links to its stored reading. **Primary job:** "Approve reply" for Approver and above when the reply leaves the organisation; otherwise "Download pack".
- **States:** a guest's pack reads "Not reviewed"; a request beyond the budget shows the reset time in MYT.

### Analysis

- **Question:** how often are the calls right, and does the agent agree with the clause engine? ([ANL-5](/docs/PRD.md#grades-and-analysis-anl)) **Finding:** with no live grades, "No live grades yet (n=0)".
- **Pattern:** "Research lists and a long table": a 26/700 title over the period in grey; tabs Sky, Crowd, Agreement, Delays, Review on a 1px rule with the crimson line under the active one; 64px below, a 43/57 row: a ranked list of clauses on a 28px pitch (fired count and precision with n), and a chart card with its range selector as text (7D 30D 90D All) under the baseline and "Updated daily"; then a 20/400 grey title and the full table of graded windows.
- **Replay grade cards (the Fanfall backtest, not re-run, labelled replay):** surge-night flag precision 0.88 (7 of 8, Wilson 95% 0.53–0.98) and recall 0.33 (7 of 21, 0.17–0.55) over 671 days; Crowd forecast median absolute error 20% over 48 listed event days.
- **Charts:** agreement over time with a dashed "Kill line: 1 in 10 disagree"; minutes from crossing to approved notice as columns; what-if replays in grey and dashed, labelled "Replay", never on a live chart ([ANL-6](/docs/PRD.md#grades-and-analysis-anl)).
- **States:** every figure prints n; with n=0 it prints "n=0" and no interval.

### Subscribers and preferences

- **Question:** who hears this project's calls, and for which windows? ([NTC-8 to NTC-10](/docs/PRD.md#notices-and-channels-ntc)) **Finding:** "`{n}` confirmed · `{m}` unconfirmed · `{k}` suppressed", or "0 subscribers (n=0)".
- **`/{org}/{project}/subscribers`:** Admin and above see a table (email, role, windows, notice language, status: confirmed, unconfirmed, bounced, complained or unsubscribed, last notice); Approvers see the counts only. Primary job: "Copy subscribe link".
- **`/subscribe/{token}`:** the landing's dark ground and 520px column: the project's name; what arrives ("Notices for the windows you choose, and the conditions calendar"); fields for email, role, windows and notice language (English or Bahasa Melayu); the PDPA notice with an unticked consent box; "Check your email to confirm". Preferences open by magic link: change windows or language, or unsubscribe in one click. The not-a-safety-service line sits at the foot.

### Developer playground

- **Question:** what does the real API return for this request? ([DEV-1 to DEV-4](/docs/PRD.md#developer-playground-dev)) **Finding:** n/a, a tool screen; the response's status and latency lead its pane.
- **Blocks:** tabs API, Clauses, Webhooks, MCP; each a request pane (operation, parameters, the visitor's key or a Commons guest token) beside the live response with status, headers and latency; snippets in curl, TypeScript, Python and CLI under it in `Code Block`, each with its capture line. **Primary job:** "Send request".
- **States:** a guest token at its budget shows the reset time in MYT; the clause sandbox accepts no typed-in indicator values; the webhook inspector asks for ownership proof and redelivers the latest real event; the MCP tool list never shows approve.

### Connect your AI

- **Question:** how do I connect my assistant, and what can it do? ([CAI-1 to CAI-4](/docs/PRD.md#connect-your-ai-cai)) **Finding:** "0 of 8 targets verified" until live tests are recorded.
- **Blocks:** a client picker (Claude: claude.ai, Claude Desktop, Claude Code; ChatGPT; Gemini CLI; Gemini Enterprise; Cursor; VS Code), each with "Verified on `{date}`" or "Not verified"; the generated config in `Code Block` with Copy; a listening state "Waiting for the first request…" that turns into the first request's time and tool; the tools with scopes from the live server; the line "No AI can approve a bundle or send to people".
- **Gemini Enterprise:** the steps name the Custom MCP Server data store (public preview, StreamableHTTP and OAuth 2.0 only) and the default organisation policy an admin must lift ([requirements](/docs/research/gemini-enterprise.md#requirements-and-registration)). **Primary job:** "Copy config".

### Settings

- **Question:** is this set the way I want, and what will it produce? ([SET-1 to SET-7](/docs/PRD.md#settings-set)) **Finding:** the first gap that would block a call, such as an unstaffed rota slot on a forecast storm afternoon.
- **Pattern:** "Settings in two columns": per section a 428px label column (16/500 title, 14px grey description, or a summary of current values when the panel is tall) beside a 700px panel on `--card` at the style's 6px radius (not the pattern's 16px), sections split by a 1px rule with 32px above and below; form fields 40px; switch rows with a 20px state badge and the toggle on the right. One view per area, with the area's name as the h1.
- **Appearance:** theme as Light, Dark, System with a live preview of a call row in each; high contrast, density, sidebar collapse, reduced motion and language beside it.
- **Show what it produces:** channels preview a notice from the latest real call, or say n=0. Destructive actions go last in their own section, in the critical colour, confirmed by typing the object's name.

### Organisation settings

- **Question:** who can approve, who is on duty, and what changed? ([ORG-2 to ORG-4](/docs/PRD.md#organisations-org)) **Finding:** the first unstaffed rota slot in the next 7 days; a new organisation reads "No one assigned" on both default templates, 14:00–19:15 MYT on forecast storm afternoons and 08:00–22:00 MYT on surge nights.
- **Members and roles:** a table (name, email, role select, last active, sign-in methods) with pending invites (resend, revoke); the label column states that roles are cumulative and that at least one Owner remains.
- **Approver rota:** "On duty now: `{name}` until `{HH:MM}`" and "Next shift" at the top; a 7-day timeline with people down the left and days across (the timeline rules above), unstaffed slots hatched with the word "Unstaffed", forecast storm afternoons and listed shows marked at each day's head. Primary job: "Add an approver".
- **Audit log:** flat rows (time, actor and role, action, object) with filter chips and "Export CSV". **Billing:** plan and MYR price marked "proposal, untested", invoices, payment method, usage as a bar at its true ratio with both ends labelled.

### Sign-in and guest entry

- **Job:** sign in, or continue as a guest ([ACC-1 to ACC-8](/docs/PRD.md#accounts-and-sign-in-acc), [GST-1](/docs/PRD.md#guest-access-and-the-commons-gst)). **Finding:** whether this browser holds a Skyclause passkey, offered first if it does.
- **Layout:** the landing's dark ground and 520px column: the mark, "Sign in to Skyclause", passkey, email magic link, Google; below, on one tone step lighter (`#151515`), "Continue as guest" with what a guest can and can't do in one line; then the footer row with the PDPA notice link.
- **States:** "This link has expired. Request a new one." with Resend; the bot check is invisible or one click, never a puzzle; `/device` shows the device and scopes before Confirm; OAuth consent shows Deny as prominently as Allow.

### The Commons

- **Question:** what is the call for Bukit Jalil now, and what would it be for my window? ([GST-2 to GST-9](/docs/PRD.md#guest-access-and-the-commons-gst)) **Finding:** the live verdict for the next hour; at 21:12 MYT on 5 November 2026, "Sky: Normal; 5 inputs reporting, oldest 12 min".
- **Blocks:** a one-line notice "Guest: drafts on guest windows are not reviewed and never sent"; the live window strip for the next hour; site-level verdicts (haze, surge nights); live signals with ages; venue listings with source and revision; run traces; the clause sheet read-only; the pilot's public conditions calendar. **Primary job:** "Declare a window" (title up to 60 characters, up to 14 days ahead).
- **States:** "0 guest windows" with "Declare a window"; "20 of 20 runs used today; resets 00:00 MYT"; with the model budget spent, clause engine verdicts only, said in one line; "Hidden pending review" on a reported window.

### Public project page and public ledger

- **Question:** what is the call here now, and how good have the calls been? ([PUB-1 to PUB-5](/docs/PRD.md#public-pages-pub)) **Finding:** the approved call in force per pack (until its window's last span end or the night's exit end; highest mode wins), or "No approved call yet".
- **Blocks:** the current mode per pack with fired clauses and input ages; the window strip for the next hour; upcoming conditions calendar entries and "Subscribe"; recent approved calls; grades with n and intervals; attribution per source (MET, Rapid Rail and data.gov.my CC BY 4.0; Wikipedia CC BY-SA 4.0; JPS, APIMS and GoLive shown derived with a link to the source); the non-affiliation and not-a-safety-service lines. The public ledger is the Ledger screen without names, read-only.
- **States:** "No approved call yet (n=0)"; erroring inputs show No call; works without JavaScript.

### Embed widget

- **Question:** what is the call here now, at a glance, on someone else's page? ([WEB-6](/docs/PRD.md#web-components-web)) **Finding:** the current mode and its oldest input's age.
- **Anatomy:** see [Custom elements](#custom-elements). Compact `<skyclause-status>` at 320×88; `<skyclause-window>` at 480×200 with the strip.
- **States:** loading shows the frame and labels; an erroring input shows No call, never a value; a private project and a missing one both read "Not available".

### Docs site

- **Job:** teach the API, SDK, CLI, MCP and clause language at `docs.skyclause.m1ku.tech`. **Finding:** n/a, a reference.
- **Layout:** three panes after [Attio help](https://www.navbar.gallery/navbar/attio-help): a tree nav with "⌘K" search, the centre column (breadcrumb, title, one lead sentence, body at 16px), an "On this page" list; the API reference generated from `/openapi.json`; light or dark from the system, in Work Sans with JetBrains Mono for code.
- **Samples:** every request and response is captured from a real call or reading and carries its capture line ("Captured 2026-11-05 21:12 MYT · station `0232901RF`"), per [DEV-5](/docs/PRD.md#developer-playground-dev); language tabs (curl, TypeScript, Python, CLI) stay in sync across the page; errors follow the Kobbe pattern.

## Data visualisation

- **One chart, one question; one axis.** Never two y-scales. The window strip stacks lanes that share the time axis, each with its own y-scale, so the Lebat line sits on the 60-minute lane: a 5-minute bar cannot cross a 60-minute class.
- **Always a y-scale and dates or times.** 3–5 round ticks with the top tick above the maximum (0, 20, 40, 60 mm on the 60-minute lane; 0, 5, 10 mm on the 5-minute lane); 4–8 flat x labels on one step, times in MYT, the date once in the header.
- **One hue on the main data element:** crimson for the live series that answers the question (the 60-minute rain line, the Crowd forecast mark, today's period); secondary series in `chart-2` grey; reference and comparison in `chart-3`.
- **Thresholds:** 1px dashed reference lines labelled at their end: "Lebat 31 mm", "API 100", "API 150", "API 180", "Surge night +5,000 exits", "Kill line 1 in 10". A crossing gets a 1px marker and a 12px label in place ("Lebat at 15:00").
- **Wilson intervals as bars:** every rate is a point (2px tick) on a horizontal interval bar on a 0–1 scale, with n and the period beside it; a rate never appears alone.
- **Forecasts:** the Crowd forecast is a mark with its band as a bar (27,044 exits, band 19,315–32,100, for 4 November 2026 against a 3,928 Wednesday baseline, written by the Fanfall source idea before the night); the D+1 actual lands as a tick; "pending until `{HH:MM}`" until the file arrives.
- **Replay is styled apart:** grey dashed lines and hollow marks, a "Replay" badge with its source and capture date in the chart header, never on the same plot as live data.
- **Marks:** 2px straight-segment lines, no smoothing, no point markers except on hover; square-cornered columns with 2px gaps; fills of 12% at most; 3–5 faint gridlines, no y-axis line.
- **Honest empties:** missing readings are gaps, not zeros; error spans carry a crimson cross on the axis; n=0 charts are not drawn, the block prints n=0.
- **Interaction:** a crosshair and tooltip on lines, a per-mark tooltip on columns, hit areas larger than the marks; every chart has a table view one click away and a one-sentence accessible summary.

## Web components and brand assets

### Mark and wordmark

- **Mark, "the window":** a square outline (a time window and the camera's literal window) with a 1px crimson bar across its lower third (the threshold), drawn on a 16px grid with a 2px stroke so it holds at favicon size.
- **Wordmark:** "Skyclause" in Work Sans 500, sentence case, −0.02em, beside the mark at the mark's height; never in caps, never in crimson.

### Favicons

- **Static set** ([WEB-1](/docs/PRD.md#web-components-web)): `icon.svg` with a `prefers-color-scheme` style block (white outline on dark, near-black on light, crimson bar in both), a 32×32 `favicon.ico` declared `sizes="32x32"`, a 180×180 apple-touch icon, manifest icons at 192 and 512 and a 512 maskable icon with the mark inside the 409px safe zone.
- **App tab:** a crimson disc with a white digit (1–9, then "9+") on the mark's top-right while bundles need review; the document title repeats it ("(`{n}`) Approvals · Skyclause"); swapped between pre-rendered SVGs, never animated ([WEB-2](/docs/PRD.md#web-components-web)).
- **Public page** `/p/{org}/{project}/favicon.svg`: the mode's glyph inside the window in the mode's colour (ring, half disc, triangle, square, three bars, dashed ring), or a crimson cross when inputs are erroring ([WEB-3](/docs/PRD.md#web-components-web)).

### Open Graph card

1200×630, dark ground ([WEB-4](/docs/PRD.md#web-components-web)). Top-left the mark and "Skyclause · `{project}`"; the one large element is the approved call's mode word with its glyph at 96px, or "No approved call yet"; under it the window and date at 40px; the bottom 220px hold the window strip at true proportions; the bottom-right corner carries the data's capture time. A call card (`/c/{callId}/og.png`) adds "Approved `{HH:MM}` MYT" and exists only for real calls. The 2 November replay is an internal design example only and never reaches a public card: "Commute disruption · 15:30 release wave, Monday 2 November 2026 · gauge `0232901RF` 39.0 mm in 60 min to 15:00". Alt text states the approved mode or "No approved call yet", the window and deciding reading when present; indicator readings and No call copy use their display names, not registry keys.

### oEmbed card

`/oembed` returns `type: "rich"` with `provider_name: "Skyclause"`, `width: 480`, `height: 200`, `thumbnail_url` set to the Open Graph image, and `html` holding the `embed.skyclause.m1ku.tech` iframe of `<skyclause-window>` ([WEB-5](/docs/PRD.md#web-components-web)). Public pages carry the discovery `<link rel="alternate" type="application/json+oembed">`.

### Custom elements

TRD's [web components](/docs/TRD.md#web-components) section is the contract; this is its look.

- **`<skyclause-status project="{org}/{project}" theme="light|dark|auto">`:** current mode or No call, inputs with ages, attribution.
- **`<skyclause-window window="{windowId}">`,** or `project`, `start` and `end` attributes: the call for one window with its strip.
- **Parts:** `mode` (glyph and word), `window`, `strip`, `age` (each input-age chip), `source`, `link` (the permalink) and `attribution` (licences, the non-affiliation and not-a-safety-service lines), each styleable through `::part()`.
- **Custom properties:** `--skyclause-bg`, `--skyclause-fg`, `--skyclause-muted`, `--skyclause-accent` (the window line), `--skyclause-radius`, `--skyclause-font` (the host's font, falling back to Work Sans). Mode colours and glyphs are not themable, so a host can't make one mode read as another.
- **Fallback:** an iframe from `embed.skyclause.m1ku.tech/{org}/{project}` with the same anatomy.

### Subscribe button

One outlined round button "Subscribe to the conditions calendar" opening a menu: Apple Calendar and Outlook desktop (`webcal:`), Google Calendar, Outlook on the web, and "Copy ICS link" ([WEB-7](/docs/PRD.md#web-components-web)); the menu names the feed and its refresh.

### Email notice and ICS entry

Templates with named fields, filled from a real approved call; previews before the first call fill only the measured parts from the 2 November replay and say n=0 for the rest ([NTC-7](/docs/PRD.md#notices-and-channels-ntc)). The approved wording (the model's, an approver's edit, or the clause wording on a shadow pick) fills the Why and What-it-means lines; every other line is template, with the teaching-mode line after the approval line on Hybrid recommended. The ICS entry is public, so it names the window by its MYT time span, never its title, and gives input ages, never values (D32 in [#79](https://github.com/m1kulabs/Skyclause/issues/79)). In the P0 pilot, notices link the public calendar event URL in place of `/c/{callId}`, which is P1 ([PUB-3](/docs/PRD.md#public-pages-pub)), and end with `Reply "unsubscribe" to stop these notices.` in place of the one-click link, also P1 ([NTC-9](/docs/PRD.md#notices-and-channels-ntc)).

```text
Subject: {Mode}: {window}, {Ddd D Mmm} ({project})

{Mode} for {window}, {Dddd D Mmmm YYYY}.

Why: {clause}. {input} {station} logged {value} {unit} {comparison}, {class}. {Input} {age} old when drafted.
What it means: {clause sheet wording for the mode}
Approved by the {role} on duty at {HH:MM} MYT. Details and readings: https://skyclause.m1ku.tech/c/{callId}

Skyclause is not a safety or emergency service. In an emergency, call 999.
Not affiliated with APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL or the stadium.
Sources: {source} ({licence}); …
Change your notices: {preference link}
Unsubscribe: {one-click link}
```

```text
BEGIN:VEVENT
UID:call-{first sent call id}@skyclause.m1ku.tech
SEQUENCE:{sequence}
DTSTART;TZID=Asia/Kuala_Lumpur:{window start}
DTEND;TZID=Asia/Kuala_Lumpur:{window end}
SUMMARY:{Mode} · {window span}
DESCRIPTION:{clause} ({input} {age}).\nApproved {HH:MM} MYT.\nSkyclause is not a safety or emergency service. In an emergency, call 999.\nNot affiliated with APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL or the stadium.\nSources: {source} ({licence}); ….\nDetails: https://skyclause.m1ku.tech/c/{callId}
URL:https://skyclause.m1ku.tech/c/{callId}
END:VEVENT
```

Call entries keep the first sent call ID in their `UID` and raise `SEQUENCE` on each change; surge-night entries use `night-{id}@skyclause.m1ku.tech`. A zero-length commute wave has no `DTEND`, since RFC 5545 requires `DTEND` to be later than `DTSTART`.

## Voice and content

- **Words of the trade,** from the [glossary](/docs/PRODUCT.md#glossary): window, call, bundle, clause, crossing, shadow verdict, No call, notice, approver rota, ledger, grade, replay, arrival period, exit period, listed show. Not "alert" for notice, "rule" for clause, "event" for window or "forecast" for call.
- **Call wording:** "{Mode} for {window}, {day date}. Why: {clause}, {input} {value} {unit} {comparison} ({class}), {age} old." The 2 November replay would read: "Commute disruption for the 15:30 release wave, Monday 2 November 2026. Why: Storm confirmed, gauge 39.0 mm in 60 min to 15:00 (Lebat), 5 min old at the 15:05 poll."
- **Input ages:** "{input} {n} min old" ("gauge 12 min old"); over 90 minutes, "{n} h old"; daily files "data to 3 Nov".
- **No call:** "No call: {input} silent {n} min", for example "No call: gauge silent 25 min"; on the hero, "No call for {clause}: {input} `{station}` silent since {HH:MM} MYT".
- **Hybrid recommended line,** on every such call: "Teaching mode is the lecturer's and the university's decision. Skyclause never excuses attendance."
- **Not-a-safety-service line,** on every notice, public page and embed: "Skyclause is not a safety or emergency service. In an emergency, call 999." ([NTC-3](/docs/PRD.md#notices-and-channels-ntc))
- **Malay verbatim with an English gloss,** marked `lang="ms"`: "Amaran Ribut Petir" (Thunderstorms Warning); "Ribut petir, hujan lebat dan angin kencang dijangka di negeri …" (Thunderstorms, heavy rain and strong winds are expected over the states of …); "menyeluruh" (widespread); "di kebanyakan tempat" (in most places); "Lebat" (heavy, 31–60 mm in an hour); "jerebu" (haze). From P1, a model-written Malay notice goes out only after a Malay-reading approver; P0 notices are English only.
- **Tone:** terse, second person, active, British spelling, numerals, specific buttons ("Approve 2 calls", "Request evidence"); every error says what failed, when the data was last good and what to do.
- **Dates and times:** "Monday 2 November 2026", "15:30 MYT"; ISO dates in compared table rows; `Intl.DateTimeFormat` with `Asia/Kuala_Lumpur`.

## Accessibility

PRD sets the targets: WCAG 2.2 AA, keyboard and focus, forms and motion ([NFR-4 to NFR-7](/docs/PRD.md#non-functional-requirements)). These are the visual and numeric rules that meet them here.

- **Contrast:** every pair in [Contrast ratios](#contrast-ratios); text 4.5:1, selection lines, input borders, chart marks and focus rings 3:1, in every theme.
- **Colour independence:** every mode, state and grade has its word and glyph; charts label series directly or by legend; nothing depends on telling crimson from amber.
- **Focus:** a 2px ring with a 2px offset (3px in high contrast), white or near-black; sticky bars set `scroll-padding`; dialogs trap and return focus.
- **Approval by keyboard:** queue, bundle, edit, reject, approve and the re-check confirm work in reading order; single-key shortcuts only with the queue focused, and they can be turned off.
- **No drag only:** the hero picker, clause grid order and rota have field or button paths.
- **Targets:** app controls 34px, sidebar rows 34px, rail hit areas 34px; 44px on touch; nothing under 24×24px.
- **Live regions:** a new bundle, an escalation and a source error are announced once with `aria-live="polite"` ("New bundle needs review: `{mode}`, `{project}`, `{m}` min SLA"), never per reading.
- **Structure:** one h1 per screen, ordered headings, a skip link, real tables, a table view for every chart, `lang="ms"` on Malay quotes, `translate="no"` on brand names, station IDs and commands.
- **Tooltips:** dismissable with Esc, hoverable, never the only place a fact lives.

## Responsive

- **Bands:** phone up to 640px, tablet 641–1100px (the sidebar folds to the rail), desktop above 1100px.
- **Landing:** the hero halves stack: the picker first at 78vw square in a 58svh lighter block, its mode word at 48px, then the h1 at 26px on two lines, the sentence at 16px and the button at 44px. Showcase copies stay at true size, cropped at their right end; the slip runs full width with its zigzag; the FAQ opens answers under their questions.
- **App shell:** the five-item bottom bar; the breadcrumb collapses to the project name with a switcher sheet.
- **Approvals on phones:** the list, then the bundle pushed as its own screen; the approval bar is a bottom `Drawer` with "Approve `{n}` calls" at 44px full width.
- **Tables:** below 640px they become two-line rows (identity and key figure, then the rest in 13px grey); the ledger keeps a table that scrolls inside its own frame with the date fixed; settings stack each label column over its panel.
- **Window strip:** full width; 3–4 x labels; lanes keep their y-scales in a left gutter; the input-age lane becomes a list under it.

## Do's and don'ts

- Do mark every selection with the 1px crimson line as wide as its label. Don't fill tabs, toggles or segmented controls with colour.
- Do print an age or source time beside every value. Don't show a value without one.
- Do say "No call" and name the silent input. Don't fall back to the last reading, a default or a recording.
- Do give every mode its word and glyph. Don't let colour alone carry a mode.
- Do draw a y-scale, times and the Lebat line. Don't overlay two y-axes.
- Do label replays and keep them off live charts. Don't mix backtests into live grades.
- Do print n and a Wilson 95% interval with every rate. Don't print a bare percentage or a vanity count.
- Do put a disagreement first. Don't hide it below agreeing calls.
- Do keep the app's primary button inverted white. Don't put crimson on app buttons or numbers.
- Do use Work Sans tabular figures. Don't use the code face outside code, CLI output and the clause condition field.
- Do keep crimson to one element per landing screen. Don't colour words in a headline.
- Do fill bundle, approval and sent states from real calls. Don't preview them with invented values.

## Known gaps

- **No bundle, approval or notice exists yet,** so every such state here is a template with named fields; the landing showcase, Open Graph previews and notice previews use the 2 November replay for their measured parts. Swap in the first approved live call when there is one.
- **The mode glyph set** is drawn for this doc and untested with users, especially Surge night's three bars and Outdoor-limited's half disc at 12px.
- **The light theme** is derived, not dealt or studied; only its contrast is checked. Dense 13px Work Sans for long sessions is unverified; comfortable density is the fallback.
- **Malay copy** needs a Malay-reading reviewer for every template and for `/ms/` before launch.
- **Pictures:** no honest clip of rain at Bukit Jalil was found; CC BY-SA images bind share-alike on altered versions, so crops are the only treatment; the team's camera frames could become the moving picture once the camera passes probation, captioned with their distance from campus.
- **Unverified behaviour:** live favicon swaps in Safari 26; shadcn's `Trace` and "Human in the Loop" helpers against the approval flow; high contrast with Windows contrast themes and a screen magnifier; web push permission rates.

## See also

- [PRD](/docs/PRD.md): routes, roles and the requirements each screen meets.
- [PRODUCT glossary](/docs/PRODUCT.md#glossary) and [pricing](/docs/PRODUCT.md#packaging-and-pricing).
- [TRD web components](/docs/TRD.md#web-components): the custom element contract and how cards and favicons are built.
- [IDEA](/docs/IDEA.md#problem-and-evidence): the evidence behind the idea docs' numbers.
- [Skyclause idea](/docs/ideas/02-skyclause.md) and [Fanfall idea](/docs/ideas/04-fanfall.md): the source objects and numbers.
- [Data sources](/docs/research/data-sources.md): the feeds behind the captured readings.
- [Markdown style guide](/docs/references/markdown-style.md).

[jps-series]: https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75
[apims-map]: https://eqms.doe.gov.my/api3/publicportalapims/mapcaqm
[met-warn]: https://api.data.gov.my/weather/warning/
[jps-capture]: /docs/sources/infobanjirjpskl.water.gov.my/rainfall-graph-75.md
[apims-capture]: /docs/sources/eqms.doe.gov.my/mapcaqm.md
[met-capture]: /docs/sources/api.data.gov.my/weather-warning.md

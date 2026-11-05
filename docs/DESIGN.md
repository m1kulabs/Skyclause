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
    card: '#000000'
    popover: '#121212'
    foreground: '#ffffff'
    muted-foreground: '#d4d4d4'
    border: '#8a8a8a'
    input: '#ffffff'
    ring: '#ffffff'
    selection: '#ff6b80'
    destructive: '#ff6b80'
    warning: '#ffc04d'
  high-contrast-light:
    background: '#ffffff'
    card: '#ffffff'
    popover: '#ffffff'
    foreground: '#000000'
    muted-foreground: '#2b2b2b'
    border: '#575757'
    input: '#000000'
    ring: '#000000'
    selection: '#8f0b1e'
    destructive: '#8f0b1e'
    warning: '#6b4500'
typography:
  sans: '"Work Sans Variable", "Work Sans", system-ui, sans-serif'
  mono: '"JetBrains Mono Variable", ui-monospace, monospace'
  numerals: tabular-nums
  landing:
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
    code: { size: 13, family: mono, line-height: 20 }
rounded: { landing: 0, card: 6, input: 6, menu-item: 4, control: 9999, badge: 9999, timeline-bar: 4, chart-bar: 0 }
spacing:
  base: 4
  app: { page-padding: 32, gap: 24, card-padding: 20, band-gap: 64 }
  landing: { margin: 40, margin-phone: 20, column: 520, section-gap: 128 }
components:
  button: { height: 34, padding-x: 14, radius: 9999 }
  button-landing: { height: 40, padding-x: 18, radius: 0 }
  button-phone: { height: 44 }
  input: { form: 40, toolbar: 34, radius: 6 }
  rows: { table: 42, table-comfortable: 48, table-header: 38, list: 28, tab: 40 }
  marks: { badge: 20, chip: 20, touch-target: 44 }
  icon-rail: { width: 50, icon: 16, pitch: 40, hit-area: 34 }
  bottom-bar: { height: 56, item-min: 44 }
  window-strip: { lane-5min: 48, lane-60min: 72, lane-span: 20, axis: 20 }
---

# Skyclause design

How Skyclause looks and behaves: tokens, the art direction of the landing page and the app, components, screen specs, charts, embeds, voice and accessibility rules. Requirements and routes live in the [PRD](/docs/PRD.md#information-architecture) and words in the [glossary](/docs/PRODUCT.md#glossary); every example below is a real reading or a number from the idea docs, labelled with its date.

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
    1.  [Windows](#windows)
    1.  [Signals](#signals)
    1.  [Clause sheet editor](#clause-sheet-editor)
    1.  [Ledger](#ledger)
    1.  [Analysis](#analysis)
    1.  [Developer playground](#developer-playground)
    1.  [Connect your AI](#connect-your-ai)
    1.  [Settings](#settings)
    1.  [Sign-in and guest entry](#sign-in-and-guest-entry)
    1.  [The Commons](#the-commons)
    1.  [Public project page and public ledger](#public-project-page-and-public-ledger)
    1.  [Embed widget](#embed-widget)
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
- **Two surfaces, one family.** The landing page adopts the dealt sheet "The quiet instrument" (seed 1236965075, Work Sans, black and crimson, hero "Control that reads the page"); the app adopts "Data terminal" (seed 134039495, dark, icon rail, every selection a 1px accent line, signs not colour on numbers), dealt with the landing's palette and type kept. Both use Work Sans and the same crimson.
- **The face.** Crimson `#b11226` from the brand replaces the app sheet's dealt blue as the one accent line; on dark app surfaces it is lifted to `#f0566c` so a 1px line holds 5.33:1 on the ground. It never fills a button in the app and never colours a number.
- **The signature element: the window strip.** A minute-by-minute strip of one window: 5-minute rain bars, the rolling 60-minute total against the Lebat line (31 mm in an hour, JPS's class), the MET warning's valid span, the arrival and exit periods of a stadium night, and each input's age, with the window itself marked by a 1px crimson line exactly as wide as it. It appears in the landing hero (live), on the call and bundle pages, inline on the dashboard's first bundle, on public pages, in `<skyclause-window>` and on every Open Graph card.
- **What the design never does.** Show a value that is not live or not labelled replay; swap to a recording when a feed fails; let colour carry a mode alone; draw a chart without a scale and dates.

## Inspirations

Gathered on 5 November 2026 from Awwwards, Best Designs on X and the galleries ranked on [mkdir.directory](https://mkdir.directory/) (38 galleries, voted). Patterns were judged from gallery captures and cover frames, not from the live sites, and nothing below is copied: each reference lends a principle to one Skyclause surface.

### References by surface

- **Landing.** [UserJot][userjot] (Saaspo, "Thin layout"): one narrow column interrupted by a dark app fragment used as the picture, which is the landing's column and its `data-ui` fragments. [Townhouse][townhouse] (Awwwards Nominee, 13 October 2026): a one-line live status under the real product, which becomes the hero's freshness line. [fromearth / 2050][fromearth] (Awwwards Nominee, 26 October 2026): a large label on a tick-mark scrubber, which becomes the hero's window picker on a minute scale. [DeepBook][deepbook] (Awwwards Site of the Day, 3 November 2026): one accent used only on actions and data, which is the crimson rule. [incident.io][incident] (SaaS Landing Page): near-black with crimson and an investigation checklist, which calibrates the accent and the agent trace. [Monolog][monolog] (Footer.design): a local clock line in the footer, which becomes "Kuala Lumpur, 21:12 MYT".
- **App shell, queue and ledger.** [Agent approval cards][kvnkld-cards] (@kvnkld, 20 August and 8 September 2026): title, what will happen, a checklist and a primary action with its key hint, which shapes the bundle card; its "Auto Approve in 28s" becomes the window's expiry, never an automatic approval. [Clerk dashboard][clerk] (Navbar Gallery): a breadcrumb of scope switchers and a "Watching for users" empty state, which shapes the organisation › project breadcrumb, the first-run dashboard and Connect your AI. [Osha_Lion audit log][collectui-table] (CollectUI) and [Marathon changelog][marathon] (Saaspo): flat rows, filter chips, CSV export and "Viewing 1 to 15 of 145", which is the ledger. [Weave][weave] (Design Details): one accent used only on deltas, which keeps colour on what needs a decision. [batukrskl settings][collectui-settings] (CollectUI): grouped settings nav, read-only IDs with copy, which is settings.
- **Signals, charts and grades.** [Sensor details][dejv] (@dejvdesign, 1 June 2026): tabs per sensor group and a dense table with status chips, which is the signals screen. [Monitor overview][monitor] (@disarto_max, 11 July 2026): a strip of thin tick bars per check and "last checked 3 min ago", which is the source health row and the status widget. [Neon][neon] (Design Details): a limit line with the breach annotated in place, which is the Lebat line and its crossing label. [Prompt Injection Scanner][scanner] (@jeetnirnejak, 12 August 2026): a threshold marker with itemised reasons, which is the clause test result. [Mebius charts kit][mebius] (Movin): a ghost target behind the actual, which is the Crowd forecast band against gate taps. [Climate TRACE][climate-trace] (Awwwards Honorable Mention, 11 March 2024) and [Lumenus][lumenus] (Design Details): one figure with its method or source under it, which is the grade card. [Field Rank][field-rank] (Awwwards Nominee, 16 October 2026): "Every rank traces back to finish lines", which is the provenance line under every grade. [Departures in pixel art][departures] (@txnioh, 27 September 2026): a station board with the next departure as a block, which shapes the Crowd night lane and the shuttle times.
- **Agent and developer surfaces.** [PayPath][paypath] (Design Details) and [kvnkld's agent conversation][collectui-agents] (CollectUI): an ordered column of agent events with durations, the last one live, and flagged evidence lines, which is the agent trace. [The Movin CLI radio][movin-cli]: a client picker that is a real terminal prompt, which shapes the client picker on Connect your AI. [stormy][stormy] (@ash1sh0kumar, 12 July 2025): aligned key and value output, which is the CLI's table layout.
- **Embeds, favicons, cards and states.** [Devouring Details][devouring] and [Toolbar][toolbar] Open Graph images (Sections.wtf): one shape plus typographic corners, and one real UI fragment, which is the Open Graph card. The [Best Designs on X OG gallery][og-gallery]: Railway's real state chips drawn into the card. [Usage bento][usage] (Sections.wtf): tiny live readouts in one strip, which is `<skyclause-status>`. [Impractical favicon][favicon] (@AdityaSur11, 13 October 2026): state in the tab, which is the live favicon, done by static swaps. [Numbers][wherescz] (@wherescz, 9 September 2026): "only the columns whose digit moved turn", which is how live numbers change on the landing. [Flighty 404][flighty] (Sections.wtf): split-flap digits, used once, when a public page's mode changes. [Kobbe 404][kobbe] (404s): a label, one sentence and three exits, which is every error page.

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
[lumenus]: https://designdetails.io/sections/lumenus-life--home--features-2
[field-rank]: https://www.awwwards.com/sites/field-rank
[departures]: https://bestdesignsonx.com/anaclumos/status/2103081108502135084
[paypath]: https://designdetails.io/sections/paypath-ai--home--features-6
[collectui-agents]: https://collectui.com/designs/ai-agents-ui-design-inspiration
[movin-cli]: https://movin.design/components/radios/cli/
[stormy]: https://bestdesignsonx.com/ash1sh0kumar/status/1943316174894231597
[devouring]: https://sections.wtf/shots/devouring-details-open-graph
[toolbar]: https://sections.wtf/shots/toolbar-open-graph
[og-gallery]: https://bestdesignsonx.com/og-images
[usage]: https://sections.wtf/shots/usage-bento
[favicon]: https://bestdesignsonx.com/AdityaSur11/status/2109214925465776535
[wherescz]: https://bestdesignsonx.com/wherescz/status/2097469280514441687
[flighty]: https://sections.wtf/shots/flighty-404
[kobbe]: https://www.404s.design/sites/kobbe

### Patterns to avoid

- **Glass, glow and gradients:** frosted strips, "liquid glass" panels, gradient-glow pills and gradient blobs on Open Graph cards, all seen in the same galleries.
- **Fake dashboards in device frames:** DeepBook's monitor shot and Bluejack's tilted collage. Skyclause shows its real interface with real readings, or nothing.
- **Hero furniture:** award pills, a dial ringed by floating feature cards, numbered three-up feature cards (Field Rank's weakest section).
- **Spectacle over data:** fromearth's red heat halo and globe-first scroll.
- **Automatic approval countdowns:** the approval card's "Auto Approve in 28s". A bundle shows when it expires and waits for a person.
- **Monospace as costume:** the mono metadata of Field Rank, Superscript, Townhouse, the Axiom card and @kyleanthony's terminal labels. Their content (IDs, times, counts) is kept; it is set in Work Sans tabular figures, and monospace stays in code and CLI output.
- **Vanity counters and sparklines:** Superscript's "2,048,510 Transactions" strip, a sparkline in every table row. Skyclause prints a count only with its n and period.

## Landing art direction

The landing page adopts "The quiet instrument" whole: radical understatement, a narrow column, small exact demonstrations and composed emptiness. PRD's [landing requirements](/docs/PRD.md#landing-page-lnd) set what it must do; this section sets how it looks and what it says.

### Landing composition

- **Ground and inks:** `#0a0a0a` ground, `#efefef` ink, `#8c8c8c` soft ink, `#151515` for the hero's lighter half. Crimson `#b11226` appears on exactly one element per screen: the primary button. No accent characters in any heading (house rule over the palette's "a few characters in a heading").
- **Frame:** one pair of 40px outer margins (20px on phones), a 12-column grid with 24px gutters for the section blueprints, the text column 520px wide starting at about 22% of the viewport. Sections are separated by space only, 120–140px. Nothing spans the width until the footer line.
- **Hero, "Control that reads the page":** two halves split by tone at 50%: left `#0a0a0a`, right `#151515`. Left: the mark top-left at 40px, two-thirds empty ground, then bottom-left the h1, one supporting sentence in soft ink held to 44ch, and one light rectangular button. Right: the live window picker, about 450px square, centred, root marked `data-ui`. No navigation bar; one text link top-right, "Sign in", at 15px.
- **Headline size:** the sheet's idea and its warnings ("the one direction where a small headline is right") settle the h1 at `clamp(26px, 2.1vw, 32px)`, weight 500; section headings use the same step, so none outranks the h1. The display step (5–7vw) is not used. The large thing on the first screen is the live picker.
- **Section order:** showcase (one row, three states) → how it works (itinerary on a slip) → proof (one quiet row of source names) → features (panel with margin notes) → pricing (prices like a menu) → FAQ (question index, one answer) → call to action (a plain sentence, one action) → footer (a single quiet line). Each section keeps its blueprint's geometry; lines and borders appear only inside tables, forms and `data-ui` fragments.
- **Inverted field:** pricing and the FAQ may invert to `#efefef` ground with `#0a0a0a` ink and `#595959` soft ink (6.09:1).

### Landing copy deck

Numbers come from [the Skyclause idea](/docs/ideas/02-skyclause.md#storms-the-exit-wave-meets-the-afternoon-cell), [the Fanfall idea](/docs/ideas/04-fanfall.md#problem-and-evidence) and readings captured from the JPS, APIMS and MET feeds at 21:12 MYT on 5 November 2026; IDEA owns the evidence and the page links each number to it ([LND-4](/docs/PRD.md#landing-page-lnd)).

- **h1 (25 characters):** "The call for every window"
- **Supporting sentence:** "Skyclause reads the rain gauge, the haze index and the stadium listings around Bukit Jalil, and makes one approved, graded call for each class, event or commute window."
- **The one action:** a button "Open the Commons" to `/guest`. Top-right text link: "Sign in".
- **Hero readout:** see [The live window picker](#the-live-window-picker).
- **Showcase, heading "One call, three states":** three copies of one call row at 640px, labelled in the left columns "Arrives", "Reviewed" and "Sent". The row is a replay of 2 November 2026: "Commute disruption · 15:30 release wave · Storm confirmed: gauge `0232901RF` 39.0 mm in 60 min to 15:00 (Lebat) · 89 sessions end 15:30". Arrives shows "Needs review · SLA 10 min"; Reviewed shows the actions "Approve 1 call", "Edit" and "Reject" with the pointer on Approve; Sent shows "Sent 15:20 · 20 min from crossing". The middle copy's button works and turns it into the third state; a caption under the three reads "Replay of 2 November 2026: times after 15:00 are inferred from documented delays, not measured. Approving here sends nothing."
- **How it works, heading "From gauge to notice":** paragraph "Every call starts at a reading and ends in a record you can check the next morning." The slip, under three headings: **Every weekday** (rain gauge polled, every 5 min · MET warnings polled, every 10 min · APIMS index read, hourly · morning run, 06:45); **Monday 2 November** (60-minute rain reaches Lebat, 39.0 mm, 15:00 · poll writes the crossing, 15:05 · decision agent drafts the bundle, by 15:15 · approver approves, about 15:20 · 89 sessions end, 15:30); **The next morning** (window graded against the gauge, by 06:45 · stadium night graded against Rapid Rail gate taps, D+1). Inverted final row: "One approved call, on the record · 20 min". Under the slip at 14px: "Worked example from the Skyclause idea; times after 15:00 are inferred, not measured."
- **Proof, opening words as the h2 "Readings from":** then the names at 22px: JPS Infobanjir · MET Malaysia · DOE APIMS · Rapid Rail · GoLive · Wikipedia. Under the row at 14px in soft ink: "Public data, used under each source's terms. Skyclause is not affiliated with or endorsed by APU, KPT, JPS, MET Malaysia, DOE, Prasarana or Rapid KL, or the stadium." No logos.
- **Features, heading "Read before you approve":** the bundle panel of the 2 November replay at 380×680px, with six notes: "Disagreement first" (if the agent and the clause engine differ, the bundle says so before anything else); "Fired clauses" (each with its reading and age: gauge 39.0 mm in 60 min, 5 min old at the 15:05 poll); "Warning, verbatim" (MET text in Malay with an English gloss and its valid span); "The window strip" (five-minute rain, the Lebat line and the window on one clock); "Who hears it" (the recipients each call covers, and their wording); "Approve, edit, reject" (one approval per bundle; a rejected call is still graded).
- **Pricing, heading "What it costs":** two groups. **Free:** Commons ("One shared live project for Bukit Jalil; guest windows last 14 days"), Community ("One project of your own"). **Paid:** Team and Campus, with the MYR prices and inclusions from [PRODUCT's pricing](/docs/PRODUCT.md#packaging-and-pricing), each group headed "Proposed, untested" ([LND-6](/docs/PRD.md#landing-page-lnd)).
- **FAQ, heading "Common questions":** "Is this an emergency warning service?" → "No. Skyclause is not a safety or emergency service. In an emergency, call 999." · "Who makes the call?" → "An AI agent drafts it from the clause sheet; a person on the approver rota approves it before anyone hears it." · "Can my AI approve a call?" → "No. AI tools can read, draft and ask for evidence. Only a person with the Approver role approves." · "What happens when a feed fails?" → "The call says so, for example 'No call: gauge silent 25 min'. It never shows an old reading." · "Where does the data come from?" → "JPS gauge `0232901RF`, MET Malaysia, DOE APIMS, Rapid Rail gate taps at `SP17`, and GoLive and Wikipedia listings." · "Is it right?" → "Every call is graded after the fact and published with n and a 95% interval. No live grades yet (n=0)." · "Does it work outside Bukit Jalil?" → "The Sky pack works with any station JPS, MET and APIMS cover in Malaysia; the Crowd pack needs a venue with listings and a rail station with gate taps." · "Does it excuse attendance?" → "No. Teaching mode is the lecturer's and the university's decision."
- **Call to action:** "Open the Commons and read the call for Bukit Jalil right now." Button "Open the Commons"; text link "Read the docs".
- **Footer line:** left "Skyclause · Kuala Lumpur, 21:12 MYT" (a live clock); centre "Docs · Status · Terms · Bahasa Melayu"; right "© 2026 · Privacy".

### The live window picker

The hero's control is the product's defining control: pick a window and read the call. It acts on the live world, not on recordings ([LND-1 to LND-3](/docs/PRD.md#landing-page-lnd)).

- **Control:** a date row (Today, then 7 named days, the MET forecast's horizon) and a 24-hour minute strip on which the visitor drags a window, or sets start and end in two time fields with 15-minute steps. The chosen span is marked by the 1px crimson line as wide as the window. Keyboard: arrows move the start by 15 minutes, Shift with arrows changes the length; the fields are the no-drag path ([NFR-4](/docs/PRD.md#non-functional-requirements)).
- **Readout, 14px:** the clause engine's verdict for the Commons project "Bukit Jalil": the mode per pack with its glyph, every fired clause, every input with source, station ID and age, and the label "Clause engine verdict: not reviewed, not sent". Under it, the latest approved call by permalink, or "No approved call yet (n=0)".
- **Captured example, 21:12 MYT on 5 November 2026, window 21:30–23:00:** Sky: Normal; no clause fires. Inputs: gauge `0232901RF` 0.5 mm in 60 min, 12 min old · API 67 at Cheras `CA16W`, 12 min old · 1 MET thunderstorm warning in force 21:00–01:00, naming no W.P. Kuala Lumpur district, 7 min old. Crowd: surge night listed, The Weeknd, forecast 26,997 exits (band 19,268–32,053, the Fanfall idea's arithmetic from 07:25 MYT).
- **Errors are errors:** a stale input reads "No call for Storm confirmed: gauge `0232901RF` silent since {HH:MM} MYT", the shape PRD fixes, with no rain value drawn; a failed fetch reads "Couldn't reach the JPS gauge at {HH:MM}. Last reading {HH:MM}. Retry". No recorded fallback, ever.
- **Without script:** the server renders the verdict for the next hour with ages and a plain form for the window.

### Landing imagery

Interface fragments built from real data carry most of the page (the hero picker, the three showcase rows, the features panel), each marked `data-ui` so the app's borders and radii apply inside. Real pictures of Bukit Jalil's world carry two places: the how-it-works paragraph column (rain) and the pricing heading's 4:5 slot (the stadium). Each picture has a caption naming what it is and its credit under it. None is presented as Skyclause's users or product. Candidates found with `assets.mjs` on 5 November 2026 (Openverse was down, HTTP 500; all from Wikimedia Commons):

| Picture                                                    | Creator         | Licence      | Use                    |
| ---------------------------------------------------------- | --------------- | ------------ | ---------------------- |
| [Bukit Jalil National Stadium at night][img-stadium]       | Pak Misai       | CC BY-SA 4.0 | Pricing, 4:5 crop      |
| [Bukit Jalil LRT Panorama][img-lrt-pano] (2025)            | Pixdoet         | CC BY 4.0    | Features, column width |
| [Rain, Kuala Lumpur][img-rain]                             | Eutah Mizushima | CC0          | How it works, 3:2      |
| [Haze in Kuala Lumpur (September 2026, AQI 200)][img-haze] | Renek78         | CC0          | FAQ answer on haze     |
| [The exterior of Bukit Jalil LRT Station][img-lrt-ext]     | Fikku fiq       | CC BY-SA 4.0 | Reserve                |
| [Pagar A Stadium Nasional Bukit Jalil][img-gate-a]         | PeaceSeekers    | CC BY 4.0    | Reserve                |

No honest clip of rain at Bukit Jalil exists in the open collections (Commons returned Kerala and Grand Canyon rain); the moving picture is therefore a slow drift on the stadium photograph and the hero's live bars.

[img-stadium]: https://commons.wikimedia.org/wiki/File:Bukit_Jalil_National_Stadium_at_night.jpg
[img-lrt-pano]: https://commons.wikimedia.org/wiki/File:Bukit_Jalil_LRT_Panorama.jpg
[img-rain]: https://commons.wikimedia.org/wiki/File:Rain,_Kuala_Lumpur_(Unsplash).jpg
[img-haze]: https://commons.wikimedia.org/wiki/File:Haze_in_Kuala_Lumpur_(September_2026,_AQI_200).jpg
[img-lrt-ext]: https://commons.wikimedia.org/wiki/File:The_exterior_of_Bukit_Jalil_LRT_Station.jpg
[img-gate-a]: https://commons.wikimedia.org/wiki/File:Pagar_A_Stadium_Nasional_Bukit_Jalil.jpg

### Landing motion

- **Signature, the masked headline:** on load each line of the h1 rises from behind its own baseline in 900ms with `cubic-bezier(0.16, 1, 0.3, 1)`; on phones the second line follows 110ms later. The supporting sentence and the button then fade up together over 300ms. Reduced motion: everything is in place at first paint.
- **Section entrances:** heading, then text, then fragment or picture, staggered 70ms, rising 24px with opacity, once per section. Reduced motion: no travel, no delay. Content is never hidden if script fails.
- **Feedback:** button press scales to 0.98 in 100ms; links and FAQ questions brighten from soft to full ink in 150ms; the FAQ answer pane crossfades in 150ms.
- **Live movement:** a new 5-minute bar in the hero grows from the baseline in 400ms when the reading lands; changed digits turn per column. No rain animation plays when the gauge is erroring ([LND-5](/docs/PRD.md#landing-page-lnd)).
- **The moving picture:** the stadium photograph drifts from scale 1.00 to 1.04 over 24s, paused under reduced motion and when off screen.

## App style

The app adopts "Data terminal" whole: a monitoring screen read in long sessions, cards darker than the ground, tabular digits that stack, signs instead of colour, and every selection (tab, toggle, range, nav item, the window on a strip) marked by the same 1px crimson line exactly as wide as its label, lying on the nearest existing edge. Everything the sheet does not fix comes from the shared app-screen defaults.

### App shell

- **Icon rail at organisation level:** 50px wide on the page ground with a 1px `#222224` edge. The mark at the top, then 16px outline icons on a 40px pitch with 34px hit areas: Dashboard, Approvals (count of bundles needing review), Projects, Analysis; a 20px hairline; Developers, Connect your AI; at the bottom after a gap, Settings, Account and Help. Every icon has a tooltip and an accessible name equal to its tooltip; the active item is its icon in full ink plus a 1px crimson bar on the rail's right edge as tall as the icon.
- **Scope:** a 48px top line holds the breadcrumb "organisation › project" as two switchers and, on the right, the freshness stamp and the command palette hint "⌘K".
- **Project tab row:** under the breadcrumb on a full-width 1px rule: Overview, Windows, Signals, Clauses, Calls, Ledger, Analysis, Subscribers, Settings. The active tab is white text with the 1px crimson line as wide as its label lying on the rule; the rest are muted. No filled pills.
- **Phone:** the rail becomes a bottom bar of five items with short labels (Dashboard, Approvals, Projects, Analysis, More); the tab row scrolls sideways inside its own row.

### Colour budget and face

- **Budget:** under 3% of pixels on any screen. Crimson appears only as 1px selection lines, the main data element of a live chart (the 60-minute rain line, the Crowd forecast mark), critical mode badges and error chips. The primary button is inverted white with a near-black label.
- **Numbers:** white for the identity and the figure that answers the screen's question, grey for the rest; signs live in the text ("+1,240 exits above baseline", "−3 min").
- **Where the face shows first:** the dashboard's first needs-review bundle carries an inline window strip; the call page opens on the full strip; the Commons opens on the live strip for the next hour.

## Themes

- **Dark (default):** the app sheet's tokens with crimson mapped onto the accent role. Landing pages, the hero and the docs header stay dark in every theme.
- **Light (derived):** the same roles and budget inverted: `#f6f6f7` ground, white cards with a `#e4e4e7` border, `#111113` ink, `#5f6368` muted, crimson `#b11226` as the selection line and chart hue, near-black primary button. Derived here, not dealt; tested only for contrast.
- **System:** follows `prefers-color-scheme` live, and `prefers-contrast: more` switches high contrast on.
- **High contrast:** a modifier on dark or light: pure black or white ground, borders at 6:1 or more, selection lines 2px instead of 1px, pills lose their tints and gain a 1px border in their ink, chart grids drop, focus ring 3px. Under `forced-colors: active` the app uses system colours and keeps every glyph and word.
- **Applying the setting:** `/account/appearance` stores theme, contrast, density (compact 13px body and 42px rows; comfortable 14px and 48px), reduced motion and language on the account ([SET-2](/docs/PRD.md#settings-set)). The server renders `class="dark hc"` on `<html>` from the account, so no theme flash; `color-scheme` and `<meta name="theme-color">` match the ground. Public pages and embeds follow the viewer's `prefers-color-scheme` or the embed's `theme` attribute.

## Colour

Tokens are in the frontmatter as hex and map onto shadcn variables one to one: `background`, `foreground`, `card`, `popover`, `primary`, `secondary`, `muted`, `muted-foreground`, `accent` (the ghost hover wash, not crimson), `border`, `input`, `ring`, `destructive`, `sidebar` and `chart-1` to `chart-5`. Four tokens have no shadcn slot and get their own variables registered in `@theme inline`: `--selection` (the 1px line), `--rule`, `--control` and `--grid`, plus the status pairs.

- **Cards darker than the ground** in dark (`#131217` on `#171719`), white on grey in light.
- **Two greys for words:** `#bdbdc0` secondary and `#8a8c92` meta in dark; `#3f4246` and `#5f6368` in light.
- **Crimson is one family:** in dark, selection, the data hue, the error and the critical status share `#f0566c` (as the app style asks when the accent sits near a status hue); in light, selection and data use `#b11226` and critical text `#9b0f24`.
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
| White on brand crimson `#b11226` (landing button)         | 7.04                                               |
| Inverted field: `#0a0a0a` / `#595959` on `#efefef`        | 17.22 / 6.09                                       |
| Brand crimson `#b11226` on `#0a0a0a` (non-text)           | **2.81**: decorative only, never a sole state mark |
| Dark text `#ffffff` on ground / card / raised             | 17.90 / 18.64 / 16.21                              |
| Dark secondary `#bdbdc0` on card / raised                 | 9.95 / 8.65                                        |
| Dark muted `#8a8c92` on ground / card / raised            | 5.33 / 5.55 / **4.82**                             |
| Selection `#f0566c` on ground / card (1px line)           | 5.33 / 5.55                                        |
| Critical `#f0566c` on its tint `#2c1a20`                  | **4.90**                                           |
| Warning `#d9a441` on its tint `#2a2416`                   | 6.85                                               |
| Neutral pill `#bdbdc0` on `#212023`                       | 8.65                                               |
| Dark input border `#6a6c72` on ground / card              | **3.41** / 3.55                                    |
| Light text `#111113` on ground / card                     | 17.46 / 18.86                                      |
| Light muted `#5f6368` on card / ground / raised           | 6.05 / 5.60 / 5.32                                 |
| Light selection `#b11226` on card / ground                | 7.04 / 6.52                                        |
| Light critical `#9b0f24` on `#fdecef`                     | 7.41                                               |
| Light warning `#966400` on `#fdf3dc`                      | **4.62**                                           |
| Light input border `#8b8e94` on white                     | **3.28**                                           |
| Light chart-3 `#8b8e94` on white (marks only)             | **3.28**                                           |
| High contrast: `#d4d4d4` / `#ff6b80` / `#ffc04d` on black | 14.17 / 7.67 / 12.90                               |
| High contrast: `#2b2b2b` / `#8f0b1e` / `#6b4500` on white | 14.16 / 9.40 / 8.48                                |

## Typography

- **One family, Work Sans,** on the landing and in the app, loaded as `@fontsource-variable/work-sans` (300–700). Figures use its tabular numerals: on 5 November 2026 both the `google/fonts` variable file and Google's served Latin subset carried `tnum`, and the default digits are proportional (390–622 units wide), so `font-variant-numeric: tabular-nums` is set on every table, figure, time and live value.
- **Monospace only for code and CLI output** (house rule): JetBrains Mono at 13px in code blocks, the CLI, the clause condition field and the API console. Station IDs in running text stay in Work Sans with `translate="no"`; in tables they are plain text.
- **Landing:** four sizes: head `clamp(26px, 2.1vw, 32px)` at 500 with −0.02em; lead 20–26px (state words, proof names, the FAQ answer at 1.3 leading); body 17–19px at 1.55; small 14px (captions, credits, footer, the picker readout). Nothing below 14px.
- **App:** title 26/700; the answer figure 30/500 (at least 1.3 times its siblings); section titles 20/400 in muted; card titles 16/600; figures 20/500; body 13/20 (14/20 comfortable); labels, axis ticks and badges 12; nothing below 12.
- **Case:** sentence case for every heading, button and label (house rule; it overrides the Web Interface Guidelines' Title Case, as [NFR-8](/docs/PRD.md#non-functional-requirements) records). No uppercase tracked labels.
- **Text:** `…` not `...`, curly quotes, non-breaking spaces in "10 min", "⌘ K" and "LRT Bukit Jalil", `text-wrap: balance` on headings.

## Layout

- **App canvas:** rail 50px, then fluid content with 32px side padding and one 24px gutter used both ways. At 1440px the content is 1326px: 12 columns of 88.5px and 11 gutters of 24px (1062 + 264 = 1326). Bands sit 64px apart.
- **Two-column rows:** 43/57 for list beside chart (560 + 24 + 742 = 1326); a narrow table of five columns or fewer runs to about 760px and pairs with the next block.
- **Rows:** tables 42px (48 comfortable) with a 38px header; card lists on a 28px pitch; two-line rows 44px.
- **Settings:** a centred 1152px column: a 428px label column, a 24px gap and a 700px panel (428 + 24 + 700 = 1152).
- **Detail with queue:** the approvals list at 420px beside the bundle pane (1326 − 420 − 24 = 882px).
- **Landing:** see [Landing composition](#landing-composition).
- **Sticky parts** (the approval bar, table headers) set `scroll-padding` so a focused row is never under them.

## Elevation

- **At rest, no shadow:** a dark card is one tone step below the ground with a 1px `#222224` border; a light card is white with a `#e4e4e7` border. A border or a shadow, never both.
- **Floating only:** menus, popovers, the command palette, dialogs, sheets and toasts sit on `#212023` (dark) or white (light) with `0 12px 28px rgba(0,0,0,.2)` in dark and `0 8px 24px rgb(17 17 19 / .08)` in light, and no border.
- **shadcn:** `--shadow-xs` and `--shadow-sm` are `0 0 #0000`; `--shadow-lg` takes the float shadow.
- **Landing:** no shadows at all; fragments marked `data-ui` keep the app's borders.

## Shapes

- **App radii:** cards, dialogs, inputs and selects 6px; menu items 4px; buttons, toggles, chips and badges fully round; timeline bars 4px; chart bars square. Three panel radii at most per screen.
- **shadcn radius pins:** `--radius-sm` 4px, `--radius-md` 4px, `--radius-lg` 6px, `--radius-xl` 6px, `--radius-2xl` 8px, `--radius-4xl` 9999px; `Button`'s variants change to `rounded-full`.
- **Landing:** square corners on everything outside `data-ui`; the slip's bottom edge is a zigzag cut with `clip-path`.
- **Selection line:** 1px tall (2px in high contrast), as wide as its label, square ends, never rounded into a pill.

## Motion

App screens perform no entrances; motion is feedback ([NFR-7](/docs/PRD.md#non-functional-requirements)).

- **Durations:** hover and press 100–120ms; menus, popovers and tooltips 150ms; sheets and drawers 200ms with `cubic-bezier(0.32, 0.72, 0, 1)`; the selection line slides between tabs in 150ms.
- **Live data:** a new bundle row fades in over 200ms without sliding; a changed value updates in place and the freshness stamp changes; nothing pulses or glows.
- **Properties:** `transform` and `opacity` only, listed explicitly; never `transition: all`.
- **Reduced motion:** the account setting overrides the system; under it, the selection line jumps, sheets appear without travel, and the landing drops every rise and drift.

## Components

### shadcn style and setup

- **Style: `nova`.** Its 32–36px controls match the app's 34px control height, its hairlines and tone steps match cards that carry no shadow, and its radius sits at the tight 6px. `mira` is denser (28–32px controls) than the sheet's 34px; `lyra`'s boxy edges suit the landing but not the app's round buttons.
- **Setup:** shadcn CLI 4.23.0 on Base UI (the default since July 2026), Tailwind CSS 4.3.4, Recharts v3 through `Chart`, versions per TRD's [stack](/docs/TRD.md#stack): `bunx --bun shadcn@latest init --base base --preset nova --template next`. Tokens go into the CSS file `info` names, hex kept; heights move together (button, input, select, toggle, tabs at 34px; form fields at 40px).
- **Focus:** a 2px solid `--ring` outline with a 2px offset on actions and fields, never `outline: none` without it. The ring is white or near-black, never crimson, so focus never reads as selection.

### Components per need

| Need                  | shadcn component                                                                                                 | Skyclause use                                                            |
| --------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| Shell                 | `Sidebar` (`collapsible="icon"`, 50px), `Tooltip`                                                                | The icon rail with names and tooltips                                    |
| Scope                 | `Breadcrumb`, `DropdownMenu`                                                                                     | Organisation and project switchers                                       |
| Project and view tabs | `Tabs` (line variant, 1px `--selection`)                                                                         | Project tab row, analysis tabs                                           |
| Command palette       | `Command` in `Dialog`                                                                                            | Cmd/Ctrl+K: projects, stations (`SP17`), calls                           |
| Tables                | `Table`, `ScrollArea`, `Pagination`                                                                              | Ledger, signals, approvals list, grades                                  |
| Charts                | `Chart` (Recharts v3)                                                                                            | Analysis lines and columns; the strip is its own SVG                     |
| Mode and state marks  | `Badge`                                                                                                          | Mode badge, call state, "Replay", "Draft: not reviewed"                  |
| Callouts              | `Alert`                                                                                                          | Disagreement first, No call, "changed since drafting"                    |
| Empty states          | `Empty`                                                                                                          | n=0 with the next action                                                 |
| Loading               | `Skeleton` (static, no pulse), `Spinner`                                                                         | Values at their real size                                                |
| Agent activity        | `Trace`, `TraceLine`, `TraceCollapsible`                                                                         | The run trace on bundle and call pages                                   |
| Forms                 | `Field`, `FieldGroup`, `FieldSet`, `Input`, `InputGroup`, `Select`, `Combobox`, `Textarea`, `Switch`, `Checkbox` | Window form, settings, subscriber form                                   |
| Option sets           | `ToggleGroup` (text items, 1px selection line)                                                                   | Range (7D 30D 90D All), theme, pack filter                               |
| Dates                 | `Calendar`, `Popover`                                                                                            | Window date, ledger range                                                |
| Overlays              | `Dialog`, `AlertDialog`, `Sheet`, `Drawer`                                                                       | Re-check confirm, destructive confirm, call on tablet, approval on phone |
| Feedback              | `toast` (Base UI)                                                                                                | "Sent 15:20", "Saved"                                                    |
| Keys                  | `Kbd`                                                                                                            | A, E, R, J, K hints in the approval bar                                  |
| Code                  | `Code Block`                                                                                                     | CLI, curl, TypeScript, Python snippets                                   |
| Split panes           | `Resizable`                                                                                                      | Clause grid beside its test pane                                         |
| People                | `Avatar` with `AvatarFallback`                                                                                   | Rota initials on a pale identity tint                                    |
| Setup                 | `Progress`                                                                                                       | First-run steps at their true percentage                                 |

### Product components

| Component         | Built on               | Anatomy                                                                                                                                                                             |
| ----------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Window strip      | SVG, `Tooltip`         | Shared minute axis; lanes for 5-minute rain, 60-minute total with the Lebat line, warnings, crowd periods and input ages; the window as a 1px crimson line; "Now" as a 1px ink line |
| Call row          | `Table` row, `Badge`   | Mode badge · window and time · fired clause summary with values · input-age chips · state · expiry; actions on hover or focus                                                       |
| Bundle card       | `Card`, `Badge`, `Kbd` | Trigger and crossing time · project and pack · call count by mode · SLA left · shadow agreement ("Agrees" or "Disagrees on 1") · escalation · "Approve 2 calls"                     |
| Clause grid       | `Table`, `Field`       | Clause · reads · fires when (CEL, monospace) · proposes · verdict now with age · last fired; the row under test outlined                                                            |
| Input-age chip    | `Badge`, `HoverCard`   | "gauge 5 min old"; stale adds the clock glyph and "stale"; error reads "gauge error since 15:05" with the cross; hover shows source time, receipt time, status, latency             |
| Source health row | `Table` row            | Source · station ID · latest value with unit · age · cadence · state word and glyph · 48 ticks of history (received, missed, error) · licence link                                  |
| Grade card        | `Card`, SVG            | Metric · value · "7 of 8" · a 0–1 scale with the Wilson 95% interval as a bar and the point as a 2px tick · n · period · source line · "Replay" when replayed                       |
| Mode badge        | `Badge`                | 20px pill: glyph, then the mode word; pack shown when both packs appear                                                                                                             |
| Approval bar      | `ButtonGroup`, `Kbd`   | Sticky at the bundle's foot: "Approve 2 calls" (A), "Reject" per call (R), expiry and SLA, the re-check result                                                                      |
| Night lane        | SVG                    | Arrival period as a pale fill, exit period as a 1px diagonal hatch, show name and source; forecast exits with band; D+1 actual as a tick                                            |

### CLI output

`skyclause` prints the same facts as the app in the same words ([CLI requirements](/docs/PRD.md#cli-cli); flags per TRD's [CLI](/docs/TRD.md#cli)). Rules: a header line naming the station, source and time zone once; units in column headers; right-aligned tabular numbers; a dash for missing; mode and state words always printed, colour only as repetition (crimson for critical and error, amber for warning) and none under `NO_COLOR` or when not a TTY; a capture line at the foot; `--json` prints the same fields with ISO times and ages in seconds. Both blocks below are real: the first from the JPS 5-minute series for 2 November 2026, the second from the feeds at 21:12 MYT on 5 November 2026.

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
15:00         9.5        39.0   Lebat (31–60 mm in 60 min)   crossing: Storm confirmed
15:05         5.5        44.5   Lebat
15:10         5.0        49.5   Lebat
15:15         4.5        54.0   Lebat
15:20         2.0        56.0   Lebat
15:25         1.5        57.5   Lebat
15:30         1.0        58.5   Lebat
15:35         1.5        59.5   Lebat
15:40         0.5        57.5   Lebat
15 readings · source infobanjirjpskl.water.gov.my station 75 · captured 2026-11-05 21:12 MYT

$ skyclause signals list --project commons/bukit-jalil
Bukit Jalil · commons · 2026-11-05 21:12 MYT
source         station     reading                                         at      age
JPS rain       0232901RF   0.5 mm in 60 min                                21:00   12 min
DOE APIMS      CA16W       API 67 Moderate (Cheras)                        21:00   12 min
DOE APIMS      CA19B       API 57 Moderate (Petaling Jaya)                 21:00   12 min
DOE APIMS      CA17W       API 62 Moderate (Putrajaya)                     21:00   12 min
MET warnings   —           1 thunderstorm warning 21:00–01:00, no KL area  21:05    7 min
5 readings · Sky verdict Normal · clause engine verdict: not reviewed, not sent
```

## Screens

Each screen answers one question first, states its one finding under the title, shows every block's header and first rows at 1440×900, and keeps its main job one click away. Routes are PRD's ([information architecture](/docs/PRD.md#information-architecture)); roles are cumulative, Viewer < Editor < Approver < Admin < Owner ([roles](/docs/PRD.md#roles-and-permissions)), and a control the role cannot use is not rendered. Examples marked replay come from 2 November 2026 or the idea docs' backtests; nothing is built yet, so no live call exists.

### Dashboard

- **Question:** what needs my approval, and which of today's windows are at risk? ([DSH-1](/docs/PRD.md#dashboard-dsh)) **Finding:** "1 bundle needs review: Commute disruption for the 15:30 release wave, 10 min SLA" (replay).
- **Blocks, in order:** needs review (bundle cards by SLA left, the first with an inline window strip); today's windows at risk across projects (call rows, capped at 6 with "View all"); signal health (source health rows with ages); next surge nights and forecast storm afternoons (BABYMONSTER 14 November, 5 Seconds of Summer 17 November, My Chemical Romance 19–20 November, Evanescence 28 November; MET's 5 November forecast gives thunderstorms every afternoon to 11 November, quoted verbatim with a gloss, such as "menyeluruh" (widespread) for 6 November); yesterday's grades.
- **Primary job:** "Review 1 bundle" in the title row, opening the oldest SLA.
- **States:** no bundles reads "Nothing to approve" with the last approval's time; yesterday's grades with none reads "No graded windows yet (n=0). Grades arrive by 06:45 the morning after a window."; loading shows every block's header with values as static bars at their real size; an erroring source shows in signal health as "{source} error since {HH:MM} · HTTP {status}", never a stale value; first run shows "Create a project" where the bundles go and a setup progress at its true percentage.

### Approvals queue

- **Question:** which bundle runs out of time first? ([DSH-4](/docs/PRD.md#dashboard-dsh)) **Finding:** the oldest SLA and its project, for example "Bukit Jalil · Sky · SLA 10 min · drafted 15:10" (replay).
- **Blocks:** the queue (420px, bundle cards sorted by SLA left, filters for project and pack in the URL) beside the selected bundle's detail; the selected row takes the `--accent` fill so it never reads as focus or hover.
- **Primary job:** "Approve 2 calls" in the approval bar, or A with the list focused.
- **Keys:** J and K move, Enter opens, A approves the bundle, E edits and R rejects the focused call, ? lists keys; single-key shortcuts work only while the queue has focus and can be turned off in settings (WCAG 2.1.4).
- **States:** empty reads "No bundles need review" with the rota's next shift; a superseded bundle shows "Superseded by a newer run" with the link and no Approve; an expired bundle shows "Expired, not sent" ([CAL-7, CAL-8](/docs/PRD.md#calls-and-approvals-cal)); an escalated bundle names who was notified and when.

### Bundle and call detail

- **Question:** should these calls go out as drafted? ([CAL-13](/docs/PRD.md#calls-and-approvals-cal)) **Finding:** the disagreement if any ("Agent and clause engine disagree on 1 window"), otherwise the highest mode and why ("Commute disruption: gauge 39.0 mm in 60 min to 15:00, Lebat").
- **Blocks, in order:** disagreement first (an `Alert` listing each window with both verdicts and a choice per window); the bundle header (trigger, crossing time, pack, SLA, re-check state); per call: the window strip, fired clauses with values and ages, the MET warning verbatim in Malay with its English gloss and valid span, recipients and wording per language, expiry ("Expires 15:30, at the window's start" or at its end for Storm confirmed and Flash-flood risk); the agent trace as `Trace` lines (inputs read with ages, clauses evaluated, wording drafted, each with its duration); the delay line (crossing, drafted, approved, sent in MYT with minutes between).
- **Replay content (2 November 2026):** Storm confirmed fired at 15:00 with 39.0 mm in 60 min; the 60-minute total peaked at 59.5 mm at 15:35 (our arithmetic from the 5-minute series); 62.5 mm fell from 14:00 to 16:00 ([SIG-6](/docs/PRD.md#signals-sig)). PRD's CAL-8 replay sets the expiry state: drafted at 15:10, approved at 15:35, the 15:30 call shows "Expired, not sent" and the 15:45 call sends.
- **Primary job:** "Approve 2 calls" (the count changes as calls are rejected). On press the engine re-checks; if anything changed, a "Changed since drafting" panel lists each changed input with old and new values and ages before a second confirm ([CAL-9](/docs/PRD.md#calls-and-approvals-cal)). Approval older than 12 hours of session opens re-authentication first.
- **States:** all-Normal runs show the trace only ("Normal; 5 inputs fresh" with ages) and no Approve; No call names the input and since when; a Hybrid recommended edit that removes the teaching-mode line blocks Approve with the reason; a guest sees "Draft: not reviewed, not sent" and no approve control.

### Windows

- **Question:** which of my windows have a call, and which nights or afternoons threaten them? ([WIN-2](/docs/PRD.md#windows-win)) **Finding:** the next window at risk or, with none declared, the next surge night: BABYMONSTER on 14 November 2026.
- **Views:** a timeline (default) and a month calendar, switched by `ToggleGroup`, the view in the URL.
- **Timeline:** windows down a 200px left column grouped under kind subheaders (Class, Event, Commute wave, Guest window), days across with faint 1px day lines, weekends one step darker, today a 1px crimson line with its date in ink. Bars 22px at radius 4 on a 32px pitch. Marks per kind: a window is a pale fill; a drafted call a dashed outline; needs review a solid outline with the mode glyph; sent a fill with the glyph; expired a darker grey step; guest windows a dashed outline with "Guest". Surge nights cross every row as columns: arrival period pale, exit period hatched, show name on top. Forecast storm afternoons carry the MET word at the day's head. The legend is built from the same kinds map and lists only kinds on screen.
- **Calendar:** each day lists up to 3 windows with glyphs and "+2 more"; surge nights sit as a strip at the top of the day.
- **Primary job:** "Declare a window" in the title row.
- **States:** "0 windows. Declare one, or import an ICS calendar." on a new project; recurring occurrences show their series; validation errors sit beside their fields ([WIN-8](/docs/PRD.md#windows-win)).

### Signals

- **Question:** is every input fresh, and what does each read now? ([SIG-5](/docs/PRD.md#signals-sig)) **Finding:** the worst state first, for example "Sky: 5 inputs reporting; oldest 12 min" (21:12 MYT, 5 November 2026).
- **Blocks:** source health rows (the captured values in [CLI output](#cli-output)); the selected source's detail: for the gauge, the last 24 hours as a window strip without a window; for APIMS, the hourly API line per station with reference lines at 100, 150 and 180 (the school rules); for Rapid Rail, daily `SP17` exits with the eight-week same-weekday baseline; error rows listed with HTTP status, never hidden.
- **Primary job:** "Open source" per row; "Copy tail command" for the CLI.
- **States:** pending Rapid Rail reads "Pending until 22:00" from the metadata's `next_update`; "Pi offline since HH:MM"; camera on probation shows n and agreement so far.

### Clause sheet editor

- **Question:** what does this sheet say now, and what would it have said? ([clauses](/docs/PRD.md#clauses-cls)) **Finding:** what the draft changes, such as "Storm confirmed would fire at 15:00 on 2 November (replay)".
- **Blocks:** the clause grid (left, resizable) with each clause's verdict now and its age; the test pane (right): evaluate the draft against live Commons indicators or a labelled replay, such as 2 November 2026 14:00–16:30, with the result per clause and the inputs used; the version history with a diff.
- **Primary job:** "Test against replay", then "Publish version" for roles that may.
- **States:** a CEL type error underlines the expression and names the problem; unsaved changes warn before leaving; a published version shows who and when; Viewers and guests see the grid read-only.

### Ledger

- **Question:** what was called, approved and graded, and how fast? ([LED-7](/docs/PRD.md#ledger-and-evidence-led)) **Finding:** "No entries yet (n=0)" until the first approved call; then the median minutes from crossing to sent, with n.
- **Blocks:** filter chips (date, pack, mode, state) in the URL; the total ("1–50 of n"); flat rows: date, window, mode, approver role, delay (crossing → approved → sent), grade; "Export CSV"; the integrity check's result.
- **Primary job:** "Request evidence" for a chosen window.
- **States:** "No entries yet (n=0). The ledger records every approved, edited or rejected call, notice, grade and clause version." Long lists virtualise; a correction appears as a new row pointing at the old one.

### Analysis

- **Question:** how often are the calls right, and is the agent agreeing with the clause engine? ([ANL-5](/docs/PRD.md#grades-and-analysis-anl)) **Finding:** with no live grades, "No live grades yet (n=0)".
- **Pattern:** "Research lists and a long table": a 26/700 title over the period in grey; tabs Sky, Crowd, Agreement, Delays on a 1px rule with the crimson line under the active one; 64px below, a 43/57 row: a ranked list of clauses on a 28px pitch (fired count and precision with n), and a chart card with its range selector as text (7D 30D 90D All) under the baseline and "Updated daily"; then a 20/400 grey title and the full table of graded windows.
- **Replay grade cards (Fanfall backtest, not re-run, labelled replay):** surge-night flag precision 0.88 (7 of 8, Wilson 95% 0.53–0.98) and recall 0.33 (7 of 21, 0.17–0.55) over 671 days; Crowd forecast median absolute error 20% over 48 listed event days.
- **Charts:** agreement over time with the kill line at "1 in 10 disagree" as a dashed reference; minutes from crossing to approved notice as columns; what-if replays drawn in grey and dashed, labelled "Replay", never on a live chart ([ANL-6](/docs/PRD.md#grades-and-analysis-anl)).
- **States:** every figure prints n; with n=0 it prints "n=0" and no interval.

### Developer playground

- **Question:** what does the real API return for this request? ([DEV-1 to DEV-4](/docs/PRD.md#developer-playground-dev)) **Finding:** the response's status and latency, and the capture line every example carries.
- **Blocks:** tabs API, Clauses, Webhooks, MCP; each a request pane (operation, parameters, the visitor's key or a Commons guest token) beside the live response with status, headers and latency; snippets in curl, TypeScript, Python and CLI under it in `Code Block`.
- **Primary job:** "Send request".
- **States:** a guest token at its budget shows the reset time in MYT; the clause sandbox accepts no typed-in indicator values; the webhook inspector asks for ownership proof before the first delivery and redelivers the latest real event; the MCP tool list never shows approve.

### Connect your AI

- **Question:** how do I connect my assistant, and what can it do? ([CAI-1 to CAI-4](/docs/PRD.md#connect-your-ai-cai)) **Finding:** "0 of 8 targets verified" until live tests are recorded.
- **Blocks:** a client picker (Claude: claude.ai, Claude Desktop, Claude Code; ChatGPT; Gemini CLI; Gemini Enterprise; Cursor; VS Code), each with "Verified on <date>" or "Not verified"; the generated config in `Code Block` with Copy; a listening state "Waiting for the first request…" that turns into the first request's time and tool; the tools list with scopes from the live server; the line "No AI can approve a bundle or send to people".
- **Gemini Enterprise:** the steps name the Custom MCP Server data store (public preview, StreamableHTTP and OAuth 2.0 only) and the default organisation policy an admin must lift ([requirements](/docs/research/gemini-enterprise.md#requirements-and-registration)).
- **Primary job:** "Copy config".
- **States:** every target reads "Not verified" until a recorded live test.

### Settings

- **Question:** is this set the way I want, and what will it produce? ([SET-1 to SET-7](/docs/PRD.md#settings-set)) **Finding:** the first gap that would block a call, such as an unstaffed rota slot on a forecast storm afternoon.
- **Pattern:** "Settings in two columns": per section a 428px label column (16/500 title, 14px grey description, or a summary of current values when the panel is tall) beside a 700px panel on `--card` at the style's 6px radius, sections split by a 1px rule with 32px above and below; form fields 40px; switch rows with a 20px state badge and the toggle on the right. One view per area, with the area's name as the h1.
- **Appearance:** theme as Light, Dark, System with a live preview of a call row in each; high contrast, density, reduced motion and language beside it.
- **Show what it produces:** channels preview a notice from the latest real call, or say n=0; the rota shows who is on duty now.
- **Destructive actions** go last in their own section, in the critical colour, confirmed by typing the object's name.

### Sign-in and guest entry

- **Question:** how do I get in? ([ACC-1 to ACC-8](/docs/PRD.md#accounts-and-sign-in-acc), [GST-1](/docs/PRD.md#guest-access-and-the-commons-gst)) **Finding:** whether this browser holds a Skyclause passkey, offered first if it does.
- **Layout:** the landing's dark ground and 520px column: the mark, "Sign in to Skyclause", passkey, email magic link, Google; below a 1px rule, "Continue as guest" with what a guest can and cannot do in one line; the PDPA notice link.
- **States:** "This link has expired. Request a new one." with Resend; the bot check is invisible or one click, never a puzzle; `/device` shows the device and scopes before Confirm; OAuth consent shows Deny as prominently as Allow.

### The Commons

- **Question:** what is the call for Bukit Jalil now, and what would it be for my window? ([GST-2 to GST-9](/docs/PRD.md#guest-access-and-the-commons-gst)) **Finding:** the live verdict for the next hour; at 21:12 MYT on 5 November 2026, "Sky: Normal; 5 inputs reporting, oldest 12 min".
- **Blocks:** a one-line notice "Guest: drafts on guest windows are not reviewed and never sent"; the live window strip for the next hour; site-level verdicts (haze, surge nights); live signals with ages; venue listings with source and revision; run traces; the clause sheet read-only; the pilot's public conditions calendar.
- **Primary job:** "Declare a window" (title up to 60 characters, up to 14 days ahead).
- **States:** "0 guest windows" with "Declare a window"; budget reached shows "20 of 20 runs used today; resets 00:00 MYT"; when the model budget is spent, the Commons says so and shows clause engine verdicts only; a reported window shows "Hidden pending review".

### Public project page and public ledger

- **Question:** what is the call here right now, and how good have the calls been? ([PUB-1 to PUB-5](/docs/PRD.md#public-pages-pub)) **Finding:** the current mode per pack and the input that decides it.
- **Blocks:** the current mode per pack with fired clauses and input ages; the window strip for the next hour; upcoming conditions calendar entries and "Subscribe"; recent approved calls; grades with n and intervals; attribution per source (MET, Rapid Rail and data.gov.my CC BY 4.0; Wikipedia CC BY-SA 4.0; JPS, APIMS and GoLive shown derived with a link to the source); the non-affiliation and not-a-safety-service lines. The public ledger is the Ledger screen without names, read-only.
- **States:** no approved call reads "No approved call yet (n=0)"; inputs erroring show No call; works without JavaScript.

### Embed widget

- **Question:** what is the call here now, at a glance, on someone else's page? ([WEB-6](/docs/PRD.md#web-components-web)) **Finding:** the current mode and its oldest input's age.
- **Anatomy:** see [Custom elements](#custom-elements). Compact `<skyclause-status>` at 320×88; `<skyclause-window>` at 480×200 with the strip.
- **States:** loading shows the frame and labels; an erroring input shows No call, never a value; a private project returns the same "Not available" for missing and private.

## Data visualisation

- **One chart, one question; one axis.** Never two y-scales. The window strip stacks lanes that share the time axis, each with its own y-scale, so the Lebat line sits on the 60-minute lane: a 5-minute bar cannot cross a 60-minute class.
- **Always a y-scale and dates or times.** 3–5 round ticks with the top tick above the maximum (0, 20, 40, 60 mm on the 60-minute lane; 0, 5, 10 mm on the 5-minute lane); 4–8 flat x labels on one step, times in MYT, the date once in the header.
- **One hue on the main data element:** crimson for the live series that answers the question (the 60-minute rain line, the Crowd forecast mark, today's period); secondary series in `chart-2` grey; reference and comparison in `chart-3`.
- **Thresholds:** 1px dashed reference lines labelled at their end: "Lebat 31 mm", "API 100", "API 150", "API 180", "Surge night +5,000 exits", "Kill line 1 in 10". A crossing gets a 1px marker and a 12px label in place ("Lebat at 15:00").
- **Wilson intervals as bars:** every rate is drawn as a point (2px tick) on a horizontal interval bar on a 0–1 scale, with n and the period beside it; a rate never appears alone.
- **Forecasts:** the Crowd forecast is a mark with its band as a bar (27,044 exits, band 19,315–32,100, for 4 November 2026 against a 3,928 Wednesday baseline); the D+1 actual lands as a tick; "pending until 22:00" until the file arrives.
- **Replay is styled apart:** grey dashed lines and hollow marks, a "Replay" badge with its source and capture date in the chart header, never on the same plot as live data.
- **Marks:** 2px straight-segment lines, no smoothing, no point markers except on hover; square-cornered columns with 2px gaps; fills of 12% at most; 3–5 faint gridlines, no y-axis line.
- **Honest empties:** missing readings are gaps, not zeros; error spans carry a crimson cross on the axis; n=0 charts are not drawn, the block prints n=0.
- **Interaction:** a crosshair and tooltip on lines, a per-mark tooltip on columns, hit areas larger than the marks; every chart has a table view one click away and an accessible summary sentence.

## Web components and brand assets

### Mark and wordmark

- **Mark, "the window":** a square outline (a time window and the camera's literal window) with a 1px crimson bar across its lower third (the threshold), drawn on a 16px grid with a 2px stroke so it holds at favicon size. Crimson `#b11226` on dark grounds is a fill, never a sole state mark.
- **Wordmark:** "Skyclause" in Work Sans 500, sentence case, −0.02em, beside the mark at the mark's height; never in caps, never in crimson.

### Favicons

- **Static set** ([WEB-1](/docs/PRD.md#web-components-web)): `icon.svg` with a `prefers-color-scheme` style block (white outline on dark, near-black on light, crimson bar in both), a 32×32 `favicon.ico` declared `sizes="32x32"`, a 180×180 apple-touch icon, manifest icons at 192 and 512 and a 512 maskable icon with the mark inside the 409px safe zone.
- **App tab:** a crimson disc with a white digit (1–9, then "9+") on the mark's top-right while bundles need review; the document title repeats it ("(2) Approvals · Skyclause"); swapped between pre-rendered SVGs, never animated ([WEB-2](/docs/PRD.md#web-components-web)).
- **Public page** `/p/{org}/{project}/favicon.svg`: the mode's glyph inside the window in the mode's colour: ring for Normal, half disc for Outdoor-limited, triangle for Commute disruption, square for Hybrid recommended, three bars for Surge night, dashed ring for No call, a crimson cross when inputs are erroring ([WEB-3](/docs/PRD.md#web-components-web)).

### Open Graph card

1200×630, dark ground ([WEB-4](/docs/PRD.md#web-components-web)). Top-left the mark and "Skyclause · Bukit Jalil"; the one large element is the mode word with its glyph at 96px; under it the window and date at 40px; the bottom 220px hold the window strip at true proportions; the bottom-right corner carries the data's capture time; a "Replay" badge whenever the data is replayed. Example layout from the 2 November replay: "Commute disruption" · "15:30 release wave, Monday 2 November 2026" · strip with 39.0 mm at 15:00 against the Lebat line · "Replay · gauge 0232901RF, captured 5 Nov 2026 21:12 MYT". Alt text states the mode, window and the deciding reading.

### oEmbed card

`/oembed` returns `type: "rich"` with `provider_name: "Skyclause"`, `width: 480`, `height: 200`, `thumbnail_url` set to the Open Graph image, and `html` holding the `embed.skyclause.com` iframe of `<skyclause-window>` ([WEB-5](/docs/PRD.md#web-components-web)). Public pages carry the discovery `<link rel="alternate" type="application/json+oembed">`.

### Custom elements

- **`<skyclause-status project="commons/bukit-jalil">`:** parts `mode` (glyph and word), `window` ("now" or the window), `ages` (the input-age chips), `source` (attribution and non-affiliation), `link` (the permalink).
- **`<skyclause-window window="{id}">`:** adds the `strip` part with the window strip.
- **Theming:** attribute `theme="dark|light|auto"`; custom properties `--skyclause-bg`, `--skyclause-fg`, `--skyclause-muted`, `--skyclause-selection`, `--skyclause-radius`, `--skyclause-font` (default the host's font, falling back to Work Sans); `::part()` for each part. Mode colours and glyphs can't be overridden, so a host can't make a mode read as another.
- **Fallback:** an iframe from `embed.skyclause.com/{org}/{project}` with the same anatomy; both carry the not-a-safety-service line.

### Subscribe button

One outlined round button "Subscribe to the conditions calendar" opening a menu: Apple Calendar and Outlook desktop (`webcal:`), Google Calendar, Outlook on the web, and "Copy ICS link" ([WEB-7](/docs/PRD.md#web-components-web)); the menu names the feed and its refresh.

### Email notice and ICS entry

Templates; braces are filled from the call. The example values are the 2 November replay; recipients and approver come only from a real call.

```text
Subject: Commute disruption: 15:30 release wave, Mon 2 Nov (Bukit Jalil)

Commute disruption for the 15:30 release wave, Monday 2 November 2026.

Why: Storm confirmed. JPS gauge 0232901RF at LRT Bukit Jalil logged 39.0 mm in the 60 minutes
to 15:00, the JPS class "Lebat" (31–60 mm in an hour). Gauge {age} old when drafted.

What it means: {clause sheet wording for Commute disruption}
Approved by the {role} on duty at {approved time} MYT.
Details and readings: https://skyclause.com/c/{callId}

Skyclause is not a safety or emergency service. In an emergency, call 999.
Not affiliated with APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL or the stadium.
Unsubscribe: {one-click link}
```

```text
BEGIN:VEVENT
UID:{callId}@skyclause.com
DTSTART;TZID=Asia/Kuala_Lumpur:{window start}
DTEND;TZID=Asia/Kuala_Lumpur:{window end}
SUMMARY:Commute disruption · 15:30 release wave
DESCRIPTION:Storm confirmed: gauge 0232901RF 39.0 mm in 60 min to 15:00 (Lebat).\nApproved {approved time} MYT.\nNot a safety or emergency service.
URL:https://skyclause.com/c/{callId}
END:VEVENT
```

## Voice and content

- **Words of the trade,** from the [glossary](/docs/PRODUCT.md#glossary): window, call, bundle, clause, crossing, shadow verdict, No call, notice, approver rota, ledger, grade, replay, arrival period, exit period. Not "alert" for notice, "rule" for clause, "event" for window or "forecast" for call.
- **Call wording:** "{Mode} for {window}, {day date}. Why: {clause} — {input} {value} {unit} {comparison} ({class}), {age} old." For example: "Commute disruption for the 15:30 release wave, Monday 2 November 2026. Why: Storm confirmed — gauge 39.0 mm in 60 min to 15:00 (Lebat), 5 min old at the 15:05 poll."
- **Input ages:** "{input} {n} min old" ("gauge 12 min old"); over 90 minutes, "{n} h old"; daily files "data to 3 Nov".
- **No call:** "No call: {input} silent {n} min", for example "No call: gauge silent 25 min"; on the hero, "No call for {clause}: {input} `{station}` silent since {HH:MM} MYT".
- **Hybrid recommended line,** on every such call: "Teaching mode is the lecturer's and the university's decision. Skyclause never excuses attendance."
- **Not-a-safety-service line,** on every notice, public page and embed: "Skyclause is not a safety or emergency service. In an emergency, call 999." ([NTC-3](/docs/PRD.md#notices-and-channels-ntc))
- **Malay verbatim with an English gloss,** marked `lang="ms"`: "Amaran Ribut Petir" (Thunderstorms Warning); "Ribut petir, hujan lebat dan angin kencang dijangka di negeri …" (Thunderstorms, heavy rain and strong winds are expected over the states of …); "Ribut petir di beberapa tempat" (thunderstorms in a few places); "menyeluruh" (widespread); "di kebanyakan tempat" (in most places); "Lebat" (heavy, 31–60 mm in an hour); "jerebu" (haze). A notice in Malay written by the model goes out only after a Malay-reading approver.
- **Tone:** terse, second person, active, British spelling, numerals, specific buttons ("Approve 2 calls", "Request evidence"); every error says what failed, when the data was last good and what to do.
- **Dates and times:** "Monday 2 November 2026", "15:30 MYT"; ISO dates in compared table rows; `Intl.DateTimeFormat` with `Asia/Kuala_Lumpur`.

## Accessibility

PRD sets the target, WCAG 2.2 AA on the app, public pages, embeds and emails ([NFR-4](/docs/PRD.md#non-functional-requirements)); these are the testable rules.

- **Contrast (1.4.3, 1.4.11):** every pair in [Contrast ratios](#contrast-ratios); text 4.5:1, selection lines, input borders, chart marks and focus rings 3:1, in every theme.
- **Colour (1.4.1):** every mode, state and grade has its word and glyph; charts label their series directly or by a legend; nothing depends on telling crimson from amber.
- **Focus (2.4.7, 2.4.11):** a visible 2px ring with 2px offset on every control; sticky bars use `scroll-padding` so focus is never hidden; dialogs trap and return focus.
- **Keyboard approval flow (2.1.1, 2.1.4):** the queue, the bundle, edit, reject, approve and the re-check confirm all work by keyboard alone in reading order; single-key shortcuts only with the queue focused and can be turned off.
- **No drag only (2.5.7):** the hero picker, the clause grid's order and the rota have field or button paths.
- **Targets (2.5.8):** at least 24×24px everywhere (app controls are 34px, rail hit areas 34px); 44px on touch.
- **Live regions (4.1.3):** a new bundle, an escalation and a source error are announced once with `aria-live="polite"` ("New bundle needs review: Commute disruption, Bukit Jalil, 10 min SLA"), never per reading; the hero readout updates politely.
- **Motion (2.3.3, 2.2.2):** reduced motion stops every travel, drift and loop; the stadium drift pauses off screen.
- **Structure (1.3.1, 2.4.1):** one h1 per screen, ordered headings, a skip link, real tables with header cells, a table view for every chart, `lang="ms"` on Malay quotes, `translate="no"` on brand names, station IDs and commands.
- **Authentication (3.3.8):** passkeys and magic links, paste allowed, no puzzle in the bot check.
- **Reflow and zoom (1.4.10, 1.4.4):** usable at 320px and 200% zoom; zoom never disabled.
- **Forms:** labels above fields tied by `for`, errors inline beside their field with `aria-describedby`, the first error focused on submit, `autocomplete` and correct `type` on every input, no paste blocking.
- **Tooltips (1.4.13):** dismissable with Esc, hoverable, persistent while hovered; never the only place a fact lives.

## Responsive

- **Bands:** phone up to 640px, tablet 641–1100px, desktop above 1100px.
- **Landing:** the hero halves stack: the picker first at 78vw square in a 58svh lighter block, then the h1 at 26px on two lines, the sentence at 16px and the button at 44px. Showcase rows stay at true size, cropped at their right end; the slip runs full width with its zigzag; the FAQ opens answers under their questions.
- **App shell:** the rail becomes the five-item bottom bar; the breadcrumb collapses to the project name with a switcher sheet.
- **Approvals on phones:** list, then the bundle pushed as its own screen; the approval bar is a bottom `Drawer` with "Approve 2 calls" at 44px full width.
- **Tables:** below 640px become two-line rows (identity and key figure, then the rest in 13px grey); the ledger keeps a horizontally scrolling table inside its own frame with the date fixed.
- **Window strip:** full width; 3–4 x labels; lanes keep their y-scales in a left gutter; the input-age lane becomes a list under it.
- **Settings:** the label column stacks over its panel.

## Do's and don'ts

| Do                                                                  | Don't                                                   |
| ------------------------------------------------------------------- | ------------------------------------------------------- |
| Mark every selection with the 1px crimson line as wide as its label | Fill tabs, toggles or segmented controls with colour    |
| Print the input's age beside every value                            | Show a value without its age or source time             |
| Say "No call" and name the silent input                             | Fall back to the last reading, a default or a recording |
| Give every mode its word and glyph                                  | Let colour alone say Commute disruption or Surge night  |
| Draw a y-scale, dates and the Lebat line                            | Draw a chart with no scale, or overlay two y-axes       |
| Label replays and keep them off live charts                         | Mix backtest numbers into live grades                   |
| Print n and a Wilson 95% interval with every rate                   | Print a bare percentage or a vanity count               |
| Put the disagreement first                                          | Hide a shadow disagreement below agreeing calls         |
| Keep the primary button inverted white in the app                   | Put crimson on app buttons or numbers                   |
| Use Work Sans tabular figures for numbers                           | Use monospace outside code and CLI output               |
| Quote MET in Malay with an English gloss                            | Paraphrase a warning or translate it silently           |
| Use real interface fragments and credited photos                    | Use device mockups, stock heroes or grey-bar dashboards |
| Keep crimson to one element per landing screen                      | Colour words in a headline                              |
| Show what a setting produces, from a real call                      | Preview with invented values                            |

## Known gaps

- **No real call exists yet,** so the showcase, features panel, Open Graph example and notice template use the 2 November 2026 replay; swap in the first approved live call when there is one.
- **The mode glyph set** is drawn for this doc and untested with users, especially Surge night's three bars and Outdoor-limited's half disc at 12px.
- **The light theme** is derived, not dealt or studied; only its contrast is checked.
- **Dense 13px Work Sans** for long monitoring sessions is unverified; the comfortable density is the fallback.
- **Malay copy** needs a Malay-reading reviewer for every template and for `/ms/` before launch.
- **Pictures:** no honest clip of rain at Bukit Jalil was found; CC BY-SA images (the stadium at night) bind share-alike on altered versions, so crops are the only treatment; the team's own camera frames could become the moving picture once the camera passes probation, captioned with their distance from campus.
- **Live favicon swaps** in Safari 26 are unverified, as is SVG favicon support below Safari 26.
- **shadcn's `Trace` and "Human in the Loop" helpers** (October and August 2026) have not been reviewed against the approval flow.
- **High contrast and forced colours** have not been tested with Windows High Contrast or a screen magnifier.

## See also

- [PRD](/docs/PRD.md): routes, roles and the requirements each screen meets.
- [PRODUCT glossary](/docs/PRODUCT.md#glossary) and [pricing](/docs/PRODUCT.md#packaging-and-pricing).
- [TRD](/docs/TRD.md#web-components): how the web components, favicons and cards are built.
- [IDEA](/docs/IDEA.md#problem-and-evidence): the evidence behind every number used here.
- [Skyclause idea](/docs/ideas/02-skyclause.md) and [Fanfall idea](/docs/ideas/04-fanfall.md): the source objects and numbers.
- [Data sources](/docs/research/data-sources.md): the feeds behind the captured readings.
- [Markdown style guide](/docs/references/markdown-style.md).

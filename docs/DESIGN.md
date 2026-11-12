---
name: Skyclause
description: "The window as a capsule lying on the day's strip. Navy and pink, Roundo, tone steps instead of lines, mode hues only on data; one top bar, one 1200px column."
colors:
  dusk:
    ground: '#1a2039'
    surface: '#212846'
    raised: '#2a3257'
    overlay: '#313a62'
    ink: '#f9a3c0'
    ink-muted: '#c68da3'
    edge: transparent
  day:
    ground: '#fdeef3'
    surface: '#f9dfe8'
    raised: '#f3cfdc'
    overlay: '#eec3d3'
    ink: '#1a2039'
    ink-muted: '#555a75'
    edge: transparent
  high-contrast-dusk:
    ground: '#0b0e1f'
    surface: '#141933'
    raised: '#1e2448'
    overlay: '#2a315c'
    ink: '#ffffff'
    ink-muted: '#e6e8f2'
    edge: '#ffffff'
  high-contrast-day:
    ground: '#ffffff'
    surface: '#f4f2f7'
    raised: '#e9e6f0'
    overlay: '#dcd8e6'
    ink: '#0b0e1f'
    ink-muted: '#262a40'
    edge: '#0b0e1f'
  mode:
    # Fill per theme (dusk, day, high-contrast dusk, high-contrast day). Normal is the raised tone with a 2px ink-muted edge.
    normal: { dusk: '#2a3257', day: '#f3cfdc', hc-dusk: '#1e2448', hc-day: '#e9e6f0' }
    outdoor-limited: { dusk: '#f6dc8e', day: '#b4831a', hc-dusk: '#ffe29a', hc-day: '#fbd25e' }
    commute-disruption: { dusk: '#f08c3f', day: '#a8541c', hc-dusk: '#ffa25a', hc-day: '#ffb066' }
    hybrid-recommended: { dusk: '#ea5a44', day: '#93302a', hc-dusk: '#ff7a52', hc-day: '#ff8d6e' }
    surge-night: { dusk: '#7fb0ff', day: '#3a64b0', hc-dusk: '#93c2ff', hc-day: '#9cc8ff' }
typography:
  # One family. Skyclause Figures is a cut of Roundo with one digit width; code is the only monospace.
  sans: '"Roundo", "Roundo Fallback", system-ui, sans-serif'
  figures: '"Skyclause Figures", "Roundo", "Roundo Fallback", system-ui, sans-serif'
  code: '"JetBrains Mono Variable", ui-monospace, monospace'
  app:
    title: { size: 26, weight: 500, line-height: 32, tracking: '-0.02em' }
    section: { size: 20, weight: 500, line-height: 28, tracking: '-0.01em' }
    figure: { size: 20, weight: 500, line-height: 28, family: figures }
    card-title: { size: 16, weight: 600, line-height: 24 }
    text: { size: 16, weight: 400, line-height: 24 }
    body: { size: 14, weight: 400, line-height: 20 }
    small: { size: 13, weight: 400, line-height: 18 }
    code: { size: 13, family: code, line-height: 20 }
  public:
    display: { size: 'clamp(3rem, 7vw, 8rem)', weight: 500, line-height: 1.05, tracking: '-0.025em' }
    head: { size: 'clamp(2rem, 1.3rem + 3.2vw, 4rem)', weight: 500, line-height: 1.05, tracking: '-0.025em' }
    lead: { size: 'clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem)', weight: 400, line-height: 1.35 }
    body: { size: 'clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem)', weight: 400, line-height: 1.5 }
    small: { size: 'clamp(0.8125rem, 0.79rem + 0.1vw, 0.875rem)', weight: 400, line-height: 1.5 }
rounded: { surface: 16, nested: 10, capsule: 9999, checkbox: 4 }
spacing:
  base: 4
  gap: 16
  pad: 20
  section: 48
  shell: { column: 1200, gutter: 24, gutter-phone: 16 }
components:
  button: { height: 36, padding-x: 16, radius: 9999, border: 2 }
  button-page: { height: 48, padding-x: 24, radius: 9999, border: 2 }
  field: { height: 40, radius: 10, border: 2 }
  badge: { height: 24, radius: 9999 }
  switch: { height: 24, width: 40, border: 2 }
  checkbox: { size: 24, radius: 4 }
  target: { min: 24, touch: 44 }
  rows: { table: 44, table-compact: 40, triage: 64, phone-sheet: 48 }
  shell-bar: { row: 48 }
  day-strip: { track: 40, capsule-min: 24, now: 3 }
  focus: { width: 2, offset: 2, width-high-contrast: 3 }
---

# Skyclause design

How Skyclause looks and behaves as built: one idea (the window as a capsule on the day's strip), the tokens and components that carry it, the shell, the screens, the landing, and the rules for voice and accessibility. Every value is read from the code on `feat/frontend-redesign` (`styles/globals.css`, `components/ui`, `features/data-components`, `features/brand`, `packages/elements`, the shell and the landing); requirements and routes live in the [PRD](/docs/PRD.md#information-architecture) and words in the [glossary](/docs/PRODUCT.md#glossary). Every example is a real reading, a labelled replay or labelled arithmetic, each with its date.

Contents:

1.  [Overview](#overview)
1.  [Themes](#themes)
1.  [Colour](#colour)
    1.  [Roles per theme](#roles-per-theme)
    1.  [Contrast rules](#contrast-rules)
    1.  [Mode colours](#mode-colours)
1.  [Typography](#typography)
    1.  [App scale](#app-scale)
    1.  [Public scale](#public-scale)
1.  [Shape, spacing and elevation](#shape-spacing-and-elevation)
1.  [Motion](#motion)
1.  [Components](#components)
    1.  [Controls](#controls)
    1.  [Product components](#product-components)
    1.  [Shared states](#shared-states)
    1.  [Layout components](#layout-components)
1.  [App shell and navigation](#app-shell-and-navigation)
1.  [Screens](#screens)
    1.  [Dashboard](#dashboard)
    1.  [Project overview](#project-overview)
    1.  [Windows](#windows)
    1.  [Signals](#signals)
    1.  [Bundle and call detail](#bundle-and-call-detail)
    1.  [Ledger](#ledger)
    1.  [Evidence requests and packs](#evidence-requests-and-packs)
    1.  [Analysis](#analysis)
    1.  [Settings](#settings)
    1.  [Onboarding, projects and subscribers](#onboarding-projects-and-subscribers)
    1.  [Public and auth pages](#public-and-auth-pages)
1.  [Data visualisation](#data-visualisation)
1.  [Landing art direction](#landing-art-direction)
    1.  [Landing composition](#landing-composition)
    1.  [The live verdict](#the-live-verdict)
    1.  [Landing copy deck](#landing-copy-deck)
    1.  [Landing imagery and credits](#landing-imagery-and-credits)
    1.  [Landing motion](#landing-motion)
1.  [Web components and brand assets](#web-components-and-brand-assets)
    1.  [Mark and wordmark](#mark-and-wordmark)
    1.  [Favicons](#favicons)
    1.  [Open Graph card](#open-graph-card)
    1.  [oEmbed card](#oembed-card)
    1.  [Email notice and ICS entry](#email-notice-and-ics-entry)
1.  [Voice and content](#voice-and-content)
1.  [Accessibility](#accessibility)
1.  [What is not built](#what-is-not-built)
    1.  [CLI output](#cli-output)
1.  [See also](#see-also)

## Overview

- **The idea.** The window (a declared span of the day, such as the 15:30 release wave on 2 November 2026, that gets one approved, graded call) becomes **a capsule lying on the day's strip**. A weather app has no declared windows and a readings app has no approved call, so only Skyclause can draw this. The capsule is a bar with fully round ends; its left edge is the window's start and its right edge is its end; the strip under it is one day (or one afternoon) long.
- **Where the capsule appears.** Four scales, and nowhere a generic rounded rectangle:
  1. **Enormous:** the landing hero's photograph is masked by one capsule that the viewport crops; every landing photograph takes a capsule or rounded mask.
  2. **Strip:** the day strip (see [product components](#product-components)) is a row of capsules of different lengths, one per window, filled by the call's mode. It leads the dashboard's today block, the project overview, the call pages and the landing hero, the windows page draws the same capsules on a 14-day timeline, and every one is drawn from real windows and real calls.
  3. **Control:** every button, tab, toggle and segmented control is a capsule (36px in the app, 48px on public pages).
  4. **Text size:** the status mark beside a mode's name, the Review count, the current-item mark under a label, the progress bar, the skeleton, and the capsule wordmark.
- **Two surfaces, one system.** The public surface (landing, public pages, sign-in) is large type on the ground, with 48px controls. The app is a top bar over one 1200px column, with 36px controls and tables on a 44px pitch. Both use the same tokens, the same radius and the same capsule.
- **The face of each surface.** The landing leads with the live verdict beside a photograph of the Bukit Jalil sky. The app leads with what needs a person (the bundles waiting for review) and the day strip.
- **What the design never does.** Show a value that is not live or not labelled replay; swap to a recording when a read fails; let colour carry a mode alone; put a mode hue on a button, tab or navigation item; use a gradient, glass, a shadow at rest or a 1px outline on a surface; draw a chart without a scale and times.

## Themes

Five themes are classes and attributes on `<html>`. Roles are CSS custom properties in [globals.css](/apps/web/styles/globals.css); a nested `.dark` or `.light` element (the appearance preview) resolves its own aliases, so it needs no local copy.

| Theme              | Selector                         | Ground    | Ink          | Use                                                                    |
| ------------------ | -------------------------------- | --------- | ------------ | ---------------------------------------------------------------------- |
| Dusk (default)     | `.dark`                          | `#1a2039` | `#f9a3c0`    | The default; landing and auth surfaces always use it                   |
| Day                | `.light`                         | `#fdeef3` | `#1a2039`    | The account's light choice                                             |
| High contrast dusk | `.dark.hc`                       | `#0b0e1f` | `#ffffff`    | Dusk with a 7:1 text floor and 2px ink outlines                        |
| High contrast day  | `.light.hc`                      | `#ffffff` | `#0b0e1f`    | Day with a 7:1 text floor and 2px ink outlines                         |
| System             | `html[data-theme='system']`      | follows   | follows      | Repeats Day for a light OS, value for value; Dusk otherwise            |
| Forced colours     | `@media (forced-colors: active)` | `Canvas`  | `CanvasText` | System colours; every capsule keeps a 2px edge, its glyph and its word |

- **Applying the setting.** The account stores theme (`dark`, `light`, `system`), contrast (`system`, `standard`, `more`) and motion (`system`, `reduce`, `full`). The server renders `class="dark hc"` on `<html>` from the account so the first paint is right, and an inline script in `<head>` (hash-pinned in the CSP) follows OS changes live and sets `<meta name="theme-color">` to the ground. `lib/theme.ts` holds the four browser-chrome colours; `test/tokens/contrast.test.ts` fails when they drift from the CSS.
- **High contrast** is a modifier on Dusk or Day: a 7:1 text floor, an `--edge` of 2px in ink on every capsule, chip, card and floating surface (fields keep their 2px control edge, which is near white or near black there), a 3px focus ring, and chart grids dropped. `prefers-contrast: more` turns it on while the contrast setting is `system`.
- **Forced colours** maps every role to a system colour (`Canvas`, `CanvasText`, `Highlight`, `ButtonFace`, `Field`); mode fills vanish, and each capsule keeps a 2px `CanvasText` edge, its glyph and its word. Control edges are `ButtonText`. The browser paints a `Canvas` backplate behind text, so filled controls and selected states set `forced-color-adjust: none` and paint their own pair: `ButtonText` with a `ButtonFace` label for a filled control (`GrayText` when disabled), `Highlight` with `HighlightText` for a selected segment, tab, row, date or menu item.
- **Density** is a second setting, `data-density`: comfortable (default, 14px body, 44px rows) and compact (13px body, 40px rows). Tables and `[data-density-row]` read `--density-row-height`.

## Colour

Two colours do everything: the ground and the ink, with tone steps of the ground for surfaces. Mode hues exist only on data.

### Roles per theme

| Role                          | Dusk      | Day       | High contrast dusk | High contrast day |
| ----------------------------- | --------- | --------- | ------------------ | ----------------- |
| `--ground` (page)             | `#1a2039` | `#fdeef3` | `#0b0e1f`          | `#ffffff`         |
| `--surface` (panels, cards)   | `#212846` | `#f9dfe8` | `#141933`          | `#f4f2f7`         |
| `--raised` (nested, controls) | `#2a3257` | `#f3cfdc` | `#1e2448`          | `#e9e6f0`         |
| `--overlay` (hover, pressed)  | `#313a62` | `#eec3d3` | `#2a315c`          | `#dcd8e6`         |
| `--ink` (everything read)     | `#f9a3c0` | `#1a2039` | `#ffffff`          | `#0b0e1f`         |
| `--ink-muted` (meta only)     | `#c68da3` | `#555a75` | `#e6e8f2`          | `#262a40`         |
| `--edge` (capsule outline)    | none      | none      | `#ffffff`          | `#0b0e1f`         |

- **Derived roles, same in every theme:** `--control` is raised; `--control-edge`, `--border` and `--input` are ink-muted; `--focus` and `--ring` are ink; `--field` is surface; `--rule` is raised; `--primary` is ink with `--primary-foreground` the ground (the primary control is made primary by inversion); `--accent` is overlay (the hover and pressed fill; text on it is ink only); `--destructive`, `--selection` and `--warning` are ink; `--chart-emphasis` is ink, `--chart-ink` is ink-muted, `--chart-grid` is raised. The shadcn names (`--background`, `--card`, `--popover`, `--muted`) are aliases declared once.
- **Tone steps, not lines.** Panels sit one step above the ground (`--surface`), things nested in a panel one step up again (`--raised`), floating things on `--raised` with a shadow. A card inside a card, and a field, button or track inside a card, step up a tone by themselves.
- **Running text is ink** at 16px or more on app screens; muted holds meta, labels and captions at 13px or more.
- **Ink is the selection colour.** Current and selected states take ink plus a small capsule mark and `aria-current` or `aria-selected`; the `current-mark` utility draws the 16×4px capsule under a label. Crimson is gone: `--brand-crimson` survives only as an alias of ink.
- **Aliases kept for older call sites** (`--status-*`, `--landing-*`, `--brand-crimson`) all resolve to the roles above.

### Contrast rules

Every pair is measured with the WCAG 2.2 relative-luminance formula in [contrast.test.ts](/apps/web/test/tokens/contrast.test.ts), in all four themes; the test fails when one slips.

- **Text:** 4.5:1 in Dusk and Day, 7:1 in both high-contrast themes, for ink on ground, surface, raised and overlay, for muted on ground, surface and raised, and for every filled pair the UI sets (primary, popover, mode ink on mode fill).
- **Control edges and data marks:** 3:1 on ground, surface and raised, for `--border`, `--input`, `--control-edge`, `--focus`, `--ring`, the Normal capsule's edge and the chart marks. Tone steps alone reach only 1.1–1.3:1, so every control boundary (field, checkbox, switch, unselected segment) and every low-emphasis data mark carries a 2px edge in ink-muted; panels, cards and tiles separate by tone alone.
- **Mode capsules** stand out by fill or by edge: where a hue reaches 3:1 on ground and surface the edge is transparent, and where it does not (Outdoor-limited in Day) the edge is ink-muted.
- **The Sky ramp** falls in lightness by at least 10 L\* per step (Outdoor-limited, Commute disruption, Hybrid recommended), so the ramp never relies on hue alone.

Measured on the shipped tokens (ratio, to two places):

| Pair                                         | Dusk               | Day                   | HC dusk               | HC day                |
| -------------------------------------------- | ------------------ | --------------------- | --------------------- | --------------------- |
| Ink on ground / surface / raised             | 8.42 / 7.57 / 6.52 | 14.28 / 12.79 / 11.28 | 19.15 / 17.26 / 14.99 | 19.15 / 17.22 / 15.54 |
| Ink on overlay                               | 5.77               | 10.22                 | 12.41                 | 13.68                 |
| Ink-muted on ground / surface / raised       | 5.91 / 5.31 / 4.57 | 6.02 / 5.39 / 4.76    | 15.67 / 14.13 / 12.27 | 14.12 / 12.70 / 11.46 |
| Primary control text (ground on ink)         | 8.42               | 14.28                 | 19.15                 | 19.15                 |
| Surface / raised against ground (tone steps) | 1.11 / 1.29        | 1.12 / 1.27           | 1.11 / 1.28           | 1.11 / 1.23           |

### Mode colours

One ranked scale for the Sky modes plus Surge night for Crowd; every other state is hue-free. A mode is never told by colour alone: its glyph and its word are printed in every theme.

| Mode or state      | Pack  | Glyph                     | Dusk fill | Day fill  | Notes                                                               |
| ------------------ | ----- | ------------------------- | --------- | --------- | ------------------------------------------------------------------- |
| Normal             | Both  | Ring                      | `#2a3257` | `#f3cfdc` | The quiet one: the raised tone with a 2px ink-muted edge            |
| Storm watch        | Sky   | Hollow triangle           | none      | none      | Solid ink edge, no fill                                             |
| Outdoor-limited    | Sky   | Half-filled disc          | `#f6dc8e` | `#b4831a` | Pale amber; Day adds an ink-muted edge (fill reaches 3.02:1 only)   |
| Commute disruption | Sky   | Filled triangle           | `#f08c3f` | `#a8541c` | Orange                                                              |
| Hybrid recommended | Sky   | Filled square             | `#ea5a44` | `#93302a` | Deep orange-red                                                     |
| Surge night        | Crowd | Three rising bars         | `#7fb0ff` | `#3a64b0` | The one cool hue, away from the warm ramp                           |
| No call            | Both  | Dashed ring with a slash  | none      | none      | Dashed ink-muted edge, no fill: a hatched absence, not a hue        |
| Draft              | Both  | The call's own            | none      | none      | Dotted ink edge, no fill: a drafted call, or one waiting for review |
| Pending            | Both  | None (word "No call yet") | none      | none      | Dotted ink-muted edge: a window with no call yet                    |
| Expired            | Both  | The call's own            | surface   | surface   | Surface tone with a control edge: an expired or superseded call     |
| Rejected           | Both  | The call's own            | raised    | raised    | Raised tone with a control edge: a rejected call                    |

- **Text on a mode fill** is `--mode-*-ink`: the ground navy on every Dusk hue and on Day's Outdoor-limited, the Day ground on Day's other hues, and the high-contrast ink on both high-contrast sets. Measured: Dusk 11.87 (Outdoor-limited), 6.51 (Commute disruption), 4.62 (Hybrid recommended), 7.30 (Surge night); Day 4.74, 4.73, 6.93, 5.15.
- **High-contrast hues** step lighter so the text floor of 7:1 holds: Outdoor-limited `#ffe29a` and `#fbd25e`, Commute disruption `#ffa25a` and `#ffb066`, Hybrid recommended `#ff7a52` and `#ff8d6e`, Surge night `#93c2ff` and `#9cc8ff` (dusk, day). Every capsule takes the 2px ink edge there.
- **The tone hook.** Set `data-tone="normal|outdoor-limited|commute-disruption|hybrid-recommended|surge-night|watch|no-call|draft|expired|rejected"` on a capsule, a strip mark or an SVG shape and use the `tone-fill` utility (fill, ink and edge together), or read `--tone`, `--tone-ink` and `--tone-edge`. Standalone SVG (favicons, Open Graph cards, the strip outside a page) cannot read tokens; `modeColours` in `packages/elements` holds the Dusk and Day values and `brand.test.ts` checks them against the CSS.
- **Colour budget.** Mode hues sit on at most about 3% of the pixels of an app screen. Charts are drawn in ink with one emphasised series; there is no rainbow and no hue per series.
- **Glyph set.** Nine shapes on a 12px grid with a 1.5px stroke, in `packages/elements/src/glyphs.ts`: ring, hollow triangle, half disc, filled triangle, filled square, rising bars, dashed ring with a slash, clock, cross. Input states reuse them: fresh and recovered the ring, stale the clock, error the cross, and pending, probation and off-hours the dashed ring.

## Typography

- **One family.** Roundo (Shiva Nallaperumal, Indian Type Foundry, SIL OFL 1.1, from Fontshare) for everything on the landing, public pages, auth and the app. It is self-hosted as the variable woff2 (weights 200–700) through `next/font/local` in [fonts.ts](/apps/web/lib/fonts.ts), with a metric-matched `Roundo Fallback`, so no third-party font host loads at runtime. The static `woff` weights (400, 500, 600) exist only for Open Graph cards, because Satori reads neither woff2 nor variable fonts. Provenance and hashes are in [SOURCE.txt](/apps/web/fonts/roundo/SOURCE.txt).
- **Figures.** Roundo ships no tabular figures. `Skyclause Figures` is a cut of Roundo itself (same design, every digit on one advance width, the 1 given a foot, colon, full stop and comma kept narrow), renamed as the OFL asks and built by [build.py](/apps/web/fonts/skyclause-figures/build.py). It loads ahead of Roundo through `unicode-range` limited to digits and the characters numbers are printed with.
  - **Opt in** with `data-numeric` (or the `figures` utility, or `type-figure`) on numeric columns, clocks and values that update in place, and right-align them with `text-right`. These switch the digits to Skyclause Figures while the letters stay Roundo.
  - **Always on** for `table`, `time` and `[data-numeric]`: `font-variant-numeric: tabular-nums`, which the crawl checks on every table cell. On its own it changes nothing in Roundo.
  - **Keep out of running text:** identity text and prose keep Roundo's own digits, since the one-width 1 is wide-set.
- **Monospace only for real code.** JetBrains Mono (`type-code`, 13px) sets `<code>`, `<pre>`, `<kbd>`, `<samp>`, the code blocks of the playground and connect pages, and CLI or MCP snippets. Station IDs and gauge names in running text stay in Roundo with `translate="no"`.
- **Arrows are icons,** never the → character, which Roundo lacks.
- **No uppercase tracked labels,** no eyebrows, no index numbering, no styled accent word in a heading.

### App scale

Five sizes at most on a screen: 13, 14, 16, 20, 26.

| Utility           | Size and weight | Line | Use                                                     |
| ----------------- | --------------- | ---- | ------------------------------------------------------- |
| `type-title`      | 26 / 500        | 32   | The screen's `h1`, tracking −0.02em                     |
| `type-section`    | 20 / 500        | 28   | Block headings, tracking −0.01em                        |
| `type-figure`     | 20 / 500        | 28   | A screen's answer as a figure, Skyclause Figures        |
| `type-card-title` | 16 / 600        | 24   | Card and panel titles                                   |
| `type-text`       | 16 / 400        | 24   | Running text                                            |
| `type-body`       | 14 / 400        | 20   | Controls and tables (13 in the compact density)         |
| `type-small`      | 13 / 400        | 18   | Labels, meta, captions, axis labels; nothing is smaller |
| `type-code`       | 13 mono         | 20   | Real code only                                          |

### Public scale

Display and body are the two voices; the lead step sits between.

| Utility           | Size                                          | Weight | Leading | Use                                        |
| ----------------- | --------------------------------------------- | ------ | ------- | ------------------------------------------ |
| `type-display`    | `clamp(3rem, 7vw, 8rem)`                      | 500    | 1.05    | The hero, tracking −0.025em, sentence case |
| `type-head`       | `clamp(2rem, 1.3rem + 3.2vw, 4rem)`           | 500    | 1.05    | Section heads, tracking −0.025em           |
| `type-lead`       | `clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem)`    | 400    | 1.35    | The supporting sentence                    |
| `type-page-body`  | `clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem)`  | 400    | 1.5     | Body, 17–19px                              |
| `type-page-small` | `clamp(0.8125rem, 0.79rem + 0.1vw, 0.875rem)` | 400    | 1.5     | Captions, credits, footer                  |

The legal, error and auth pages use these utilities; the landing keeps its own six steps (see [Landing composition](#landing-composition)), with the same family, weights and tracking. Headings use `text-wrap: balance`; a headline runs two lines or fewer at every width.

## Shape, spacing and elevation

- **One radius.** Surfaces (panels, cards, tiles, tables, dialogs) take `--radius-surface`, 16px (`rounded-xl`); a surface nested in one takes `--radius-nested`, 10px (`rounded-md`); fields, selects and menu items are 10px. Everything with a label or a state is a capsule (`rounded-full`, 9999px). The checkbox square, 4px (`rounded-sm`), is the only other radius.
- **No lines on surfaces.** Panels and cards carry no outline at rest (`--edge-width` is 0; high contrast makes it 2px in ink). Three kinds of line remain, each for a stated reason: the 2px control edge in ink-muted on fields, checkboxes, switches, unselected segments and low-emphasis marks (3:1 non-text contrast); the 1px row rule in `--rule` between list rows; and the sticky top bar's 1px rule in `--rule`, which fades in only once content scrolls under it. Table rows carry no rule: space and tone tell them apart.
- **No shadows at rest.** `--shadow-xs` and `--shadow-sm` are `0 0 #0000`. Only what floats (menus, popovers, dialogs, sheets, drawers, toasts, the command palette) sits on `--raised` with `--shadow-float`: `0 12px 32px rgb(6 8 20 / 0.45)` in Dusk and `0 12px 28px rgb(26 32 57 / 0.16)` in Day. No gradients and no glass.
- **Spacing on a 4px base.** `gap-gap` 16px between blocks, `p-pad` 20px panel padding (`--card-spacing`), `gap-section` 48px between sections of a screen, `h-control` 36px, `h-control-page` 48px, `h-10` 40px for fields, and `min-h-target` 24px for the smallest target (44px on coarse pointers).
- **Elevation is tone.** Ground, surface, raised, overlay: four lightness steps and nothing else separates them. Hover and pressed take `--overlay`; the selected row of a list takes `--accent` (overlay) with `aria-current`.
- **The app column.** Every app screen renders in `<main id="shell-content">`, 1200px of content (`--shell-column`) between 24px gutters (16px at 640px and below), centred; the bar's row shares it. Screens fill the column and never set their own page width or side padding. `#shell-content` has 24px above its content (20px on a phone) and 64px below (48px on a phone).
- **Anchors and sticky parts.** `html` reserves `scroll-padding-top` (64px, or the bar's published `--shell-bar-height` plus 8px inside the app), so focus and anchor jumps land below the sticky bar; ids add no `scroll-margin`. Anything else that sticks goes at `top: var(--shell-bar-height, 0px)`; phone footers go at `bottom: 0` plus the safe-area inset.
- **Breakpoints.** 640px (phone), 1023px and 1024px (the bar's second row), 1100px (three-region triage) and 1360px (the bar's one row). Layouts hold strings 30% longer than English and reflow at 320px.

## Motion

- **Transform and opacity only.** CSS animates nothing else; `static.spec.ts` fails a build that animates or transitions another property. The one easing family is `cubic-bezier(0.16, 1, 0.3, 1)`.
- **The app moves for feedback.** Press nudges a control 1px (`translate-y-px`); the switch thumb and the packs and overview toggles slide in 200ms; the bar's rule fades in 200ms; menus, dialogs and sheets fade and travel 100–250ms; a new bundle row fades in over 200ms on the dashboard; the appearance preview's capsule travels once to show what reduced motion removes. Skeletons are flat, with no shimmer. Nothing pulses, glows or enters on load.
- **The landing moves more** and the rules for it are in [Landing motion](#landing-motion).
- **Reduced motion** comes from the OS (`prefers-reduced-motion`) or the account (`html[data-motion='reduce']`); either removes every animation, transition and smooth scroll with `!important`, and final states render at once. The crawl runs every route under both and fails if anything is still running.

## Components

The kit is shadcn style `base-nova` on Base UI (not Radix), in `apps/web/components/ui/`, restyled to the rules above; the product components are in `apps/web/features/data-components/` and `apps/web/features/brand/`. Reach for these before writing markup of your own.

### Controls

- **Button.** A capsule, 36px in the app and `size="lg"` 48px on public pages, 14px and 16px text, a 2px border on every variant so forced colours draw it. `default` is the one primary, made primary by inversion (ink fill, ground text); `outline` and `secondary` are filled controls (`--control`) with the 2px ink-muted edge and an overlay hover; `ghost` is the quiet action; `destructive` is an ink-edged transparent capsule (the danger is in its words and its confirmation, never a red); `link` is the one variant with no capsule. Press nudges 1px, disabled drops to 60% opacity. A link styled as a capsule on a server-rendered page uses `buttonVariants` from `#ui/button-variants`, which pulls no Base UI script.
- **Segmented control.** `ToggleGroup` and `Tabs` draw a capsule strip (2px control edge, `--muted` track, 4px padding) whose selected item inverts to the primary fill; the selected state is also `aria-selected` or `aria-pressed`.
- **Fields.** `Input` and `Select` are 40px high and `Textarea` starts at 80px, all with a 10px radius, filled with `--field` and a 2px control edge. Inside a card they step up to raised, inside anything floating they step down to the ground, and an invalid field takes an ink edge. A field always has a label, a meaningful `name` and `autocomplete`.
- **Checkbox and switch.** A 24px checkbox with a 4px square and a 2px edge; a 24px-high switch capsule with a 2px edge whose thumb is ink and whose track inverts to ink when on. Where a plain form must post without a client component, `native-check`, `native-select` and `native-switch` utilities draw the same controls on the native elements (the box is 24px; put the control and its label in a row of at least 44px on touch).
- **Badge.** A 24px capsule at 13px/500, never a hue; modes have their own badge.
- **Progress** is an 8px capsule track on raised with an ink fill. **Skeleton** is a flat raised tone at the size of what loads, `rounded-full` where it stands for a capsule, with no shimmer.
- **Tables** (`#ui/table`, the only table) set 14px text, a 40px header strip on the raised tone at 13px/500 in muted, rows at `--density-row-height` (44px, 40px with `compact`) told apart by space and tone (hover raised, selected overlay with a capsule mark, dimmed muted) with no rule between them, numeric columns right-aligned in figures, opt-in one-line truncation with a title, an optional sticky header under the bar, a capsule-ended fill that measures a figure, and a two-line list item per row at 640px and below.
- **Floating things** (menus, popovers, dialogs, sheets, drawers, toasts, the palette) sit on `--raised`, 16px radius, with `--shadow-float`; in high contrast they also take the 2px ink edge.

### Product components

- **Day strip** (`DayStrip`). One capsule per window on a 40px track one day long (a surface-tone capsule track, raised inside a card), each filled by its call's mode with the mode's glyph and, once the capsule is 9rem wide, its word; "now" is a 3px ink line. Under the track, whole MYT hours label the clock (three labels on a phone, four from 24rem of strip width, all from 40rem); under the clock, an ordered list carries every window's `HH:MM–HH:MM MYT` in `<time>`, its status mark, "Draft, not approved" where it is a draft, and its title as the link (capsules are not targets, since a short window is too small). The list holds at most 50 rows and says how many more exist. It is a server component with no hooks: a public page renders it without script. Import it from `features/data-components/day-strip`, never the index, which also loads client components.
- **Status mark and mode badge** (`StatusMark`, `ModeBadge` in `features/brand`). A text-size capsule: the state's glyph, then its word, in the state's tone. `StatusMark` takes any mode or input state (`variant="plain"` sets it inline in the ink with no capsule); `ModeBadge` takes a call mode, Storm watch or No call and, where both packs show, prefixes the pack ("Sky: Normal").
- **Window strip and readings chart** (`WindowStrip`, `ReadingsChart`). The day row of capsules over the readings of one window: lanes for the 5-minute rain, the rolling 60-minute total against the Lebat line (31 mm in an hour), MET warning spans, crowd arrival and exit periods and input ages, on one clock. The lines are an SVG whose width follows the column and whose height stays in pixels; every label is HTML at 13px around it (y labels per lane, whole-hour x labels that thin as the column narrows, the header with the date and MYT, the Now and Lebat labels), so nothing scales down on a phone. A table of the readings is one button away, capped at 48 rows (past that, the highest reading in each stretch of 15 minutes to a day, and it says so). `list={false}` hides the day row's window list where the page already names the window.
- **Bundle card, call row, input-age chip, source health row, grade card.** The bundle card names its trigger and time, the modes of its calls as badges, the minutes of SLA left (or "SLA passed"), "Agrees" or "Disagrees on n", and the escalation level. The call row leads with the mode badge, then the window, the fired clauses and the time. The input-age chip is a 24px capsule of glyph, name and age ("gauge 12 min old"; stale adds the clock glyph and "stale"; an error reads "{name} error since {time}"), whose hover card shows source time, received time, status and latency. The source health row carries the latest value with its unit, age, cadence, state word and glyph, the licence, and up to 48 ticks of recent real polls. The grade card prints the metric, its value, n, the period and a Wilson 95% interval as a capsule bar on a 0–1 scale with the point as a 4px tick; with n=0 it prints "n=0" and no interval, and a replayed grade carries the "Replay" badge.

### Shared states

Every screen designs these, and each is a component, so a screen never invents its own.

- **Empty day** (`EmptyDay`). A successful read with no windows: the empty track, the day's hours, "No windows on 12 November 2026." and the one next action. `caption` replaces the sentence where the read spans more than the day ("No windows declared yet.").
- **No call** (`NoCallState`). The dashed capsule with its glyph and the word "No call", then which inputs fail and since when ("{inputs} failing since {time}."), or "A required input is failing, so this window gets no call." where the reason is not known there. A value is never shown instead.
- **Source error** (`SourceError`). A failed read inside the block that needed it: the cross glyph and "Couldn’t read {source} just now." (for example the windows list), then "Tried at {time}." or "No answer at {time}.", and a retry control. A read that is not available yet (HTTP 501) reads "Skyclause can’t show {source} yet." with the off-hours glyph and no retry. The status is never printed; it stays on `data-source-error` for tests. It is never an empty state: an empty day is only a successful read with nothing in it.
- **Not available yet** (`NotBuilt`). A part of the product that does not exist yet, with no read attempted, in the caller's whole sentence ("AI keys are not available yet."), then what is available instead when there is something. It is not a 501 error and not an empty state.
- **Empty (n=0).** A block with nothing to show prints "n=0" or its own plain sentence and the next action ("Declare a window", "Bind a source"), never a placeholder chart.
- **Loading** is skeleton capsules at the real size; loading text ends with "…".
- **Replay** is labelled wherever it appears: a "Replay" badge with its source and capture date, dashed lines and hollow marks in charts, never on the same plot as live data.

### Layout components

- **Triage layout** (`TriageLayout`, `TriageRow`). Three regions on one ground: a list of fixed width (280–340px, 306–384px from 1100px), the open item on a surface card, and its details (280–340px). From 1100px all three stand side by side; from 641px the details go under the open item; on a phone one region shows at a time, chosen by `view`. Rows are two lines on a 64px pitch; the selected row takes the overlay fill and `aria-current`.
- **Phone sheet** (`PhoneSheet`, `PhoneSheetItem`). A bottom sheet nearly the screen's height, opened from the bar's menu button; items are 48px rows, the current one marked by the capsule and `aria-current="page"`.
- **Card.** The surface: `bg-card`, 16px radius, 20px padding; a card inside a card is raised with a 10px radius.

## App shell and navigation

One top bar on the ground, sharing the content column, and nothing at the bottom of the screen. There is no sidebar, no project tab row and no collapse setting.

- **Bar.** Sticky, 48px per row. From 1360px with a project open it is one row: wordmark (the mark and "Skyclause"), organisation switcher, a capsule divider that leans like a slash, project switcher, the four core destinations as text links, the MYT clock, the Review control, the command palette button, and the organisation and account menu. At 641–1359px with a project, and always at 641–1023px, the project's links and the MYT time move to a second row on the same column. Its height is published as `--shell-bar-height`.
- **Destinations.** Windows, Signals, Calls and Ledger are the bar's links; the current one is ink with the capsule mark and `aria-current="page"`, the rest are muted. Overview, Analysis, Subscribers (Approver and above) and Project settings (Admin and above) live in the "More project pages" menu. The "Organisation and account" menu holds Dashboard, Projects, Organisation analysis and Organisation settings (by role), Connect your AI, Account (a guest sees Appearance only), and Sign out, which ends this session and opens the sign-in page ("Sign out everywhere" stays in Security; a guest is offered none). Every destination also appears in the phone sheet and the command palette, and Sign out in the phone sheet. A project the member's list does not have (a mistyped or foreign URL, which is the not-found page) gets no project destinations, only the organisation's; the URL's project is trusted only while the project list could not be read. The model is [navigation.ts](/apps/web/features/shell/navigation.ts); nothing links to a page that is not built (no clause sheet, approvals queue, developers index or docs) or whose operations have no handler yet (webhooks).
- **Switchers** list each membership with its role ("{organisation}, Admin"); the current organisation and project carry `aria-current="true"` and the capsule.
- **Review** is a control in the bar's end cluster that links to `/{org}#dashboard-needs-review`, the dashboard's needs-review block. Its waiting count (an inverted 24px capsule in figures) appears only once the live stream has delivered a real count; the control never prints "0".
- **Phone (640px and below).** The bar keeps the wordmark, Review and a Menu button; the destinations, switchers, clock and tools move into the phone sheet.
- **Palette** (⌘K or Ctrl+K) opens from the bar on every route: a search field, results grouped by kind (Suggestions while empty, then Actions, Go to, Organisations and projects, Theme, and searched Projects, Sources, Windows, Bundles, Calls and Ledger entries), each action saying what it did, a footer of key hints, and designed loading and error states. Sources add items through a `PaletteSource` and a `kind`; a command a role cannot use is not listed.
- **States above a page.** A failed memberships read shows `SourceError` ("Couldn’t read your organisations just now.") above the page; a successful empty one shows "Organisations: n=0" with "Create an organisation". The page renders below either.
- **Skip link** first, to `#shell-content`; focus and anchors land below the sticky bar.

## Screens

Each screen answers one question first, says its finding under the title, and keeps its main job one click away. Routes and roles are the PRD's ([information architecture](/docs/PRD.md#information-architecture), [roles](/docs/PRD.md#roles-and-permissions)); a control the role cannot use is not rendered. Every screen designs its [shared states](#shared-states): a failed read names itself with `SourceError`, an empty read prints "n=0" and the next action, and nothing shows a stale value.

### Dashboard

- **Question:** what needs my approval, and which of today's windows are at risk? ([DSH-1](/docs/PRD.md#dashboard-dsh)) **Finding:** "{n} bundles need review:" then the lead mode badge and "for {window}, {m} min of SLA left", or "Nothing to approve (n=0)".
- **Blocks, in order** (each a `section[data-dashboard-block]` with its own `n=` count and next action): needs review; today's windows at risk; then a two-column row of signal health beside "Shows and storm afternoons ahead" over yesterday's grades (one column below 1024px). Blocks sit 40px apart.
- **Needs review** comes first and keeps the heading id `dashboard-needs-review`, which the bar's Review control targets in every state. Each bundle is a surface row: the minutes of SLA left with a capsule that drains with them, the project and trigger, one mode badge per mode, "Clause engine agrees" or "disagrees on n", escalation, and "Review bundle" (primary on the first row). The first row opens "Readings around this window". A new bundle fades in over 200ms.
- **Today's windows at risk** is a day strip of engine verdicts, every capsule drawn as a draft with the note "Engine verdicts, not reviewed." While the dashboard is composed (below), each window carries its latest call, a drafted one drawn as a draft with "Latest call for each window. A draft is not reviewed yet."
- **Signal health** is a table of source health rows; **yesterday's grades** are grade cards with their Wilson bars.
- **Composed:** while `getDashboard` answers 501, the page reads its blocks from the built per-project reads (bundles needing review, today's windows above Normal, sources, days and nights, yesterday's grades) for the six most recently active projects, each for the packs it runs (storm days for Sky, show nights for Crowd, calls and grades of a pack that is on), and says "Showing 6 of 9 projects: the most recently active." under the finding when there are more. A block whose read fails shows its own `SourceError` with "Try again"; the other blocks render.
- **States:** a failed dashboard or projects read collapses the page to the title and one `SourceError` ("the dashboard") with "Try again"; no projects reads "Create a project to start seeing windows, signals and bundles."; skeletons hold each block's size.

### Project overview

- **Question:** what is the call here now, and what is next? ([PRJ-4](/docs/PRD.md#projects-prj)) **Finding:** per pack, "{n} inputs reporting, oldest {m} min".
- **Blocks, in order:** "Mode now" (one card per pack the project runs, the mode as a large tone-filled capsule with its basis: engine verdict, approved call or "No call yet", fired clauses and input-age chips); "Today" (the day strip, with "Readings around now" under it) beside "Today's windows at risk"; "Signal health" beside "Next listed show or storm forecast" ("Next storm forecast" without Crowd); "Recent bundles" (five rows, with "Ask for a call" where Sky runs). A pack filter (All, Sky, Crowd) sits in the URL only where the project runs both packs. **Primary job:** "Declare a window".
- **Packs:** the project summary carries a state for every pack, on or off; the overview, the projects list, analysis and the composed dashboard show and read only the packs the project's settings turn on, so a Sky-only project (the project form's default) has no Crowd card, filter, tab, show-night read or Crowd analysis read.
- **After the first run:** finishing its last step leads here with `?first-run=done`, where the steps show every one done (an Owner's or Admin's) and the next action: "Ask for a call" where Sky runs, else "Declare a window".
- **States:** each block names its own failed read and carries its own "Retry"; with no data it prints "n=0" and its next action.

### Windows

- **Question:** which of my windows have a call, and what do they look like day by day? ([WIN-2](/docs/PRD.md#windows-win))
- **Views** in the URL (`view`, `from`): a timeline of 14 days (default), a week and a month. The timeline gives each day a capsule track on one shared hour axis, a capsule per window and call lane (Sky, and Crowd where a Crowd call exists) filled by mode, with listed shows' arrival and exit bars and a MET storm-afternoon link beneath. A capsule is filled when its call is approved or sent, dotted while a draft or waiting for review, a quiet tone once expired, superseded or rejected, and a dotted pending capsule where no call exists yet. Each window also lists as a row with times, kind, calls as badges with their state words, and "No call yet"; days with over 50 windows scroll inside their frame. Under 768px the week and month views fall back to timeline rows.
- **Declare a window** is one form: a dialog from 641px and a bottom sheet on a phone, mounted on every project page and opened by `?declare=window`; it takes a title, kind, date, start and end in MYT, recurrence, an ICS import, and validation beside each field. The new window shows its draft call.
- **States:** the empty day with "Declare a window"; each failed read is its own `SourceError` ("the windows list", "the calendar feeds"…) and the page renders around it.

### Signals

- **Question:** is every input fresh, and what does each read now? ([SIG-5](/docs/PRD.md#signals-sig)) **Finding:** "Sky: {n} inputs reporting; oldest {m} min".
- **Blocks:** source rows ordered by health (error first, then stale, pending and fresh), each with value and unit, age in words and a clock time, a status mark and detail ("Pending until {time}", "Failing since {time} · HTTP {status}"), and a link that opens the source's detail below it: the last 24 hours as a window strip with no window (rain), the hourly API line with reference lines at 100, 150 and 180, or the daily exits against the eight-week baseline; then up to 50 newest readings (12 first) and the errors of the last 24 hours, announced politely as they arrive. **Primary job:** opening a source's detail. ("Copy tail command" returns with the CLI.)
- **States:** a failed read names "the bound sources"; no sources reads "No sources are bound to this project." with "Bind sources" for admins.

### Bundle and call detail

- **Question:** should these calls go out as drafted? ([CAL-13](/docs/PRD.md#calls-and-approvals-cal)) The approver's path is the product's spine: Review opens the project's bundles as an inbox, then approve, edit or reject, then the ledger entry. No step asks for information the screen already holds.
- **Layout:** the triage layout at `/{org}/{project}/bundles/{id}`; the open bundle is the route, never a query. **List** (newest first, at most 50): "{pack} · {trigger}", a relative time, the lead mode badge, and for a waiting bundle an SLA capsule ("12 min left", "Due now", "3 min over"); waiting rows are bold and the open row is marked. **Open bundle:** the trigger and time, the SLA lead, "Draft: not reviewed, not sent" where it applies, then the shadow check first: each disagreeing call as a fieldset with "Agent: {mode}" and "Clause engine: {mode}" to choose from, before any agreeing call. Each call shows its mode, window and expiry, a window strip with that window's capsule (the readings end at now; a window still ahead stretches the strip to its end, its capsule drawn past the Now line, and the summary says "Live strip to {now}. The window starts at {start}." instead of reporting a crossing), fired clauses with their wording, values and input ages, the MET warning verbatim in Malay with its English gloss, and its status lines. **Details:** recipients by language, the wording per language, the delay line (trigger, drafted, approved, sent, minutes between) and the agent trace.
- **Decisions:** per call "Select this call for approval" (A), "Edit" (E) and "Reject" (R), with key hints only while the account's shortcuts are on; decisions stay local until the primary "Approve {n} calls" in the sticky decision bar, which stays disabled until every disagreement has a verdict. On approve the engine re-checks; if an input changed, "Changed since drafting" lists the old and new values and ages before a second confirm ([CAL-9](/docs/PRD.md#calls-and-approvals-cal)); a session older than 12 hours re-authenticates first. A Hybrid recommended edit must drop the teaching-mode line before approval.
- **Calls list:** `/{org}/{project}/calls` is a table of crossing time, mode, state, grade and minutes from crossing to sent (a bar scaled to the page's longest), 50 per page; mode and state dim non-matching rows instead of removing them, and pack and dates re-query. **One call** (`/calls/{id}`) opens on the window strip, then no-call or expiry notes, the inputs read at drafting with their ages, the clause evidence with its expression in code, and the agent trace, beside a 360px record column: the delay line, the grade ("Graded by 06:45 MYT the morning after the window"), the clause sheet version, a permalink and a trace id.
- **States:** all-Normal bundles show only "Normal; {n} inputs fresh" with the inputs and no approve control; No call names the input and since when; "Expired, not sent"; "Superseded by a newer run" with a link to the newer bundle; a guest sees "Draft: not reviewed, not sent" and no approve control.
- **Phone:** one region at a time (list, bundle, details), the decision bar's approve moves into a "Review decisions" drawer, targets are 44px.

### Ledger

- **Question:** what was called, approved and graded, and how fast? ([LED-7](/docs/PRD.md#ledger-and-evidence-led)) **Finding:** the integrity line ("Chain intact: {n} checked").
- **Entries tab:** filters in the URL (dates, pack, mode, state) and a kind filter that dims other kinds in place; active filters as removable chips; "{from}–{to} of {n}"; "Export CSV" of the current range; a table on a surface with a sticky header, a 44px pitch and a 50-row page with "Next 50 entries" (a compact table from 1024px, three-line rows below). Each row carries a kind glyph and word ("Call approved", "Notice sent", "Window graded"), mode, grade and the delays to approval and to notice. A correction is a new row.
- **States:** "No entries yet (n=0). The ledger records every approved, edited or rejected call, notice, grade and clause version."; a failed read names its source ("the ledger entries", "the integrity check", "the evidence requests").

### Evidence requests and packs

- **Question:** what did the project know about this window, and when? ([LED-3 to LED-6](/docs/PRD.md#ledger-and-evidence-led)) **Finding:** the request's state: "Not reviewed", "Waiting for approval", "Assembling evidence" or "Replied {time}".
- **Where it lives.** Evidence has no page of its own: it is the Ledger's Evidence requests tab (`?tab=evidence`), a request dialog ("Request evidence" for a window or a call ID, in MYT) and a pack sheet (`?evidence={id}`): **Request** lists status as "Not reviewed", "Waiting for approval", "Assembling evidence" or "Replied {time}". **Pack:** a header with the received, drafted, approved and replied times; readings with source times and station IDs; warnings in force verbatim with a gloss, or "No warning record for this window"; calls, approvals, grades, retained frames and ledger entries, each linking to its stored record. **Primary job:** "Approve reply" for Approver and above when the reply leaves the organisation; otherwise "Download pack". A request past the budget shows the reset time in MYT.
- **States:** "No evidence requests yet (n=0). Request evidence for a window or call." and "No pack yet (n=0). Refresh the request after assembly."

### Analysis

- **Question:** how often are the calls right, and does the agent agree with the clause engine? ([ANL-5](/docs/PRD.md#grades-and-analysis-anl)) The same component serves the project and the organisation roll-up.
- **Layout:** the title with "{scope} · {period}", a period toggle (7D, 30D, 90D, All; default 30D), capsule tabs Sky, Crowd (where the project, or for the organisation any project, runs it; read from the projects' packs, so a Sky-only project asks for no Crowd figures and a Crowd URL there says the pack is off), Agreement, Delays and Review (all in the URL), then per tab: one lead figure with its n and Wilson interval bar, the other figures as rows, the chart of that metric by day (with a table view), ranked clauses with fired counts and precision, and the graded windows table (50 per page, live rows only). Crowd adds night lanes with the forecast band and "D+1 actual". Review lists windows where the shadow verdict fired with no approved call, each with an explanation field. The what-if replay is its own pane, labelled "Replay", with sheet, version, dates and step; with no saved sheet version it says what a replay needs and that the live grades above are available now.
- **States:** every figure prints its n; with none, "No live grades yet (n=0)" and no chart.

### Settings

- **Frame.** One pattern for account, organisation and project settings: the scope title ("Account settings", "Organisation settings", "Project settings") as the `h1`, a quiet wrapping list of that scope's sections (the current one in ink with the capsule mark; guests see only Appearance, Approvers only the organisation Rota), then one row per section: a label column (16px/500 title, 14px muted description, a summary of current values) beside a panel on `--card` with 16px radius and 20px padding. From 860px the two columns split 428:700 with a 24px gap and the label column sticks under the bar; below it they stack. Parts inside a panel are separated by space and tone, never rules; switch rows carry a title, a state in words and the switch at the end; the destructive part is last, typed-name confirmed ([SET-7](/docs/PRD.md#settings-set)). The shared parts are `features/settings/parts.tsx`.
- **Appearance** is radio tiles with live previews made of real marks: theme (Dusk, Day, System), contrast (Follow the system, More contrast), motion (Follow the system, Reduced motion), density (Comfortable, Compact), language and keyboard shortcuts; each saves at once and says "Saved." There is no sidebar setting.
- **Not available yet** parts say so with `NotBuilt` ("AI keys are not available yet."), and no settings navigation lists them.
- **Connect your AI** (`/connect`) sits outside the frame: a capsule strip of eight targets each with its verified glyph and "{n} of 8 targets verified", the transport, the generated config to copy, "First request", the tools and scopes, and "No AI can approve a bundle or send to people".

### Onboarding, projects and subscribers

- **First run** is a capsule strip of six steps (create an organisation, create a project, bind sources, declare the first window, set the approver rota, connect a channel), each with Continue and Skip, filled when done, dashed when skipped and ink-edged when next; the create forms sit beside it. It shows, for an Owner or Admin, on every page a step opens: the organisation and project forms, Packs and sources, Windows, the organisation's Approver rota (the rota step is the organisation's, completed by one saved approver shift, not the project's own Rota) and the project's Channels; the rota and channel steps say which settings page and what completes them. A save there reads the steps again. Once every step is done or skipped, the page where that happened offers Continue to the first project's overview, which shows every step done and the next action; a first run finished earlier shows nothing. Nothing sample is created.
- **Projects** (`/{org}/projects`) is surface rows with the site, a pack state note per pack, "{n} need review" and the signal health line; "Show archived" is in the URL. **Subscribers** shows counts for Approvers and the list of 50 per page for Admins, with "Copy subscribe link".
- **Device and OAuth consent** are auth-surface pages (below).

### Public and auth pages

- **Surfaces.** Public pages (legal, errors) and auth pages use the public scale, 48px controls and the safety and non-affiliation lines. The landing and auth surfaces are always Dusk; public pages (legal, not-found) are Dusk too unless a signed-in account's saved appearance says otherwise.
- **Public frame:** a header with the home link, "Terms" and "Privacy" (hidden at 640px and below) and a "Sign in" button; a footer tile on the surface step with the two brand lines, the legal and language links and the capsule wordmark. Legal pages are one 66ch column with a sticky "On this page" list from 1000px and a retention table that becomes a list at 640px, each period on its own line under its column's name.
- **Errors:** "Page not found" with "This page may be missing or private." and "Go to the Skyclause home page"; "Something went wrong" with "Try again", in English and Bahasa Melayu. The docs and embed hosts, whose pages are not built, answer the not-found page for every path, its links on the marketing and app origins.
- **Auth column:** 520px on the ground with 40px padding: the mark and name, one `h1` (14ch), at most one lead sentence, 600-weight labels above 48px fields with errors beside them, 24px native checkboxes, 48px buttons, and tiles on the surface step for grouped facts. **Sign-in:** passkey, email link, Google, then the PDPA notice link; no password field exists. **Subscribe:** project name, email, role, windows, notice language, channels, the PDPA notice with an unticked consent box, "Subscribe" disabled until consent; preferences open by magic link with one-click unsubscribe. **Device:** the code, then what it connects, Confirm and Deny with equal weight. **OAuth consent:** who is asking, organisation, projects, access, "No AI can approve a bundle or send to people", Allow and Deny with equal weight.

## Data visualisation

- **One chart, one question; one axis.** The window strip stacks lanes that share the time axis, each with its own y-scale, so the Lebat line sits on the 60-minute lane: a 5-minute reading cannot cross a 60-minute class. Never two y-scales on one plot.
- **Always a scale and times.** Round y ticks per lane (the 60-minute lane tops out at 20, 40, 60, 80 or 100 mm, always above the Lebat line); x labels on whole MYT hours that thin as the column narrows; the date once, in the chart header, with "MYT".
- **Ink, not hues.** The series that answers the question is `--chart-emphasis` (ink); a secondary series is `--chart-ink` (ink-muted); grid lines are `--chart-grid` (raised) and drop away in high contrast. No legend where the heading names the series; no rainbow.
- **Marks.** Readings are straight segments with no smoothing and no point markers except on hover: the 5-minute series 2px at 60% opacity, the rolling 60-minute total 2.5px in full ink. The Lebat threshold (31 mm in an hour) is a 1px dashed line labelled "Lebat 31 mm" at its end, and a crossing gets a mark and a label in place ("Lebat crossed at 15:00 (39 mm in 60 min)"). MET warning spans are 4px bars at 35% opacity above the lanes; crowd arrival periods are 6px bars at 12% and exit periods are dashed outlines; the window's own span is an 8% band; "Now" is a 2px ink line labelled "Now MYT". Analysis charts draw columns with square ends and a 4px gap, horizontal grid lines only and no axis lines.
- **Wilson intervals as capsule bars.** Every rate is a value tick on a capsule track scaled 0–100%, with its interval as a capsule and "n=…" and the period beside it; a rate never appears alone, and with n=0 it prints "n=0" and no interval. The agreement chart draws a dashed line at 0.9 labelled "Kill line: 1 in 10 disagree".
- **Replay is styled apart.** Dashed lines and hollow marks, a "Replay" badge naming its source and capture date in the chart header, and never on the same plot as live data; the analysis screen runs replays in their own pane with rows marked `data-origin="replay"`.
- **Honest empties.** A missing reading is a gap (a dash in a table), never a zero; an error span is a cross on the axis; a chart with n=0 is not drawn and its block prints "n=0" with the next action.
- **Interaction and access.** Hit areas larger than the marks; a tooltip with the time, the value with its unit and n; every chart has a table view one button away and a one-sentence summary for screen readers.
- **Number format.** Figures print with their unit ("39.0 mm in 60 min"), through `Intl` for `en-MY` and `ms-MY`: grouping separators, percentages to one decimal, a band as "low–high", times 24-hour in MYT.

## Landing art direction

The landing (`/`) is one page on the Dusk ground, full-bleed (the marketing surface carries no padding of its own), built on the capsule on the day's strip. PRD's [landing requirements](/docs/PRD.md#landing-page-lnd) set what it must do; this section sets how it looks and what it says. It has no navigation bar: the hero holds a small "On this page" list, and the footer holds the rest.

### Landing composition

- **Scale and frame.** The landing sets its own six steps in [landing.css](/apps/web/features/landing/landing.css), in the same family, weights and tracking as the public scale: small `clamp(0.8125rem, 0.79rem + 0.1vw, 0.875rem)`, body `clamp(1.0625rem, 1rem + 0.25vw, 1.1875rem)`, lead `clamp(1.25rem, 1.1rem + 0.7vw, 1.625rem)`, statement `clamp(1.5rem, 1rem + 1.6vw, 2.25rem)`, head `clamp(2rem, 1.3rem + 3.2vw, 4rem)` and display `clamp(2.75rem, 6.5vw, 6rem)`. One margin (`clamp(1rem, 1.67vw, 1.5rem)`), 12px gaps between tiles, the 16px and 10px radii, and a section gap of `clamp(4.5rem, 2rem + 9vw, 10rem)`. Controls are 48px capsules. Every heading is two lines or fewer.
- **Hero: "The call for every window".** The `h1` reads "The call for every window", each word a span for the CSS reveal; the outlined wordmark and the lead sentence ("Skyclause reads the rain gauge, the haze index and the stadium listings around Bukit Jalil, and makes one approved, graded call for each class, event or commute window.") sit on the ground with one "Sign in" capsule and the "On this page" list (How it works, The record, Prices). On the other side the **room** is an enormous capsule, 160% of its column and cropped by the viewport's right edge, holding three photographs of Bukit Jalil that crossfade. Below it the **band** is a 24-hour day strip with the window as a capsule, and the **panel** is a solid `--surface` card holding the window form and the live verdict. The hero is one screen tall from 1024px; on a phone the room comes first at 48svh.
- **Sections, in order**, each with a heading, each a composition of one idea:
  1. **How it works** (`#how`): the heading is the current stage's clause and exactly one shows: "First, the gauge reads 39 mm", "Then Storm confirmed fires", "The window gets its verdict", "A person approves the call", "Next morning, it is graded". A real range input with five stops (Readings, Clause, Verdict and call, Approval and notice, Grade) drives one interface fragment built in real markup with `data-ui`, each labelled "Replay" with its caption. Without script every stage shows stacked, and the radios still switch.
  2. **The record** (`#record`, "What the record keeps"): four names (The ledger entry, The notice, The conditions calendar, The grade) over a capsule photograph that bleeds off the right edge; choosing one swaps the photograph, a fragment and a fact line. The ledger and notice fragments are replays; the calendar fragment is live (the current week, today marked, and the latest approved call or "No approved call yet (n=0)").
  3. **Features**: one statement whose key nouns are each followed by a fragment of the product at text size ("Every reading keeps its age, from the rain gauge [Replay 39.0 mm]. When the haze index fails, the call says [No call]. A person approves each call [Approve]; the next morning grades it."): the replayed gauge figure with its "Replay" label, the No call mark with its glyph and word, and an inert "Approve" capsule (a picture of the button, not a button). Below it one line ("Readings come from JPS, APIMS, MET and Rapid Rail on their own schedules, and a source that fails is never filled in with an old value.") and a "Sign in" capsule. The `h2` is screen-reader only ("What it does").
  4. **Sources** (`#sources`, "Read from public sources"): six tiles of plain names (JPS Infobanjir, DOE APIMS, MET Malaysia, Rapid Rail, GoLive, Wikipedia), each with what is read and its licence from the brand catalogue, or "No open licence: only derived values are shown." Never a drawn logo or an implied partnership; the last tile carries the non-affiliation sentence.
  5. **Prices** (`#prices`, "Prices, in MYR"): two fields, "Commons and Community" (Free, ink-filled) and "Team and Campus" (the raised tone; RM 99 a month per organisation and RM 990 a month per campus). Every price carries "proposal, untested" ([LND-6](/docs/PRD.md#landing-page-lnd)).
  6. **Questions** (`#questions`, "Common questions"): nine native `<details name="faq">` tiles, so one opens at a time with no script, "Is this an emergency warning service?" open at first: "Is this an emergency warning service?", "Who makes the call?", "Can my AI approve a call?", "What happens when a source fails?", "Where does the data come from?", "Is it right?", "Do I need an account to get notices?", "Does it work outside Bukit Jalil?", "Does it excuse attendance?".
  7. **Closing sentence**: "What's the call for [time] today?", where the time field is the form and "today?" is its button; it opens the verdict at the top of the page for that hour.
  8. **Footer:** the wordmark built from nine capsules of different heights, one per letter (a wide version from 640px, a narrow one below), links in columns (How it works, The record, Sources, Prices, Questions; Sign in, Create an account; Terms, Privacy, and the Malay privacy notice), "Bukit Jalil, Kuala Lumpur" with a live MYT clock, the not-a-safety-service and non-affiliation lines, the picture credits and a "Back to the top" capsule.
- **Server first.** Everything is server-rendered except the hero's picker island, the stage range, the footer clock and the motion loader. Without JavaScript the page is complete: the hero's window form is a native GET form with a "Check this window" button and the server renders the verdict for the query or the next hour.

### The live verdict

The hero's one live thing is "pick a window, read the verdict" ([LND-1 to LND-3](/docs/PRD.md#landing-page-lnd)); it acts on the live world, never on recordings.

- **Picking.** A real form: eight date chips (Today, then the next seven days in MYT, the MET forecast's horizon), and "Window start" and "Window end" time fields in MYT on 15-minute steps. The day strip is the enhancement: a slider (`role="slider"`, 00:00–23:45) that drags the capsule (pressing on the capsule as drawn, at least 28px wide, moves it; pressing elsewhere anchors a new one; a touch changes nothing until it travels 8px sideways, so a vertical swipe scrolls the page, and a cancelled gesture puts the window back), moves the start by 15 minutes with the arrow keys and the length with Shift. The picker island loads on the first press, arrow key or form change and replays that event; it evaluates 300ms after the last change, refreshes every 60 seconds while visible, and keeps the choice in the URL (`/?date=…&start=…&end=…`). The closing sentence and the date chips use the same form.
- **Reading.** `POST /v1/public/commons/bukit-jalil/evaluate` with the date and times, from the server on first paint (2 second timeout, never cached) and from the browser afterwards. The browser asks the API host itself, at the `API_ORIGIN` the server hands down (public reads answer CORS `*`, and the page's CSP allows that origin), never the marketing host. When the server's read answers 501 the browser asks nothing, neither on a change nor every minute, until the next page load. The verdict sits on the solid panel, never on a photograph.
- **Showing.** Per pack (Sky, Crowd): a status mark for the mode (or "No call"); "No call for {clause}: {input} {station} silent since {time}" for each blocked input; each fired clause; each input with its value and unit, station, age ("4 min old") and an "Open source" link; "Evaluated {time}"; the exact label **"Clause engine verdict: not reviewed, not sent"** from the response ([LND-3](/docs/PRD.md#landing-page-lnd), pinned by a test); and the latest approved call as a link to its permalink or "No approved call yet (n=0): the latest one shows here once a person approves it." The answer's slot keeps the tallest answer shown, so a failure never moves the photograph above it.
- **Errors are errors.** A failing input is left out of the list and named: "Couldn't reach the {input} at {time}." with "Retry". A failed read (no answer, a timeout, a server error) says "Couldn't reach the live verdict just now." and "Last tried at {time}." with "Retry"; a 429 says "Live verdicts are busy just now." and "Try again after {time}." with "Retry". No status code shows. No rain value, cached copy or recording ever stands in ([LND-2](/docs/PRD.md#landing-page-lnd)).
- **Replay.** The hero shows a replay only while live verdicts for a chosen window are not open (the read answers 501): its answer is then the labelled replay of the 15:30 MYT window on Monday 2 November 2026, as the clause engine read it at the 15:05 MYT poll, under one sentence ("Live verdicts for the window you pick are not open yet, so this is 2 November, replayed from the JPS gauge's readings."), with its Replay mark, its window, the mode, the fired clause, the gauge's value and age and the label. The date chips, times and strip still describe a window, which the strip draws; the answer stays the replay, and the no-JS form does the same. A failed read never turns into a replay. The sections after it use a labelled replay of captured real readings: the 5-minute JPS series for gauge `0232901RF` on Monday 2 November 2026, captured at 21:12 MYT on 5 November 2026 ([capture](/docs/sources/infobanjirjpskl.water.gov.my/rainfall-graph-75.md)); the landing carries only the 60-minute totals derived from it by [generator.ts](/apps/web/features/landing/generator.ts), never the capture itself. Every fragment built on it wears a "Replay" badge, and where the replay has no value (no call was made that day) the fragment says so.

### Landing copy deck

The landing's English copy is written in its components under `apps/web/features/landing/` (there is no Malay landing yet, [LND-7](/docs/PRD.md#landing-page-lnd)); the hero's form and verdict strings are in `packages/i18n/catalogue/en/landing-hero.json`. What the page claims comes from the capture above, the public API and the product's own rules, and every number sits in an element with a `data-source`.

| Moment of the 2 November 2026 replay (MYT) | 60-minute total at gauge `0232901RF` | Where it shows                                                                                         |
| ------------------------------------------ | ------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| 14:55                                      | 29.5 mm, under Lebat (31 mm)         | The bar before the last in the readings fragment (14:00–15:00)                                         |
| 15:00                                      | 39.0 mm, Lebat: the crossing         | The readings fragment's figure ("read 15:00 MYT, 5 min old at the 15:05 poll") and the clause fragment |
| 15:35                                      | 59.5 mm, the span's peak             | The grade fragment ("The input a grade reads") and the record's grade fragment                         |

- **Fixed phrases:** the replay note ("Replay of 2 November 2026 from JPS gauge 0232901RF; the 60-minute totals are our arithmetic. Times after 15:05 MYT are inferred from the documented delays, and no call was made that day."); the grade line ("No live grades yet (n=0): the first appears once a call has been graded.", or the latest n with its Wilson 95% interval, or "Couldn't load live grades just now. Reload the page to try again."); the FAQ's "What happens when a source fails?" ("The call says so, for example “No call: gauge silent 25 min”, and only the clauses that need it stop. It never shows an old reading.").
- **Never on the page:** invented customers, quotes, logos, usage counts or grades.

### Landing imagery and credits

Real photographs of the subject's world carry the page: seven pictures from Wikimedia Commons, downloaded on 12 November 2026, resized and re-encoded as JPEG with no other change, in `apps/web/public/landing/`. Provenance lives in [provenance.json](/apps/web/public/landing/provenance.json) beside them and in `features/landing/photos.ts`; `test/landing/photos.test.ts` fails when the two differ or a picture is uncredited. Interface fragments built in real markup (`data-ui`) with replay or live data carry the rest; there are no model-drawn illustrations, stock people, avatars or logo wall.

| Picture                                                         | Creator         | Date          | Licence      | Use                                   |
| --------------------------------------------------------------- | --------------- | ------------- | ------------ | ------------------------------------- |
| [Bukit Jalil LRT Station outview (230527) 01][lrt-day]          | \*angys\*       | 2023-05-27    | CC BY-SA 4.0 | Hero room, first photograph           |
| [Bukit Jalil National Stadium (220713)][clouds]                 | \*angys\*       | 2022-07-13    | CC BY-SA 4.0 | Hero room, second photograph          |
| [Bukit Jalil National Stadium at night][night]                  | Pak Misai       | 2021-08-17    | CC BY-SA 4.0 | Hero room, third photograph           |
| [Kuala Lumpur skyline thunderstorm 03][storm]                   | Pradana Aumars  | 2016-07-17    | CC BY-SA 4.0 | The record: "The ledger entry"        |
| [Bukit Jalil LRT Panorama][platform]                            | Pixdoet         | 2025-07-31    | CC BY 4.0    | The record: "The notice"              |
| [Persiaran Jalil Utama, Bukit Jalil 20231118 112053][persiaran] | Wiki Farazi     | 2023-11-18    | CC0          | The record: "The conditions calendar" |
| [Rain, Kuala Lumpur (Unsplash)][rain]                           | Eutah Mizushima | none recorded | CC0          | The record: "The grade"               |

- **Masks.** The hero room is one capsule (`border-radius: 9999px`, 160% of its column, cropped by the viewport); the record's picture is a capsule that bleeds off the right edge (`9999px 0 0 9999px`). Each crop is `object-fit: cover`; the pictures are resized and re-encoded and otherwise unaltered, so a mask only crops (CC BY-SA binds share-alike on altered versions).
- **Alt text.** The hero room is one image with the label "Bukit Jalil under its sky: the LRT station by day, the National Stadium under cloud and at night"; its photographs are decorative (`alt=""`); the four record pictures carry the alt text recorded in the provenance file.
- **Credits** print in the landing footer under "Pictures, from Wikimedia Commons": "“{title}” by {creator}, {licence}", the title linking to its Commons page and the licence to its licence text. The hero's storm-free set (clear sky, cloud, night) means the crossfade never shows a storm; the storm picture appears only in the record, beside a replay. No honest clip of rain at Bukit Jalil exists in the open collections, so the moving picture is the slow crossfade.

[lrt-day]: https://commons.wikimedia.org/wiki/File:Bukit_Jalil_LRT_Station_outview_(230527)_01.jpg
[clouds]: https://commons.wikimedia.org/wiki/File:Bukit_Jalil_National_Stadium_(220713).jpg
[night]: https://commons.wikimedia.org/wiki/File:Bukit_Jalil_National_Stadium_at_night.jpg
[storm]: https://commons.wikimedia.org/wiki/File:Kuala_Lumpur_skyline_thunderstorm_03.jpg
[platform]: https://commons.wikimedia.org/wiki/File:Bukit_Jalil_LRT_Panorama.jpg
[persiaran]: https://commons.wikimedia.org/wiki/File:Persiaran_Jalil_Utama,_Bukit_Jalil_20231118_112053.jpg
[rain]: https://commons.wikimedia.org/wiki/File:Rain,_Kuala_Lumpur_(Unsplash).jpg

### Landing motion

- **Script budget.** The landing ships at most 150 KB of compressed JavaScript before first interaction ([NFR-9](/docs/PRD.md#non-functional-requirements)); `budgets.spec.ts` counts every script fetched until the network is idle and prints the total on each run. The framework's own chunks take most of it, so the hero intro and every first-screen reveal are CSS keyframes on `transform` and `opacity` (word reveal 800ms with a 60ms stagger, the lead, actions and panel rising 700ms, the room 1200ms, the capsule 700ms), under `prefers-reduced-motion: no-preference` and `html:not([data-motion='reduce'])`.
- **After the first event.** GSAP, ScrollTrigger and Lenis load together by dynamic `import()` only after the first `wheel`, `touchstart`, `pointerdown` or `keydown`, then wait for an idle callback; nothing loads on load or on idle, and nothing loads under reduced motion. No SplitText, no Draggable and never `lenis.css`. After that GSAP is the animation system and Lenis the one smooth-scroll engine (`lerp 0.12`, anchors on), destroyed on cleanup. Entrances run once for elements below the fold (words rise, parts rise 28px with an 80ms stagger, slots scale in, `expo.out`); the hero's capsule drifts and the record's photographs settle as the page scrolls. Nothing pins, scroll never blocks, only `transform` and `opacity` animate, and `clearProps` hands elements back to the stylesheet. No Three.js: nothing here needs spatial depth.
- **The signature move** is the slow crossfade of the hero photographs: three pictures over a 21-second loop (about 5.4 seconds held, 1.6 seconds fading), the first always underneath. It runs longer than five seconds, so a visible **"Pause the photographs"** control (a 44px capsule on a solid ground fill, CSS only) stops it; it also pauses when the tab is hidden.
- **Content is visible by default.** Nothing starts hidden except what script is about to animate, so the accessibility crawl sees the full page while a reveal is in progress. Under reduced motion (OS or account) the keyframes and the loader are skipped, smooth scroll and scrubbed motion are bypassed, final states render at once, and only the first photograph shows.

## Web components and brand assets

What the brand draws outside the app's pages. The shared drawing code is `packages/elements` (glyphs, favicons, the strip engine, attribution); [PRD WEB](/docs/PRD.md#web-components-web) lists the requirements and [TRD web components](/docs/TRD.md#web-components) the contract.

### Mark and wordmark

- **Mark, one window on its day:** a 15×2.5 bar (the strip) with a 9.5×5.5 capsule above it, late in the day, on a 16px grid, in flat ink. It is navy `#1a2039` on light browser chrome and pink `#f9a3c0` on dark (`prefers-color-scheme` inside the SVG), and it is the shell bar's mark in the current ink.
- **Wordmark:** "Skyclause" in Roundo Medium 500 at 16px with −0.025em tracking, outlined to one path so the file renders without the font (`wordmarkSvg`, `public/brand/wordmark.svg`); never in caps. In the shell and public header it is the mark beside the name as text.
- **Capsule wordmark:** the name as nine capsules, one per letter, ground-coloured letters on ink fills with a 2px ink edge, filling the width of its parent (public footer); the landing footer draws the same idea at large size with block heights of 62–100%.

### Favicons

- **Static set** ([WEB-1](/docs/PRD.md#web-components-web)): `icon.svg` with a `prefers-color-scheme` style, a 32×32 `favicon.ico`, a 180×180 apple-touch icon, manifest icons at 192 and 512 and a 512 maskable icon whose 288px mark sits inside the 409px safe zone; raster icons are the pink mark on a navy square (`#1a2039`, also the manifest's theme and background colour), generated by `scripts/generate-brand-assets.ts`.
- **App tab** ([WEB-2](/docs/PRD.md#web-components-web)): the mark with an ink capsule above it holding the count of bundles needing review (1–9, then "9+"), swapped between pre-rendered SVGs in `public/brand/` and never animated; with none the plain mark returns.
- **Project favicon** ([WEB-3](/docs/PRD.md#web-components-web)): `/p/{org}/{project}/favicon.svg` draws the mark's capsule in the highest approved mode in force with that mode's glyph inside (Normal becomes ink, since a tab bar is not our ground); No call is a dashed edge; a failing required input draws the cross glyph. It is cached for 60 seconds with an ETag.

### Open Graph card

`/p/{org}/{project}/og.png`, `/p/{org}/{project}/windows/{id}/og.png` and `/c/{callId}/og.png`, 1200×630 in Dusk, Roundo throughout ([WEB-4](/docs/PRD.md#web-components-web)). Top-left the mark and "Skyclause · {project}"; the one large element is the mode as a 136×80 capsule with its glyph and the mode word at 92px (smaller for long words), or "No approved call yet"; under it the window at 40px and "Approved {time}" or the No call line at 32px; the bottom 220px hold the derived 60-minute strip or the time range, and the bottom-right corner carries the capture time. The card follows `Accept-Language` for English or Bahasa Melayu; a call card is immutable once the call is sent and exists only for real calls. Window cards are untitled.

### oEmbed card

`/oembed` answers `format=json` only, for project and call URLs on the marketing origin, with `type: "rich"`, `provider_name: "Skyclause"`, a default 480×200 frame scaled down by `maxwidth` and `maxheight`, the project's Open Graph image as its thumbnail, and an `html` iframe on the embed origin ([WEB-5](/docs/PRD.md#web-components-web)).

### Email notice and ICS entry

Notices are plain, real documents, not themed: a single table with inline styles (Arial 16/24, `#1a1a1a` on white, links `#0b57d0`) plus a text part, filled from a real approved call; with no sent call a preview is labelled and fills only the measured replay values and says n=0 for the rest ([NTC-7](/docs/PRD.md#notices-and-channels-ntc)). The approved wording fills the Why and What-it-means lines; every other line is template, with the teaching-mode line after the approval line on Hybrid recommended and, for Crowd notices, a reply line. The ICS entry is public, so it names the window by its MYT span, never its title, and gives input ages, never values (D32 in [#79](https://github.com/m1kulabs/Skyclause/issues/79)). The P0 pilot's notices are plain text from the Gemini Enterprise workflows: the permalink is the public calendar event URL and the last line is `Reply "unsubscribe" to stop these notices.` in place of the one-click link (see `pilot/workflows/`).

```text
Subject: {Mode}: {window}, {Ddd D Mmm} ({project})

{Mode} for {window}, {Dddd D Mmmm YYYY}.

{approved wording: Why: {clause}. {Input} {station} logged {value} {unit} {comparison}, {class}. {Input} {age} old when drafted.}
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
DTSTAMP:{UTC}
DTSTART;TZID=Asia/Kuala_Lumpur:{window start}
DTEND;TZID=Asia/Kuala_Lumpur:{window end}
SUMMARY:{Mode} · {window span}
DESCRIPTION:{clause} ({input} {age}).\nApproved {HH:MM} MYT.\nSkyclause is not a safety or emergency service. In an emergency, call 999.\nNot affiliated with APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL or the stadium.\nSources: {source} ({licence}); ….\nDetails: https://skyclause.m1ku.tech/c/{callId}
URL:https://skyclause.m1ku.tech/c/{callId}
STATUS:CONFIRMED
END:VEVENT
```

The feed (`/p/{org}/{project}/calendar.ics`) is `PUBLISH` with `PRODID:-//Skyclause//Conditions calendar//EN`, `X-WR-CALNAME`, a 15-minute refresh interval and one `Asia/Kuala_Lumpur` zone; events sort by start; a call entry keeps its first sent call ID in the `UID` and raises `SEQUENCE` on each change; surge-night entries use `night-{id}@skyclause.m1ku.tech`; a cancelled window is `STATUS:CANCELLED`; and a zero-length commute wave has no `DTEND`, since RFC 5545 requires `DTEND` to be later than `DTSTART`. The feed is English only and sends an `ETag`.

## Voice and content

- **Words of the trade,** from the [glossary](/docs/PRODUCT.md#glossary): window, call, bundle, clause, crossing, shadow verdict, No call, notice, approver rota, ledger, grade, replay, arrival period, exit period, listed show, mode, run, reading, indicator, source. Never "alert" for a notice, "rule" for a clause, "event" for a window or "forecast" for a call.
- **Plain, dated, exact.** Every figure carries its unit and its age ("12.5 mm in 60 min, read 4 min ago"); every time is MYT and sits in `<time datetime>` or is followed by "MYT". Sentence case for every heading, button and label (it overrides the Web Interface Guidelines' Title Case, as [NFR-8](/docs/PRD.md#non-functional-requirements) records). Terse, second person, active voice, British spelling, numerals, specific button labels ("Approve 2 calls", "Request evidence"). Every error says what failed, when the data was last good and what to do.
- **Never invent proof.** No customers, quotes, logos, usage counts or grades that the product has not produced. Every number on the landing links to its source or query; a grade appears only with n and a Wilson 95% interval, and before any live grade the page reads "No live grades yet (n=0)".
- **Call wording:** "{Mode} for {window}, {day date}. Why: {clause}, {input} {value} {unit} {comparison} ({class}), {age} old."
- **Input ages:** "{input} {n} min old" ("gauge 12 min old"); "{n} h old" over 90 minutes; daily files "data to 3 Nov".
- **No call** names the failing inputs and since when: "No call: {inputs} failing since {time}". The landing's form is "No call for {clause}: {input} {station} silent since {time}" ([LND-2](/docs/PRD.md#landing-page-lnd)).
- **Hybrid recommended line,** on every such call: "Teaching mode is the lecturer's and the university's decision. Skyclause never excuses attendance."
- **Not-a-safety-service line,** on every notice, public page and embed: "Skyclause is not a safety or emergency service. In an emergency, call 999." The non-affiliation line follows it: "Not affiliated with APU, KPT, JPS, MET, DOE, Prasarana/Rapid KL or the stadium." Both come from the brand catalogue ([NTC-3](/docs/PRD.md#notices-and-channels-ntc), [PUB-4](/docs/PRD.md#public-pages-pub)).
- **Malay verbatim with an English gloss,** marked `lang="ms"`: "Amaran Ribut Petir" (Thunderstorms Warning); "menyeluruh" (widespread); "di kebanyakan tempat" (in most places); "Lebat" (heavy, 31–60 mm in an hour); "jerebu" (haze). A model-written Malay notice goes out only after a Malay-reading approver.
- **Dates and times:** "Monday 2 November 2026", "15:30 MYT"; ISO dates in compared table rows; `Intl.DateTimeFormat` with `Asia/Kuala_Lumpur`; no time without its zone on public pages ([LOC-6](/docs/PRD.md#localisation-loc)).
- **Typography of copy:** `…` never `...`, curly quotes, non-breaking spaces in "10 min" and "LRT Bukit Jalil", the ⌘ glyph for the palette key. The catalogue test fails a string with three dots and a loading string that does not end in "…".
- **Copy lives in the catalogues,** `packages/i18n/catalogue/{en,ms}/<feature>.json`, in every supported locale; lint rejects literal JSX text; layouts hold strings 30% longer, and the pseudo-locale pass renders every route with expanded text to prove it.

## Accessibility

[PRD NFR-4 to NFR-7](/docs/PRD.md#non-functional-requirements) set the targets: WCAG 2.2 AA, keyboard and focus, forms and motion. These are the rules that meet them here, and the checks that fail a build when one slips.

- **Contrast:** the pairs in [Contrast rules](#contrast-rules), measured in every theme by `test/tokens/contrast.test.ts`.
- **Colour independence:** every mode, state and grade carries its word and its glyph in every theme; selected and current states add a capsule mark and `aria-current` or `aria-selected`; charts label series directly.
- **Focus:** a 2px ink outline with a 2px offset (3px in high contrast, `Highlight` under forced colours) on every focusable element, drawn by one global `:focus-visible` rule; the sticky bar never hides it; dialogs trap and return focus.
- **Targets:** at least 24×24 CSS px everywhere; app controls 36px; buttons, select triggers, tabs and toggles 44px on coarse pointers; phone sheet rows 48px.
- **Forms:** every field has a label, a meaningful `name`, `autocomplete` and the right `type` and `inputmode`; spellcheck is off for emails, codes, slugs and station IDs; paste is never blocked; errors sit next to the field.
- **Structure:** one `h1` per screen, ordered headings, a skip link first, real tables with a table view for every chart, `lang="ms"` on Malay quotes, `translate="no"` on brand names, station IDs and commands.
- **Live regions:** a new bundle, an escalation and a source error are announced once, politely, never per reading.
- **No drag only:** the hero's window picker is a real form (date, start, end) with the draggable capsule as an enhancement; the rota and clause grid have button and field paths.
- **Motion:** `prefers-reduced-motion` and the account setting both remove all motion; a moving picture that runs longer than five seconds has a visible pause control.
- **Checks that enforce it.** The quality crawl in `apps/web/e2e/quality/` visits every built route, per role, in Dusk, Day and high contrast at the project's size, at 375px and at 320px (200% zoom), and under reduced motion from the OS and from the account. Per page it runs axe (zero serious or critical findings) and fails on: `focus-visible`, `form-fields`, `headings`, `input-type`, `paste`, `reachability`, `reduced-motion`, `reflow`, `skip-link`, `spellcheck`, `tabular-nums`, `target-size` and `virtualised` (a list over 50 rows). Every visit also fails a visible `HH:MM` that is neither inside `<time datetime>` nor followed by "MYT". `pseudo.spec.ts` renders every route with pseudo-locale text and fails text that a clipping parent cuts off; `static.spec.ts` fails CSS that animates anything but `transform` and `opacity`; `budgets.spec.ts` holds the landing to 150 KB of compressed script before first interaction and the embed script to 30 KB; `planted.spec.ts` proves the checks fire on planted failures and that no test route ships. `known-gaps.ts` lists findings an open issue owns; a listed gap that stops occurring fails the crawl until its entry is deleted.

## What is not built

Nothing links to these; the shell, palette and settings frame list only built pages. Each keeps its design contract in the PRD, and each says so on screen with `NotBuilt` or a named `SourceError` where a screen touches it.

- **Public pages:** `/p/{org}/{project}`, its ledger, `/c/{callId}`, `/status`, a Malay landing (`/ms`) and the embed frames. The Open Graph, favicon and calendar routes and the legal pages are built.
- **Custom elements and embeds:** `<skyclause-status>` and `<skyclause-window>`, the embed script (`/elements/v1.js`), and the subscribe-to-calendar button. The oEmbed route already points at the embed origin.
- **Product pages:** the clause sheet editor, an approvals queue across projects (`/{org}/approvals`), a developers index and playground, and the docs site. Review opens the dashboard's needs-review block, and each project's bundles open as the triage inbox.
- **Settings panels:** account and organisation AI keys and API keys, organisation webhooks, and the project's public page and share links. No settings navigation lists them ([sections.ts](/apps/web/features/settings/sections.ts)); reached by URL, each says it is not available yet ("Webhooks are not available yet."). A guest entry ("Continue as guest") is not offered on the sign-in page while `/guest` is unbuilt.
- **The public verdict read:** the API registers `evaluatePublicProject` without a handler, so on 13 November 2026 the landing's hero answers with the labelled 2 November replay and says that live verdicts for a chosen window are not open yet, until the handler ships.
- **The CLI** and its output, below.
- **Things the design leaves out on purpose:** a sidebar, a collapse setting, a project tab row, a bottom bar, KPI cards with icons or sparklines, "welcome back" copy, icons in tinted squares, emoji, gradients, glass, 1px outlines on surfaces, a hue on a button or navigation item, invented numbers, a logo wall, Three.js, and any fallback, cached copy or sample value where a read fails.

### CLI output

The `skyclause` CLI is not built (`packages/cli` is an empty stub), so there is no output to show. This is the contract it is built to, kept here because [PRD CLI](/docs/PRD.md#cli-cli) and [TRD](/docs/TRD.md#cli) point at it: the same facts as the app in the same words; a header naming the station, source and time zone once; units in column headers; right-aligned figures; a dash for missing; mode and state words always printed, colour only as repetition and none under `NO_COLOR` or when not a TTY; a capture line at the foot; `--json` prints the same fields with ISO times and ages in seconds. The block below is the shape of `signals tail`, from the real [JPS 5-minute series][jps-series] for 2 November 2026 captured at 21:12 MYT on 5 November ([stored][jps-capture]); the 60-minute column is our arithmetic.

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

[jps-series]: https://infobanjirjpskl.water.gov.my/Rainfall/GetRainfallGraph/75
[jps-capture]: /docs/sources/infobanjirjpskl.water.gov.my/rainfall-graph-75.md

## See also

- [PRD](/docs/PRD.md): routes, roles and the requirements each screen meets.
- [PRODUCT glossary](/docs/PRODUCT.md#glossary) and [pricing](/docs/PRODUCT.md#packaging-and-pricing).
- [TRD web components](/docs/TRD.md#web-components): the contract for favicons, cards and embeds.
- [Data sources](/docs/research/data-sources.md): the feeds behind the captured readings.
- [Markdown style guide](/docs/references/markdown-style.md).

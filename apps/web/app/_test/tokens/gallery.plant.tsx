// The token gallery: every token, type step, primitive state and shared product component, for the test build only
// (the page 404s outside APP_ENV=test). Specimens are enum values and fixed instants, never product data.
import type { CSSProperties, ReactNode } from 'react'
import type { Bundle, CallView, Grade, InputValue, PackState, Source } from '@skyclause/contracts'
import { Mode } from '@skyclause/contracts'
import { brandStates, type BrandState, type StripInput, type StripWindow } from '@skyclause/elements'
import { Alert, AlertDescription, AlertTitle } from '#ui/alert'
import { Badge } from '#ui/badge'
import { Button } from '#ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '#ui/card'
import { Checkbox } from '#ui/checkbox'
import { Combobox, ComboboxChip, ComboboxChips, ComboboxChipsInput } from '#ui/combobox'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '#ui/empty'
import { Field, FieldDescription, FieldError, FieldLabel } from '#ui/field'
import { Input } from '#ui/input'
import { Kbd } from '#ui/kbd'
import { Label } from '#ui/label'
import { Progress } from '#ui/progress'
import { Skeleton } from '#ui/skeleton'
import { Switch } from '#ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableMeasure, TableRow } from '#ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '#ui/tabs'
import { Textarea } from '#ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '#ui/toggle-group'
import { ModeBadge, StatusMark } from '../../../features/brand'
import {
  BundleCard,
  CallRow,
  DayStrip,
  EmptyDay,
  GradeCard,
  InputAgeChip,
  NoCallState,
  NotBuilt,
  PackStateNote,
  SourceError,
  SourceHealthRow,
  WindowStrip
} from '../../../features/data-components'

const roles = [
  'ground',
  'surface',
  'raised',
  'overlay',
  'ink',
  'ink-muted',
  'control',
  'control-edge',
  'field',
  'focus'
]
const aliases = [
  'background',
  'foreground',
  'card',
  'popover',
  'primary',
  'primary-foreground',
  'secondary',
  'muted',
  'muted-foreground',
  'accent',
  'border',
  'input',
  'ring',
  'rule',
  'chart-emphasis',
  'chart-ink',
  'grid'
]
const tones = [
  'normal',
  'outdoor-limited',
  'commute-disruption',
  'hybrid-recommended',
  'surge-night',
  'watch',
  'no-call',
  'draft',
  'expired',
  'rejected'
]
const typeSteps = [
  ['type-title', 'Windows today at Bukit Jalil'],
  ['type-section', 'Bundles needing review'],
  ['type-figure', '12.5 mm in 60 min'],
  ['type-card-title', 'Sky: Commute disruption'],
  ['type-text', 'Running text is 16px in the full ink; the call for this window was approved at 15:02 MYT.'],
  ['type-body', 'Controls and tables are 14px: Approve, Edit, Reject.'],
  ['type-small', 'Meta is 13px: read 4 min ago, JPS station 75.'],
  ['type-code', 'skyclause calls list --project bukit-jalil']
] as const
const pageSteps = [
  ['type-display', 'The call for every window'],
  ['type-head', 'From gauge to notice'],
  ['type-lead', 'One approved, graded call for each window.'],
  ['type-page-body', 'Public pages set body text at 17 to 19px.'],
  ['type-page-small', 'Not affiliated with APU, KPT, JPS, MET, DOE or Prasarana.']
] as const

// Enum specimens at fixed instants (12 November 2026, MYT afternoon), so every screenshot is the same.
const from = '2026-11-12T00:00:00Z'
const to = '2026-11-12T14:00:00Z'
const now = '2026-11-12T07:40:00Z'
const windows: StripWindow[] = [
  { id: 'w1', from: '2026-11-12T00:30:00Z', to: '2026-11-12T02:00:00Z', state: 'normal', title: 'Lecture block A' },
  { id: 'w2', from: '2026-11-12T03:00:00Z', to: '2026-11-12T03:30:00Z', state: 'outdoor_limited', title: 'Field lab' },
  {
    id: 'w3',
    from: '2026-11-12T05:00:00Z',
    to: '2026-11-12T07:00:00Z',
    state: 'commute_disruption',
    title: 'Release wave'
  },
  { id: 'w4', from: '2026-11-12T07:30:00Z', to: '2026-11-12T09:00:00Z', state: 'hybrid_recommended', title: 'Seminar' },
  { id: 'w5', from: '2026-11-12T09:30:00Z', to: '2026-11-12T10:00:00Z', state: 'no_call', title: 'Club meeting' },
  { id: 'w6', from: '2026-11-12T10:30:00Z', to: '2026-11-12T12:30:00Z', state: 'surge_night', title: 'Stadium exit' },
  {
    id: 'w7',
    from: '2026-11-12T13:00:00Z',
    to: '2026-11-12T13:45:00Z',
    state: 'storm_watch',
    draft: true,
    title: 'Late lab'
  }
]
// A two-hour rainfall specimen at five-minute steps (06:00-08:00Z); the 60-minute totals are summed from it.
const readingTimes = Array.from({ length: 25 }, (_, i) => new Date(Date.parse('2026-11-12T06:00:00Z') + i * 300_000))
const rainEvery5 = [0, 0, 0, 0.5, 1, 2.5, 5, 9, 9.5, 8, 6.5, 5, 4.5, 6, 7.5, 9, 8.5, 7, 5.5, 4, 3, 2, 1, 0.5, 0]
const strip: StripInput = {
  from: readingTimes[0]!.toISOString(),
  to: readingTimes.at(-1)!.toISOString(),
  now: '2026-11-12T07:40:00Z',
  windows: [windows[3]!],
  rain5: readingTimes.map((at, i) => ({ at: at.toISOString(), value: rainEvery5[i]!, state: 'received' })),
  rain60: readingTimes.map((at, i) => ({
    at: at.toISOString(),
    value: Math.round(rainEvery5.slice(Math.max(0, i - 11), i + 1).reduce((sum, value) => sum + value, 0))
  }))
}
const source: Source = {
  id: 's1',
  kind: 'jps_rain',
  external_id: '0232901RF',
  owner_org_id: null,
  name: 'Sg. Kuyoh',
  lat: null,
  lon: null,
  url: 'https://infobanjirjpskl.water.gov.my/',
  cadence_s: 300,
  stale_after_s: 600,
  licence_id: 'none',
  licence_label: 'no published terms'
}
const input: InputValue = {
  name: 'gauge',
  value: 39,
  unit: 'mm',
  source_ids: ['0232901RF'],
  source_url: null,
  reading_ids: ['r1'],
  observed_at: '2026-11-12T07:36:00Z',
  state: 'fresh',
  since: '2026-11-12T07:36:00Z',
  age_s: 240
}
const bundle: Bundle = {
  id: 'b1',
  project_id: 'p1',
  run_id: 'r1',
  pack: 'sky',
  state: 'drafted',
  superseded_by: null,
  review_hash: 'h',
  sla_due_at: '2026-11-12T08:00:00Z',
  needs_review_at: null,
  approved_by: null,
  escalation_level: 0,
  draft_only: false,
  calls: []
}
const call = {
  id: 'c1',
  bundle_id: 'b1',
  window_id: 'w3',
  night_id: null,
  mode: 'commute_disruption',
  watch: false,
  no_call: null,
  fired: [{ clause: 'storm_confirmed', inputs: ['gauge 39.0 mm'] }],
  recommendations: [],
  recipients: [],
  notices: [],
  reason: 'storm',
  state: 'drafted',
  shadow: {
    scope: { kind: 'site', id: null },
    pack: 'sky',
    mode: 'commute_disruption',
    watch: false,
    no_call: null,
    recommendations: [],
    clauses: [],
    open_from: null
  },
  chosen: 'engine',
  agrees: true,
  decision: null,
  expires_at: '2026-11-12T09:30:00Z',
  triggered_at: '2026-11-12T07:05:00Z',
  drafted_at: '2026-11-12T07:06:00Z',
  approved_at: null,
  sent_at: null,
  superseded_by_call_id: null,
  ics_uid: 'call-c1@skyclause.m1ku.tech'
} as unknown as CallView
const grade: Grade = {
  id: 'g1',
  call_id: null,
  night_id: null,
  outcome: 'agree',
  sheet_version_id: 'v1',
  pack: 'sky',
  window_id: null,
  proposed_mode: null,
  observed_mode: null,
  mode_diff: 0,
  no_call: false,
  agrees: true,
  stale_inputs: false
}
const pack: PackState = {
  pack: 'sky',
  basis: 'engine_verdict',
  call_id: null,
  mode: 'commute_disruption',
  watch: false,
  no_call: null
}

// A call record and a source record at fixed instants: enum specimens, never product data.
const callRecord: {
  id: string
  window: string
  time: string
  mode: Parameters<typeof ModeBadge>[0]['mode']
  sent: number | null
  selected?: boolean
  dimmed?: boolean
}[] = [
  { id: 'c1', window: 'Lecture block A, Bukit Jalil', time: '08:15', mode: 'normal', sent: 3 },
  { id: 'c2', window: 'Field lab, outdoor session', time: '10:05', mode: 'outdoor_limited', sent: 6 },
  {
    id: 'c3',
    window: 'Release wave at the stadium gate, with the long name of the event that must truncate',
    time: '12:50',
    mode: 'commute_disruption',
    sent: 11,
    selected: true
  },
  { id: 'c4', window: 'Seminar', time: '15:30', mode: 'hybrid_recommended', sent: 4 },
  { id: 'c5', window: 'Club meeting', time: '17:00', mode: 'no_call', sent: null, dimmed: true },
  { id: 'c6', window: 'Stadium exit', time: '20:30', mode: 'surge_night', sent: 9 }
]
const sourceRecord = [
  { name: 'Sg. Kuyoh', state: 'fresh', rain: '0.5', read: '07:36' },
  { name: 'JPS station 75', state: 'stale', rain: '39.0', read: '07:11' },
  { name: 'MET Malaysia warnings', state: 'error', rain: '12.5', read: '06:55' }
] as const

// The static look of a state the browser shows only on interaction (hover, press, focus), for the screenshot.
const focusRing = 'outline-(length:--focus-width) outline-offset-2 outline-(--focus) outline-solid'
const states = [
  ['Rest', ''],
  ['Hover', 'hover'],
  ['Focus', 'focus'],
  ['Active', 'active'],
  ['Disabled', 'disabled'],
  ['Invalid', 'invalid']
] as const
const buttonVariants = ['default', 'outline', 'secondary', 'ghost', 'destructive', 'link'] as const

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="type-section">
        {title}
      </h2>
      {children}
    </section>
  )
}

function Swatch({ name }: { name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        aria-hidden="true"
        className="h-10 w-16 flex-none rounded-md border-2 border-input"
        style={{ background: `var(--${name})` } as CSSProperties}
      />
      <code className="type-code min-w-0 break-all">{`--${name}`}</code>
    </div>
  )
}

function stateClass(variant: (typeof buttonVariants)[number], state: string) {
  if (state === 'hover') return variant === 'default' ? 'opacity-90' : variant === 'link' ? 'underline' : 'bg-accent'
  if (state === 'focus') return focusRing
  if (state === 'active') return 'translate-y-px'
  return ''
}

export function Gallery() {
  const modes = [...Mode.options, 'storm_watch', 'no_call'] as const
  const inputStates = ['fresh', 'stale', 'error', 'recovered', 'pending', 'probation', 'off_hours'] as const
  return (
    <div className="flex flex-col gap-12">
      <Section id="roles" title="Colour roles">
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3">
          {roles.map((name) => (
            <Swatch key={name} name={name} />
          ))}
        </div>
        <h3 className="type-card-title">Aliases the features read</h3>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,220px),1fr))] gap-3">
          {aliases.map((name) => (
            <Swatch key={name} name={name} />
          ))}
        </div>
      </Section>

      <Section id="tones" title="Mode tones">
        <p className="type-text max-w-[65ch]">
          Every mode prints its word and its glyph inside a capsule of its tone; the non-mode states carry no hue.
        </p>
        <div className="flex flex-wrap gap-2">
          {tones.map((tone) => (
            <span
              key={tone}
              data-tone={tone}
              className="inline-flex min-h-8 items-center rounded-full px-3 type-small font-medium tone-fill"
            >
              {tone}
            </span>
          ))}
        </div>
        <h3 className="type-card-title">Mode badges</h3>
        <div className="flex flex-wrap gap-2">
          {modes.map((mode) => (
            <ModeBadge key={mode} mode={mode} />
          ))}
          <ModeBadge mode="surge_night" pack="crowd" />
        </div>
        <h3 className="type-card-title">Status marks</h3>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(brandStates) as BrandState[]).map((state) => (
            <StatusMark key={state} state={state} />
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          {inputStates.map((state) => (
            <StatusMark key={state} state={state} variant="plain" />
          ))}
        </div>
      </Section>

      <Section id="type" title="Type">
        <div className="flex flex-col gap-3">
          {typeSteps.map(([step, sample]) => (
            <div key={step} className="grid gap-1 md:grid-cols-[180px_1fr] md:items-baseline">
              <code className="type-code text-muted-foreground">{step}</code>
              <p className={step}>{sample}</p>
            </div>
          ))}
        </div>
        <h3 className="type-card-title">Public pages</h3>
        <div className="flex flex-col gap-3 overflow-hidden">
          {pageSteps.map(([step, sample]) => (
            <div key={step} className="grid gap-1 md:grid-cols-[180px_1fr] md:items-baseline">
              <code className="type-code text-muted-foreground">{step}</code>
              <p className={step}>{sample}</p>
            </div>
          ))}
        </div>
        <h3 className="type-card-title">Figures</h3>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Reading</TableHead>
              <TableHead numeric>Time</TableHead>
              <TableHead numeric>mm in 60 min</TableHead>
              <TableHead numeric>Share of windows</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ['Gauge 75', '11:11', '1.1', '11.1%'],
              ['Gauge 75', '08:45', '39.0', '87.5%'],
              ['Gauge 12', '15:30', '12.5', '−4.0%'],
              ['Gauge 12', '20:00', '0.0', '100.0%']
            ].map(([name, time, rain, share], index) => (
              <TableRow key={index}>
                <TableCell>{name}</TableCell>
                <TableCell numeric phone="meta" label="Time">
                  <time dateTime={`2026-11-12T${time}:00+08:00`}>{`${time} MYT`}</time>
                </TableCell>
                <TableCell numeric phone="end">
                  {rain}
                </TableCell>
                <TableCell numeric phone="meta" label="Share of windows">
                  {share}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section id="tables" title="Tables">
        <p className="type-text max-w-[65ch]">
          One table for every record: rows on a 44px pitch, a header strip in sentence case, no rules between rows. A
          name truncates with its title, a figure aligns right, a bar measures it. Below 640px each row is a two-line
          item.
        </p>
        <h3 className="type-card-title">Call record, with a selected row, a dimmed row and a measuring column</h3>
        <Table sticky>
          <TableHeader>
            <TableRow>
              <TableHead>Window</TableHead>
              <TableHead numeric>Crossed</TableHead>
              <TableHead>Call</TableHead>
              <TableHead numeric className="w-48">
                Sent after
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {callRecord.map((row) => (
              <TableRow key={row.id} selected={row.selected} dimmed={row.dimmed}>
                <TableCell truncate>{row.window}</TableCell>
                <TableCell numeric phone="meta" label="Crossed">
                  <time dateTime={`2026-11-12T${row.time}:00+08:00`}>{`${row.time} MYT`}</time>
                </TableCell>
                <TableCell phone="end">
                  <ModeBadge mode={row.mode} />
                </TableCell>
                <TableCell numeric phone="meta" label="Sent after">
                  {row.sent === null ? (
                    <span className="text-muted-foreground">Not sent</span>
                  ) : (
                    <TableMeasure value={row.sent} max={12}>
                      <span data-numeric>{`${row.sent} min`}</span>
                    </TableMeasure>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        <h3 className="type-card-title">Compact, 40px</h3>
        <Table compact>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>State</TableHead>
              <TableHead numeric>mm in 60 min</TableHead>
              <TableHead numeric>Read</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sourceRecord.map((row) => (
              <TableRow key={row.name}>
                <TableCell truncate>{row.name}</TableCell>
                <TableCell phone="end">
                  <StatusMark state={row.state} variant="plain" />
                </TableCell>
                <TableCell numeric phone="meta" label="mm in 60 min">
                  {row.rain}
                </TableCell>
                <TableCell numeric phone="meta" label="Read">
                  <time dateTime={`2026-11-12T${row.read}:00+08:00`}>{`${row.read} MYT`}</time>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section id="shape" title="Radius, capsule and spacing">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex h-24 w-40 items-end rounded-xl bg-card p-3">
            <div className="flex h-12 w-full items-center rounded-md bg-raised px-3 type-small">10px in 16px</div>
          </div>
          <div className="flex h-12 w-56 items-center rounded-full bg-raised px-4 type-small">Capsule</div>
          {['gap', 'pad', 'section', 'control', 'control-page', 'target'].map((space) => (
            <div key={space} className="flex flex-col gap-1">
              <span
                aria-hidden="true"
                className="block h-3 rounded-full bg-ink"
                style={{ width: `var(--spacing-${space})` }}
              />
              <code className="type-code">{`--spacing-${space}`}</code>
            </div>
          ))}
        </div>
      </Section>

      <Section id="buttons" title="Buttons">
        <div className="overflow-x-auto" role="group" aria-label="Button states">
          <div className="grid min-w-max grid-cols-[120px_repeat(6,auto)] items-center gap-3">
            <span />
            {states.map(([label]) => (
              <span key={label} className="type-small text-muted-foreground">
                {label}
              </span>
            ))}
            {buttonVariants.map((variant) => (
              <div key={variant} className="contents">
                <code className="type-code">{variant}</code>
                {states.map(([label, state]) => (
                  <Button
                    key={label}
                    variant={variant}
                    disabled={state === 'disabled'}
                    aria-invalid={state === 'invalid' || undefined}
                    className={stateClass(variant, state)}
                  >
                    Approve
                  </Button>
                ))}
              </div>
            ))}
          </div>
        </div>
        <h3 className="type-card-title">Public page size</h3>
        <div className="flex flex-wrap gap-3">
          <Button size="lg">Open the Commons</Button>
          <Button size="lg" variant="outline">
            Sign in
          </Button>
        </div>
      </Section>

      <Section id="fields" title="Fields">
        <div className="grid gap-6 md:grid-cols-2">
          {states.map(([label, state]) => (
            <Field key={label} data-invalid={state === 'invalid' || undefined}>
              <FieldLabel
                htmlFor={`window-title-${state || 'rest'}`}
              >{`Window title (${label.toLowerCase()})`}</FieldLabel>
              <Input
                id={`window-title-${state || 'rest'}`}
                name={`window-title-${state || 'rest'}`}
                autoComplete="off"
                defaultValue={state === 'invalid' ? '' : 'Release wave'}
                placeholder="Name the window"
                disabled={state === 'disabled'}
                aria-invalid={state === 'invalid' || undefined}
                className={state === 'focus' ? focusRing : state === 'hover' ? 'bg-raised' : ''}
              />
              {state === 'invalid' ? (
                <FieldError>Give the window a title.</FieldError>
              ) : (
                <FieldDescription>Shown to subscribers.</FieldDescription>
              )}
            </Field>
          ))}
          <Field>
            <FieldLabel htmlFor="native-pack-pick">Native select</FieldLabel>
            <select id="native-pack-pick" name="native-pack-pick" autoComplete="off" className="native-select">
              <option value="sky">Sky</option>
              <option value="crowd">Crowd</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="native-pack-off">Native select, disabled</FieldLabel>
            <select id="native-pack-off" name="native-pack-off" autoComplete="off" className="native-select" disabled>
              <option value="sky">Sky</option>
            </select>
          </Field>
          <Field>
            <FieldLabel htmlFor="labeller-search">Labellers, chips with a remove button</FieldLabel>
            <Combobox multiple defaultValue={['Amina Labeller', 'Haziq Approver']}>
              <ComboboxChips>
                <ComboboxChip>Amina Labeller</ComboboxChip>
                <ComboboxChip>Haziq Approver</ComboboxChip>
                <ComboboxChipsInput id="labeller-search" name="labeller-search" autoComplete="off" />
              </ComboboxChips>
            </Combobox>
          </Field>
          <Field>
            <FieldLabel htmlFor="window-notes">Notes for approvers</FieldLabel>
            <Textarea id="window-notes" name="window-notes" autoComplete="off" defaultValue="Exit through gate A." />
          </Field>
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-2">
              <Checkbox id="notify-subscribers" name="notify-subscribers" defaultChecked />
              <Label htmlFor="notify-subscribers">Notify subscribers</Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox id="notify-rota" name="notify-rota" />
              <Label htmlFor="notify-rota">Notify the rota</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="native-notify" name="native-notify" className="native-check" defaultChecked />
              <Label htmlFor="native-notify">Native checkbox, checked</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="native-quiet" name="native-quiet" className="native-check" />
              <Label htmlFor="native-quiet">Native checkbox</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="radio" id="native-pack-sky" name="native-pack" className="native-check" defaultChecked />
              <Label htmlFor="native-pack-sky">Native radio, selected</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="radio" id="native-pack-crowd" name="native-pack" className="native-check" />
              <Label htmlFor="native-pack-crowd">Native radio</Label>
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="native-off" name="native-off" className="native-check" disabled />
              <Label htmlFor="native-off">Native checkbox, disabled</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                role="switch"
                id="native-pack"
                name="native-pack-switch"
                className="native-switch"
                defaultChecked
              />
              <Label htmlFor="native-pack">Native switch, on</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                role="switch"
                id="native-pack-switch-off"
                name="native-pack-off-switch"
                className="native-switch"
              />
              <Label htmlFor="native-pack-switch-off">Native switch</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="send-push" name="send-push" defaultChecked />
              <Label htmlFor="send-push">Send push notices</Label>
            </div>
            <div className="flex items-center gap-2">
              <Switch id="send-email" name="send-email" />
              <Label htmlFor="send-email">Send email notices</Label>
            </div>
          </div>
        </div>
      </Section>

      <Section id="segments" title="Tabs and segmented controls">
        <Tabs defaultValue="today">
          <TabsList aria-label="Range">
            <TabsTrigger value="today">Today</TabsTrigger>
            <TabsTrigger value="week">This week</TabsTrigger>
            <TabsTrigger value="month">This month</TabsTrigger>
          </TabsList>
          <TabsContent value="today" className="type-small text-muted-foreground">
            Windows from 08:00 MYT.
          </TabsContent>
        </Tabs>
        <ToggleGroup aria-label="Pack" defaultValue={['sky']}>
          <ToggleGroupItem value="sky">Sky</ToggleGroupItem>
          <ToggleGroupItem value="crowd">Crowd</ToggleGroupItem>
        </ToggleGroup>
      </Section>

      <Section id="surfaces" title="Surfaces and floating panels">
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Panel on the surface step</CardTitle>
              <CardDescription>No border, no shadow at rest.</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="rounded-md bg-raised p-3 type-small">Nested on the raised step, 10px.</div>
            </CardContent>
          </Card>
          <Alert>
            <AlertTitle>JPS station 75 is stale</AlertTitle>
            <AlertDescription>Last reading 14:52 MYT.</AlertDescription>
          </Alert>
          <div className="rounded-xl bg-popover p-2 shadow-lg" role="group" aria-label="Menu, as it floats">
            {['Approve', 'Edit wording', 'Reject'].map((item, index) => (
              <div
                key={item}
                className={`flex min-h-9 items-center rounded-md px-3 type-body ${index === 1 ? 'bg-accent text-accent-foreground' : ''}`}
              >
                {item}
              </div>
            ))}
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <Empty>
            <EmptyHeader>
              <EmptyTitle>No subscribers yet</EmptyTitle>
              <EmptyDescription>Add a channel to start sending notices.</EmptyDescription>
            </EmptyHeader>
          </Empty>
          <div className="flex flex-col gap-3" aria-label="Loading" role="group">
            <Skeleton className="h-6 w-40 rounded-full" />
            <Skeleton className="h-10 w-full rounded-full" />
            <Skeleton className="h-4 w-56" />
          </div>
          <div className="flex flex-col gap-3">
            <Progress value={67} aria-label="Setup" />
            <div className="flex flex-wrap items-center gap-2">
              <Badge>Approved</Badge>
              <Badge variant="secondary">Drafted</Badge>
              <Badge variant="outline">Replay</Badge>
              <Kbd>⌘K</Kbd>
            </div>
          </div>
        </div>
      </Section>

      <Section id="product" title="Shared product components">
        <h3 className="type-card-title">Day strip</h3>
        <DayStrip
          from={from}
          to={to}
          now={now}
          windows={windows}
          hrefs={Object.fromEntries(windows.map((w) => [w.id, `#window-${w.id}`]))}
        />
        <h3 className="type-card-title">Empty day</h3>
        <EmptyDay from={from} to={to} now={now} action={<Button variant="outline">Declare a window</Button>} />
        <EmptyDay from={from} to={to} now={now} caption="No windows declared yet." />
        <h3 className="type-card-title">Readings around a window</h3>
        <p className="type-small text-muted-foreground">
          Labels are 13px HTML at every width and the axis thins as the column narrows: the column below is 22rem, a
          bundle's call block or a phone.
        </p>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_22rem]">
          <Card>
            <CardContent>
              <WindowStrip windows={[]} strip={strip} />
            </CardContent>
          </Card>
          <Card>
            <CardContent>
              <WindowStrip windows={[]} strip={strip} list={false} />
            </CardContent>
          </Card>
        </div>
        <h3 className="type-card-title">No call and source errors</h3>
        <NoCallState inputs={['JPS station 75']} since="2026-11-12T06:55:00Z" />
        <div className="grid gap-4 md:grid-cols-2">
          <SourceError source="the windows list" status={501} />
          <NotBuilt thing="The key panel" />
          <SourceError
            source="JPS station 75"
            status={503}
            at="2026-11-12T07:31:00Z"
            retry={<Button variant="outline">Try again</Button>}
          />
        </div>
        <h3 className="type-card-title">Cards and rows</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <BundleCard bundle={bundle} triggeredAt="2026-11-12T07:05:00Z" now={now} projectName="Bukit Jalil" />
          <GradeCard
            grade={grade}
            metric={{ metric: 'precision', x: 0.88, n: 8, low: 0.53, high: 0.98 }}
            period={{ from: '2026-10-01', to: '2026-11-11' }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <InputAgeChip input={input} ageSeconds={240} />
          <InputAgeChip input={{ ...input, state: 'stale' }} ageSeconds={1500} />
          <PackStateNote pack={pack} />
        </div>
        <table className="w-full">
          <tbody>
            <CallRow call={call} />
            <SourceHealthRow
              source={source}
              latest={{ value: 0.5, observed_at: '2026-11-12T07:36:00Z', unit: 'mm' }}
              state={{ state: 'fresh', since: '2026-11-12T07:36:00Z', http_status: 200, pending_until: null }}
              ageS={240}
              ticks={Array.from({ length: 24 }, (_, i): 'received' | 'missed' | 'error' =>
                i === 20 ? 'error' : i % 7 === 3 ? 'missed' : 'received'
              )}
            />
          </tbody>
        </table>
      </Section>
    </div>
  )
}

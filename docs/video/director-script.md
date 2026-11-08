# Director script

The spoken lines for the 3:45 submission video, with the timing, what each segment shows, the claim guardrails and the claims ledger. `[ brackets ]` describe the picture; everything else is spoken. The shot contract in [`shots.json`](shots.json) films the app segments, and the [video README](README.md) says how the pieces fit.

Contents:

1.  [How the video works](#how-the-video-works)
1.  [Timing](#timing)
1.  [Narration](#narration)
    1.  [V1: Slate and one line](#v1-slate-and-one-line)
    1.  [V2: The problem](#v2-the-problem)
    1.  [D1: The window](#d1-the-window)
    1.  [D2: The signals](#d2-the-signals)
    1.  [D3: The crossing](#d3-the-crossing)
    1.  [D4: The call](#d4-the-call)
    1.  [D5: The record](#d5-the-record)
    1.  [D6: Evidence on request](#d6-evidence-on-request)
    1.  [V3: Impact](#v3-impact)
    1.  [V4: The research](#v4-the-research)
    1.  [V5: How we worked](#v5-how-we-worked)
    1.  [V6: Close](#v6-close)
1.  [Claim guardrails](#claim-guardrails)
1.  [Claims ledger](#claims-ledger)
1.  [Open items](#open-items)

## How the video works

- **One idea to remember: the crossing.** At 15:00 on Monday 2 November 2026 the rain gauge by LRT Bukit Jalil passed JPS's Lebat line. The 15:05 poll flipped the verdict, and a call could be on the record before 89 sessions ended at 15:30. D3 builds up to that moment, slows down on it, and every later segment points back to it.
- **One narrator, one voice.** An ElevenLabs voiceover by default; a team member's recording replaces it if time allows. The script is written for one voice, at 140 words a minute.
- **Real data only.** Every reading on screen is live or a stored capture, and every stored capture is labelled `Replay (2 Nov 2026)`. Motion graphics draw only numbers the system or its captures produced.
- **A recording, labelled as one.** The slate, a running caption and the YouTube description carry the capture date, per [labelling the recording](/docs/research/judging.md#labelling-the-recording).
- **Gemini Enterprise segments wait.** D4 needs the licence (#7, #49). Until then its slot holds a title card, and the cut runs without it. Shots marked `needs: ge` in `shots.json` are never filmed on a stand-in.

## Timing

Planned at 140 words a minute plus the picture's holds. Time a real voice render before trusting it. The demo and impact land before 3:00, per the [minute plan](/docs/research/judging.md#minute-plan).

| Segment | Time      | Budget | Picture                                                  | Needs     |
| ------- | --------- | -----: | -------------------------------------------------------- | --------- |
| V1      | 0:00–0:15 |     30 | Slate: mark, capture date, one line                      | none      |
| V2      | 0:15–0:40 |     56 | Motion: the 2 Nov rain bars against the exit wave        | none      |
| D1      | 0:40–0:52 |     26 | The window Form, then the `windows` row                  | dev pilot |
| D2      | 0:52–1:07 |     33 | The `readings` tab filling, each row with its age        | dev pilot |
| D3      | 1:07–1:37 |     64 | Motion: the window strip, 14:55 to 15:05, the verdict    | none      |
| D4      | 1:37–1:57 |     42 | Gemini Enterprise: the bundle, the shadow line, approval | ge        |
| D5      | 1:57–2:07 |     22 | The sealed `ledger` row; `verifyLedger` catches an edit  | dev pilot |
| D6      | 2:07–2:20 |     29 | An evidence request email and its pack reply             | dev pilot |
| V3      | 2:20–2:45 |     52 | Motion: the haze replay tally; grades at n=0             | none      |
| V4      | 2:45–3:10 |     50 | Slide: methods and what changed                          | none      |
| V5      | 3:10–3:30 |     42 | Slide: five people, five lanes                           | none      |
| V6      | 3:30–3:45 |     30 | End card: repo, video, live links, capture date          | none      |

The budget column is words. Written so far: 422 words, without the open lines in V4 and V5, about 3:01 of voice inside 3:45 of picture.

## Narration

### V1: Slate and one line

`[ black ground; the mark draws its window, then the crimson bar; "Recording of the live system, captured {capture date}" in soft ink ]`

This is Skyclause.
It makes one approved call for every class, event or commute window when the sky turns against it.
And it writes every call down.

### V2: The problem

`[ the 2 November rain bars rise five minutes at a time; the 15:30 exit wave is one crimson line ]`

On the seventh of October, the ministry told every university to watch its local air readings.
APU has no written rule for haze or storms, and no record of what it decided.
Then, on the second of November, 63 millimetres of rain fell on Bukit Jalil in two hours.
89 classes ended at 15:30, straight into it.
Nobody made the call. Nobody wrote it down.

### D1: The window

`[ the window Form; a club organiser's window typed in; the windows row appears ]`

It starts with a window.
A club, a class or a commuter declares one: a title, a day, a start and an end.
Opt-in, with consent. Nothing else is stored.

### D2: The signals

`[ the readings tab fills; each row's age column ticks ]`

Then Skyclause watches the public signals for it.
The JPS rain gauge every 5 minutes. MET warnings every 10. The DOE haze index every hour.
Every reading carries its age.
A silent feed is a "No call", never an old number.

### D3: The crossing

`[ Replay (2 Nov 2026). The window strip for the 15:30 wave. 14:55: the 60-minute total sits at 29.5 mm, under the Lebat line. Hold. ]`

Here is the second of November, replayed from the gauge's own record.
At 14:55, 29.5 millimetres in the last hour. The clause says Normal.

`[ the 15:00 bar lands; the total crosses the line at 39.0 mm; slow ]`

At 15:00, the hour reaches 39. That's Lebat, JPS's heavy class.

`[ 15:05: the verdict flips to Commute disruption; the fired clause, the reading and its age print under it ]`

At the 15:05 poll, the clause engine flips the verdict: Commute disruption. Storm confirmed, 5 minutes old.
25 minutes before the wave. The clause watches. A person decides.

### D4: The call

`[ Gemini Enterprise: the bundle; the agent's call beside the clause engine's shadow verdict; the approver approves ]`

The decision agent drafts the call for each window at risk, with its reasons and every input's age.
The clause engine checks it. If they disagree, that shows first.
Then one person on the rota approves, and the notice goes out.

`[ until the licence arrives, this slot is a title card: "Gemini Enterprise segment: waiting for the licence" ]`

### D5: The record

`[ the ledger row appears, sealed; an edited cell; verifyLedger names the broken row ]`

Every call lands in the ledger, sealed to the row before it.
Change one cell, and the check names the row.

### D6: Evidence on request

`[ an email: "evidence for 2 Nov 14:00–16:30"; the reply arrives with the readings and their sources ]`

Need proof for a late arrival? Email the dates.
Skyclause replies with the readings, their sources and their times.
One email, not an afternoon of screenshots.

### V3: Impact

`[ the haze replay tally builds: 9 Hybrid recommended, 5 Outdoor-limited, 7 Normal, 1 no data; then "Live grades: n=0" ]`

We replayed October's haze through the same clauses.
22 weekdays: 9 Hybrid recommended, 5 Outdoor-limited, 7 Normal, and 1 day with no data.
Every live call is graded the next morning against the gauge, and published with its count.
Today that count is zero. We'll say so until it isn't.

### V4: The research

`[ slide: the methods in three lines, and what each one changed ]`

{research findings: interviews held, the timed evidence task, and what each changed; confirm before recording}

### V5: How we worked

`[ slide: five names, five lanes, the issue tracker behind them ]`

Five of us, one tracker.
Lim Yuh Kang led and built the pilot's workflows and deployment.
Jeremy built the feeds and the clause engine.
Zi Jie built the camera, the windows and the Crowd pack.
{chaosiris's and DrxgClanPC's lanes; confirm before recording}

### V6: Close

`[ end card: the repo, the video and the live links as text; "captured {capture date}" ]`

Skyclause. The call for every window.
Signals in. One person approves. The gauge grades it.
The repo and the live links are below.

## Claim guardrails

- **Words of the trade** from the [glossary](/docs/PRODUCT.md#glossary): notice, not alert; clause, not rule; window, not event; call, not forecast.
- **Never say:** "predicts", "guarantee", "real-time warning", "AI decides", "real user", "accurate" without n, or any grade before one exists.
- **Not a safety service:** the end card carries "Skyclause is not a safety or emergency service. In an emergency, call 999."
- **Replays are labelled:** every 2 November picture carries `Replay (2 Nov 2026)`, on screen for as long as it shows.
- **Times after 15:05 are inferred:** say "could be on the record before the wave", never that a call was made on 2 November. No call was made that day.
- **No personal data:** no email addresses, names of subscribers or faces on screen. Team names appear only in V5.

## Claims ledger

| Claim                                                                         | Source                                                                                                                                  |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| KPT told every university to monitor local API readings on 7 October 2026     | [IDEA: haze and storms](/docs/IDEA.md#haze-and-storms-at-the-exit-wave)                                                                 |
| APU's knowledge base has no page for haze, jerebu, thunderstorm or lightning  | [IDEA: nobody writes the call down](/docs/IDEA.md#nobody-writes-the-call-down)                                                          |
| 63.0 mm over (14:00, 16:00] on 2 November at gauge `0232901RF`                | [Skyclause storms](/docs/ideas/02-skyclause.md#storms-the-exit-wave-meets-the-afternoon-cell), our arithmetic on the stored JPS capture |
| 89 sessions ended at 15:30 on 2 November                                      | [IDEA: haze and storms](/docs/IDEA.md#haze-and-storms-at-the-exit-wave)                                                                 |
| 29.5 mm in 60 min at 14:55; 39.0 mm at 15:00; verdict flips at the 15:05 poll | [DESIGN: landing copy deck](/docs/DESIGN.md#landing-copy-deck), from the stored JPS 5-minute series                                     |
| Lebat is 31–60 mm in an hour                                                  | [IDEA: haze and storms](/docs/IDEA.md#haze-and-storms-at-the-exit-wave)                                                                 |
| Poll cadences: gauge 5 min, MET warnings 10 min, APIMS hourly                 | [pilot README](/pilot/README.md#work-in-dev), [DESIGN: landing copy deck](/docs/DESIGN.md#landing-copy-deck)                            |
| Haze replay: 9 Hybrid recommended, 5 Outdoor-limited, 7 Normal, 1 no data     | [IDEA: haze and storms](/docs/IDEA.md#haze-and-storms-at-the-exit-wave)                                                                 |
| Live grades: n=0                                                              | [DESIGN: landing copy deck](/docs/DESIGN.md#landing-copy-deck) FAQ; recheck on the recording day                                        |

## Open items

- **V4 research:** which interviews and timed tasks happened, with their counts and what changed. Fill from the team before the voice render.
- **V5 team lanes:** chaosiris's and DrxgClanPC's lanes, and whether full names or GitHub names appear.
- **D4:** filmed only after the licence arrives (#7, #49). The cut ships without it if the licence is late.
- **Live crossing:** if a real crossing happens before recording, D3 shows it live instead of the replay, and the replay label comes off.

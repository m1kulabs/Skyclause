# Skyclause idea

Skyclause makes one logged, approved call for each window its subscribers declare (a class, an event, a commute wave) when a live public signal says a hazard will meet it, and grades every call the next day against what the rain gauge, the air pollutant index (API) or the rail gates recorded. It has two signal packs, Sky (rain, storms, haze) and Crowd (stadium and arena nights), and starts at Bukit Jalil for Asia Pacific University (APU) club organisers and commuting students. Caveat: nothing is built, no APU office or club has agreed to own it, and **Inference** marks conclusions no source states.

Contents:

1.  [At a glance](#at-a-glance)
1.  [Origins](#origins)
1.  [Problem and evidence](#problem-and-evidence)
    1.  [Haze and storms at the exit wave](#haze-and-storms-at-the-exit-wave)
    1.  [Stadium nights at Bukit Jalil](#stadium-nights-at-bukit-jalil)
    1.  [Nobody writes the call down](#nobody-writes-the-call-down)
1.  [The insight](#the-insight)
1.  [What it is and is not](#what-it-is-and-is-not)
1.  [Why now](#why-now)
1.  [Why people will use it](#why-people-will-use-it)
1.  [Why the crowd won't build it](#why-the-crowd-wont-build-it)
1.  [Hackathon fit](#hackathon-fit)
1.  [Risks and kill criteria](#risks-and-kill-criteria)
1.  [Not verified](#not-verified)
1.  [See also](#see-also)

## At a glance

| Field        | Plan                                                                                                                                                                                                                                                                     |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner        | Pilot: a teammate on the approver rota holds the approver seat. Target, not agreed: APU's facilities, safety and welfare desk (FSSW, one public mention) for the Sky pack; a club events lead, asking clubs other than GDGoC APU first, for the Crowd pack               |
| First users  | Student club and event organisers with outdoor or evening events, and commuting students, who opt in through student channels; anyone who subscribes to a project's conditions calendar by URL; lecturers later                                                          |
| Packs        | Sky: JPS rain gauge `0232901RF`, MET warnings and forecast, DOE APIMS (`CA16W` and two more stations), the team's window camera on probation. Crowd: GoLive and Wikipedia venue listings, Rapid Rail gate taps at `SP17`, Rapid Bus positions decoded on the team's Pi 5 |
| Unit of work | A **window** gets a call. A **run** (06:45 schedule, a crossing, a listing change, a request) belongs to one pack and produces one **bundle**: the calls for every window at risk                                                                                        |
| Decision     | Per window and pack, a mode: Sky is Normal, Outdoor-limited, Commute disruption or Hybrid recommended; Crowd is Normal or Surge night with recommendations; either can be No call when an input is stale ([mode tables](/docs/PRD.md#clauses-cls))                       |
| Approval     | The decision agent proposes the call of record, with the clause engine's shadow verdict beside it; one approval per bundle by the approver on the rota; an all-Normal bundle writes nothing                                                                              |
| Grading      | Sky windows against the gauge and APIMS (hit, miss, false alarm, correct Normal); Crowd nights on D+1 against gate taps (in band, out of band, unlisted surge); to be published with n and Wilson 95% intervals                                                          |
| Track        | Intelligent Automation & Digital Transformation (proposed)                                                                                                                                                                                                               |
| Real today   | The public feeds, checked live on 5 November 2026; the source ideas' replays and backtests, labelled replay; the Weeknd forecast Fanfall's source idea wrote before the show. No code, owner, subscriber or live grade                                                   |

## Origins

Skyclause merges two numbered product docs of the [cross-set ranking](/docs/ideas/00-ranking.md#ranking): [Skyclause][sky] (71.1, rank 2 of 18) and [Fanfall][fan] (68.3, rank 4). The ranking didn't propose the pair: it merged ideas that "serve the same owner and make the same decision" ([how the products were merged](/docs/ideas/00-ranking.md#how-the-products-were-merged)), and **Inference:** these two differ on both. This merge was made on request, for a product meant to outlive the hackathon.

- **Kept from Skyclause** ([origins](/docs/ideas/02-skyclause.md#origins), [clause sheet](/docs/ideas/02-skyclause.md#the-clause-sheet)): the editable clause sheet with published defaults; windows declared by opt-in subscribers instead of APU's timetable; gauge confirmation before a storm call; the agent's call with a formula shadow check beside it; error rows instead of stale values; evidence replies on request; nightly grading; the window camera on probation; the Jira decision register; the ministry hook.
- **Kept from Fanfall** ([origins](/docs/ideas/04-fanfall.md#origins), [workflows](/docs/ideas/04-fanfall.md#day-to-day-workflows)): the exit-count forecast written down before the night and graded against gate taps on D+1; venue listings that carry source URL and revision and pass a person; the Gmail intake for shows the feeds miss; the public surge-night calendar; arithmetic outside the model; one approval per bundle; review items for misses and unlisted surges; the Pi 5 as the edge device that decodes and reduces public feeds.
- **Changed, one platform:** the two ideas become two packs on one engine that share windows, the clause sheet (Fanfall's "rules sheet"), the approver rota, the ledger, the conditions calendar and the subscriber list. A window can hold a Sky call and a Crowd call from different runs. The Fanfall name survives only here.
- **Changed, modes per pack:** Sky keeps its ladder, and the highest fired clause wins with every fired clause listed. Fanfall had no modes; Crowd gets Normal and Surge night, a new name for its Surge night rule, carrying recommendations: keep with an advisory, shift the start or end out of the arrival or exit period, ask the shuttle desk for a run, leave before doors. Watch stays a per-window state: Storm watch prints as context and sends nothing alone.
- **Changed, approval:** one approval per bundle, with per-call edit and reject, in both packs. For the Sky pack this is a deliberate change from Skyclause's one approval per non-normal call, so both packs share one approval step; in practice a crossing bundle usually holds one non-normal call.
- **Changed, who decides:** as in Skyclause, the decision agent's proposal is the call of record; the deterministic clause engine evaluates the same sheet, its shadow verdict wakes runs and sits beside the call, and a disagreement shows first. From Fanfall, the model does no arithmetic: Crowd baselines, uplifts, forecasts and bands arrive precomputed.
- **Changed, words:** Fanfall's "arrival window" and "exit window" become the **arrival period** and **exit period**, because a window is now what gets a call.
- **Changed, scope:** both sources were one-week Gemini Enterprise builds for APU. Skyclause is specified as a product: JPS, MET and APIMS cover the country, so any Malaysian campus or club can run the Sky pack, and the Crowd pack needs a venue with listings and a rail station with gate taps. The hackathon pilot is its first project; [TRD](/docs/TRD.md#gemini-enterprise-pilot) maps each pilot part to the platform.
- **Cut or deferred:** Skyclause's own cuts stand (the 20:00 and 15:30 schedules, the Registrar memo, the PM2.5 board). Deferred until someone is at APU or APU gives written permission: Fanfall's phone-timed APU-to-faregate legs, APU's timetable and shuttle feeds, and lecturer and FSSW recipients. In the pilot the Crowd outlook waits on the Sky path ([Hackathon fit](#hackathon-fit)).
- **Naming cost:** Skyclause ranked higher and names the clause sheet both ideas share, but "sky" undersells the Crowd pack: an events lead looking for stadium-night help has no reason to guess it from the name. The tagline, "The call for every window.", carries the general job. **Inference:** the cost lands on the Crowd pack's [go to market](/docs/PRODUCT.md#go-to-market-and-owners).

## Problem and evidence

Two hazards meet the same windows in one neighbourhood: APU sits about 880 m from LRT Bukit Jalil (`SP17`), the station for the national stadium, and the JPS rain gauge on the Sg. Kuyoh is named for the same station. The source ideas re-checked these numbers on 5 November 2026 unless marked; replays are labelled.

### Haze and storms at the exit wave

- **A ministry instruction with no university rule:** on 7 October 2026 the higher-education ministry (KPT) told every university to monitor API readings in its own locality; on 9 October vice-chancellors were told they could decide closures themselves; Universiti Malaya went hybrid from 12 October ([X research][x haze]). Schools got numbers and universities didn't: suspend outdoor activities above API 100 and close above 200 ([Malay Mail, 7 Oct][mm moe]), then close above 180 or after three consecutive days above 150 ([The Star, 8 Oct][star moe]).
- **Haze, replayed:** at Cheras (`CA16W`, the station nearest APU at about 5.9 km), the API passed 100 on 20 of the 31 days with readings from 3 October to 3 November 2026, passed 150 on 17 and peaked at 190. Skyclause's haze clauses, run on 06:00 readings for the 22 weekdays from 5 October to 3 November, give 9 Hybrid recommended, 5 Outdoor-limited, 7 Normal and 1 day with no data ([Skyclause haze][sky haze]).
- **The index lags:** PM2.5 and PM10 enter the API as 24-hour moving averages; Cheras read 83 at 06:00 on 13 October and 151 by 18:00 ([Skyclause haze][sky haze]).
- **A storm on the exit wave:** on 2 November the Sg. Kuyoh di LRT Bukit Jalil gauge (`0232901RF`) logged 63.0 mm over (14:00, 16:00], where a reading stamped T covers (T−5 min, T], and its 60-minute total first reached JPS's "Lebat" class (31–60 mm in an hour) at 15:00. That afternoon 155 physical sessions ended between 14:00 and 16:30, 89 of them at 15:30, and a traffic account listed a flash flood "Bukit Jalil arah Puchong" ([Skyclause storms][sky storms]).
- **Volume:** from 2 to 6 November, 508–563 physical sessions ran each weekday and 139–174 ended between 16:30 and 19:15, counted from one research fetch of APU's timetable, not by the product ([Skyclause storms][sky storms]).
- **Counterevidence:** from 29 October to 4 November heavy rain hit 4 of 74 weekday release waves, all on 2 November, and the heaviest hour (61.5 mm to 19:40 on 30 October) missed every wave. Skies cleared on 27 October, and Skyclause expects haze to appear only as a replay this month. **Inference** (the source's): most calls are Normal, and the product earns trust only if the rare call is right.

[mm moe]: https://www.malaymail.com/news/malaysia/2026/10/07/haze-education-ministry-orders-state-and-district-education-offices-schools-to-monitor-haze-act-based-on-api-readings/238138
[star moe]: https://www.thestar.com.my/news/nation/2026/10/08/haze-schools-must-close-if-api-exceeds-150-for-three-days-says-education-ministry
[sky haze]: /docs/ideas/02-skyclause.md#haze-a-ministry-instruction-with-no-university-rule
[sky storms]: /docs/ideas/02-skyclause.md#storms-the-exit-wave-meets-the-afternoon-cell

### Stadium nights at Bukit Jalil

- **The size:** LRT Bukit Jalil serves TM Stadium Nasional (87,500 capacity), Unifi Arena and the National Hockey Stadium. 2026 weekdays averaged 3,809 exits at `SP17` (219 days to 3 November); stadium nights logged 38,447 on 10 January and 31,971 on 17 October ([Fanfall problem][fan problem]).
- **How often:** from March 2024 to October 2026, 59 nights (1.8 a month) had at least 2,500 exits above the median of the same weekday over the previous eight weeks, 22 of them weekdays; that is the backtest's surge definition, not the 5,000-exit Surge night clause. November 2026 is denser: The Weeknd (4–5 November), BABYMONSTER (14), 5 Seconds of Summer (17), My Chemical Romance (19–20) and Evanescence (28), five of the concert nights on weekdays ([Fanfall problem][fan problem]).
- **APU's exposure:** in a one-off count, physical classes ending 16:45–19:30 cover 444 intake groups on 4 November and 406 on 17 November; the weekday shuttle leaves APU for the LRT 12 times from 17:00 to 19:15, then at 20:45 and 21:45, both "Limited space only" ([Fanfall problem][fan problem]).
- **Forecastable and gradable:** Fanfall's source idea wrote down its forecast for The Weeknd on 4 November at 01:07 MYT, before the show: 27,044 exits (band 19,315–32,100) against a 3,928 Wednesday baseline ([Fanfall workflows](/docs/ideas/04-fanfall.md#day-to-day-workflows)). Its surge-night flag at 5,000 extra exits scored precision 0.88 (7 of 8) and recall 0.33 (7 of 21) over 671 days, from the source idea and not re-run ([Fanfall research plan](/docs/ideas/04-fanfall.md#research-plan)).
- **The government named it:** Federal Territories minister Hannah Yeoh told the Dewan Rakyat on 2 November 2026, "Every weekend, whenever there is a concert, Bukit Jalil becomes extremely congested"; DBKL's micro-traffic study is due in the first quarter of 2027, with a traffic management plan by February 2027 ([Malay Mail][malaymail], [paultan.org][paultan]).
- **Organisers already work around it:** a meetup at APU warned "Expect major congestion in the Bukit Jalil area" for a match with "45k+ fans", and a hackathon posted its own "6:30 PM — APU → LRT Bukit Jalil" bus ([X research][x crowds]).
- **Counterevidence:** GDGoC APU's chapter lists 36 completed events since 18 October 2024; three fell on surge days and one ran into the crowd (17 April 2026, 7,233 exits), so one active club met one evening clash in two years. Surge nights are rare per organiser, RapidKL already extends station hours, and DBKL's plan may fix the roads ([Fanfall problem][fan problem]).

[paultan]: https://paultan.org/2026/11/03/government-to-address-traffic-congestion-in-bukit-jalil-during-major-events/

### Nobody writes the call down

- **No written rule or record at APU:** its public knowledge base, searched on 5 November, has no page for "haze", "jerebu", "thunderstorm" or "lightning" ([Skyclause record][sky record]). Students use AirVisual or aqicn.org instead of official readings, and switch classes online ad hoc ([Reddit research][reddit haze]); commuters check forums for floods before travelling ([other platforms research][other rain]).
- **Stadium nights:** an organiser who thinks to check searches ticket sites and Instagram, guesses, and writes a notice or books a bus; nobody records whether the guess was right ([Fanfall problem][fan problem]).
- **The owner is a guess:** a parent's review mentions APU's "campus facilities, safety and welfare head", and no knowledge-base page names such an office ([Skyclause record][sky record]); no club has agreed to own the Crowd pack ([Fanfall at a glance](/docs/ideas/04-fanfall.md#at-a-glance)).
- **Attendance is already someone's call:** whether a student caught in a storm is Late or Absent With Reason is the lecturer's decision in AttendiX ([Skyclause record][sky record]).
- **One neighbourhood, two hazards:** X shows stadium crowds and flash floods around LRT Bukit Jalil as one area's recurring problems (16 posts), and a fan worried that the "STADIUM BUKIT JALIL TU SENANG BANJIR" (floods easily) ahead of a rainy-season concert ([X research][x crowds]).
- **Inference:** each lecturer, organiser and office decides alone, from different sources, with no shared record; nothing written answers "how did APU monitor local readings in October?" or "was last night's crowd call right?".

[sky record]: /docs/ideas/02-skyclause.md#who-decides-today-and-with-what-record
[reddit haze]: /docs/research/social.md#haze-heat-and-flash-floods
[other rain]: /docs/research/social.md#heat-rain-and-flash-floods

## The insight

Both source ideas built the same engine for different hazards: a declared window × a live public signal × an editable clause × one human approval × a next-day grade against ground truth. Skyclause runs it on the gauge and APIMS; Fanfall runs it on venue listings and gate taps. **Inference** for every point below, since no source compares the two:

- **One approver rota:** both hazards land on the late-afternoon exit wave and the evening events after it, so one approver on the rota covers forecast storm afternoons (14:00–19:15 MYT) and surge nights (08:00–22:00) instead of two desks that are idle most days.
- **One ledger:** evidence for a window (did conditions justify a late arrival or a moved event?) comes from one record whichever hazard applied.
- **One conditions calendar and one subscriber list:** a subscriber declares windows once and gets both packs' calls on one calendar URL; neither pack alone gives an organiser more than a few useful notices a term.
- **One grading method:** hit, miss and false alarm for Sky windows and in band or out of band for Crowd nights, both reported with n and Wilson 95% intervals per the [accuracy method](/docs/research/judging.md#measuring-an-agents-accuracy-honestly), so a reader learns one ledger.
- **An agent with a shadow:** the agent reads what formulas can't (MET warning text verbatim, which declared windows a clause covers, how a notice should read); the engine evaluates the same sheet deterministically, so a disagreement is visible before anyone is notified.
- **The grade is the product:** both sources concede most calls are Normal and surge nights are rare; what no substitute offers is its own error published the next day. Skyclause's own inference: the record and the evidence replies may be used more than the notices.

## What it is and is not

Skyclause is a call-and-record service: for each declared window it says what the public signals mean, a person approves, and the next day's ground truth grades the call.

- **Not a weather app:** it makes no weather forecast of its own; it reads MET's forecast and warnings and JPS's gauge and says what they mean for one window.
- **Not a traffic dashboard:** there is no live map or congestion view; the Crowd pack's output is a graded surge-night call and its recommendations.
- **Not a forecast seller:** PredictHQ sells event-demand forecasts, with a [Bukit Jalil venue page][predicthq], behind a paid API; Skyclause's exit-count forecast is an input to a call and is published with its error on D+1.
- **Not an attendance excuse:** it never marks anyone Late or Absent With Reason; it supplies the dated facts a lecturer may weigh.
- **Not a safety or emergency service:** notices say so in one line, and a human approves every notice, so it promises no instant dispatch ([platform constraints](/docs/research/gemini-enterprise.md#platform-constraints-and-design-consequences)).
- **It doesn't decide teaching mode:** Hybrid recommended always says teaching mode is the lecturer's and the university's decision.

[predicthq]: https://www.predicthq.com/major-events/venues/bukit-jalil-national-stadium-my

## Why now

- **The ministry asked on 7 October 2026:** KPT told every university to monitor local API readings, and APU has no rule or record to show for October ([X research][x haze]); "Jerebu is back ni" was posted on 1 November.
- **November 2026 is a concert month:** GoLive listed seven complex nights in November on 5 November, including five weekday concert nights; 5 Seconds of Summer and My Chemical Romance play on 17–20 November ([Fanfall problem][fan problem]).
- **The government is looking at Bukit Jalil:** the minister's 2 November statement, and DBKL's study due in the first quarter of 2027 ([Malay Mail][malaymail]). Fanfall's own inference: a graded public record of event nights against station taps may help that study, and nothing depends on it ([Fanfall time to impact](/docs/ideas/04-fanfall.md#time-to-impact)).
- **The build weeks are wet:** MET's KL forecast, fetched at 07:14 MYT on 5 November, says thunderstorms every afternoon from 5 to 11 November ([data sources](/docs/research/data-sources.md#weather-forecasts-for-campus)), so a live Sky crossing during assessment is likely, not certain.
- **The pilot's live-read path is new:** Gemini Enterprise's Sheets actions (Get cell values, Update cell values) have been GA since 12 October 2026 ([actions](/docs/research/gemini-enterprise.md#actions-and-write-back), [Skyclause connectors](/docs/ideas/02-skyclause.md#connectors-and-platform-check)), so a workflow can read the clause sheet and indicators at query time instead of from an ingested copy.

## Why people will use it

- **Revealed effort on both hazards:** AirVisual or aqicn.org instead of official readings, ad hoc online classes, martial-arts clubs closed for the haze, and a commuter checking the forum on rainy mornings "to see if anyone open thread show the flood" ([Skyclause][sky why]); organisers posting congestion warnings and booking their own LRT buses ([Fanfall][fan why]).
- **Habit loop:** the cue is a notice or a calendar entry in an inbox and calendar people already open; the action is a ten-second read and their own choice; the reward is no surprise at the exit, a grade after, and a dated record to point at.
- **No new mandate:** each recipient acts within authority they already hold (an organiser over an event, a student over a commute, later a lecturer over attendance codes); only Hybrid recommended needs closure authority, and the notice says so.
- **Zero install:** recipients need no account or seat; Outlook and Google Calendar subscribe to the conditions calendar by URL; an evidence request costs one email.
- **One subscription, two hazards (Inference):** an organiser who subscribes for stadium nights also gets storm calls for the same evening events, so each subscriber receives more useful notices than either pack gives alone.
- **Counterevidence:** no source shows a student, lecturer or organiser asking for such a call; most days are Normal, and each organiser meets a surge night only a few times a term, so this is a club-scale tool until an office adopts it ([Skyclause][sky why], [Fanfall][fan why]).

[fan why]: /docs/ideas/04-fanfall.md#why-people-will-use-it

## Why the crowd won't build it

- **The simulated crowd:** of 780 simulated ideas, air quality is 2.2% and queues and crowds 2.5% (thin, "often simulated"); flood warning is 3.2% and city traffic 3.8% (the crowded off-campus tier). Only 3% use public feeds, and 1% combine an unattended run, a named owner and a measured baseline ([saturation tiers](/docs/research/competition.md#saturation-tiers), [what the crowd misses](/docs/research/competition.md#what-the-crowd-structurally-misses)).
- **This hackathon:** `apu-smart-shuttle`, a Flutter and Firebase shuttle tracker, promises "traffic and rain alerts" with no Gemini Enterprise part ([public repositories](/docs/research/competition.md#public-repositories-so-far)); Skyclause tracks nothing and outputs an approved, graded call.
- **GitHub, searched by the source ideas on 4–5 November:** "haze malaysia" returns 33 repositories, trackers and dashboards; "air quality school closure", "storm warning class", "bukit jalil stadium" and "concert crowd transit forecast" return none; RapidKL ridership repositories model plain time series ([Skyclause][sky crowd], [Fanfall][fan crowd]).
- **Substitutes:** PredictHQ sells the event forecast and RapidKL announces extended hours ([Fanfall][fan crowd]); AirVisual and aqicn.org show readings ([Skyclause][sky why]). None hands an organiser a decision for one window or publishes its own error the next day.
- **Nearest neighbour in this repo:** [KuyohGuard](/docs/ideas/09-kuyohguard.md#at-a-glance) (rank 9, 64.2) reads the same Sg. Kuyoh gauge and MET warnings, joins them with route T580 bus positions and APU's dismissal waves, and drafts Green, Amber or Red corridor advisories for APU's Logistics & Operations office. Skyclause calls per declared window rather than per corridor, reads no APU feed (KuyohGuard's dismissal join needs timetable permission), adds haze and stadium nights, and grades every call in a public ledger. The ranking's "Don't build two" list doesn't name the pair ([how to choose](/docs/ideas/00-ranking.md#how-to-choose)); **Inference:** one team should build only one of them.
- **Inference:** the scarce combination is a ministry hook, declared windows, local confirmation, one approval and a next-day grade; the crowd stops at the notice or the dashboard.

[sky crowd]: /docs/ideas/02-skyclause.md#why-the-crowd-wont-build-it
[fan crowd]: /docs/ideas/04-fanfall.md#why-the-crowd-wont-build-it

## Hackathon fit

Proposed track: **Intelligent Automation & Digital Transformation**. Each team selects exactly one track ([challenge tracks](/docs/BRIEF.md#challenge-tracks)); Skyclause proposed this one and Fanfall proposed Data-Driven Research & Intelligent Decision Making ([ranking](/docs/ideas/00-ranking.md#ranking)). The pilot ships the Sky pack first, and its unit of value is an approved action from an unattended workflow, which fits the track's "connecting devices with useful actions"; the Crowd pack's graded forecast is an input to that action. **Inference:** reviewers may still read the Crowd half as the other track, one more reason it ships second.

NTT DATA named five rating points, unweighted ([context](/docs/CONTEXT.md#what-ntt-data-said-it-will-rate)); the right column gives each source's component score ([scores by component](/docs/ideas/00-ranking.md#scores-by-component)).

| Point                | How the merged product meets it                                                                                                                                                                                     | Skyclause, Fanfall |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Impact               | Real volume on both hazards (139–174 sessions in each weekday exit wave; 59 surge nights since March 2024) and the ministry hook; no owner yet, and both hazards are rare per user                                  | 3, 2.67            |
| Technical build      | The same GA connectors in both sources: Drive event trigger, Sheets Get and Update cell values, Gmail trigger and send, Calendar create and update event, Jira Cloud Free create issue; no MCP on the critical path | 4.33, 4            |
| Research             | Re-checked evidence, a labelled haze replay, Fanfall's 48-event backtest, 6–8 student and organiser interviews in two rounds, and timed observations; APU-specific owner and demand evidence is thin                | 4, 4               |
| Time to impact       | Crowd calls for 17–20 November arrive within weeks; dated 3- and 6-month plans in the [roadmap](/docs/PRODUCT.md#roadmap); the haze clauses get their first live season only in the 2027 dry season                 | 3.33, 3.67         |
| Day-to-day workflows | The 06:45 schedule, crossing runs, Gmail requests, the 07:00 outlook and D+1 grading recur unattended whether or not anyone acts, and an auditor flags a crossing that got no run                                   | 4, 4               |

- **Scores:** the sources scored 71.1 (rank 2 of 18) and 68.3 (rank 4), and 74.7 and 73.3 when only NTT DATA's five points count ([sensitivity](/docs/ideas/00-ranking.md#sensitivity)); both scored lowest on buildability (2 and 2.33). This merged doc is unscored, and no score is claimed for it.
- **The pilot cut:** running both ideas in a week is more than either scorer panel thought buildable, so the pilot (5–17 November 2026) ships one pack first: the Sky storm crossing plus evidence-by-email, the advice of Skyclause's lowest scorer ([Skyclause scores](/docs/ideas/02-skyclause.md#scores)). The Crowd outlook and next-day grading join only if the Sky path works end to end by 7 November; otherwise the Crowd pack runs as its fallback, the public surge-night calendar plus daily grading.
- **Polling budget:** Apps Script triggers get 90 minutes of runtime a day on a consumer account and 6 hours on Workspace ([free-tier limits](/docs/research/gemini-enterprise.md#free-tier-limits-that-matter)). JPS every 5 minutes (288 runs), MET warnings every 10 (144), APIMS every 15 (96), the MET forecast every 6 hours (4), GoLive hourly (24) and the daily jobs come to about 560 runs a day: about 10 s a run on consumer, 39 s on Workspace (our arithmetic). The Pi, not Apps Script, decodes bus positions and reduces the ridership file.
- **Quota:** Standard gives 160 assistant queries per user a day, shared by the 06:45 and 07:00 schedules and every event run, and one run isn't one query ([limits](/docs/research/gemini-enterprise.md#limits-that-bite-in-a-one-week-build)).

## Risks and kill criteria

Market and pilot risks, carried from the sources unless marked as a merge risk; engineering risks are in [TRD](/docs/TRD.md#technical-risks).

- **The build overruns (merge risk):** if by the end of 7 November no crossing run has gone from file to approved Gmail, Calendar and Jira writes, cut the 06:45 call and the camera's clause role, ship the crossing and evidence paths only, and keep the Crowd pack to its fallback ([Skyclause risks](/docs/ideas/02-skyclause.md#risks-and-kill-criteria)).
- **The camera fails probation:** if by 8 November the phone's flag agrees with two labellers on fewer than 90% of at least 100 daylight frames (at least 10 obscured), it keeps only evidence frames and network proof, and the IoT layer is conceded as public telemetry plus a visible network.
- **The Pi fails at home:** if it drops out more than twice from 5 to 9 November, the ridership reduction moves to GitHub Actions and the bus probe leaves the video's claims ([Fanfall risks](/docs/ideas/04-fanfall.md#risks-and-kill-criteria)).
- **Two devices (merge risk):** the camera serves the Sky pack and the Pi the Crowd pack, both at teammates' homes, which doubles what can [kill a home deployment](/docs/research/iot-and-network.md#what-kills-home-deployments). The two criteria above apply separately; if both fail by 9 November, the pitch claims no team sensor.
- **The forecast doesn't hold:** if both Weeknd nights (graded as Rapid Rail's files land, from 22:00 on 5 November) fall outside the band with errors above 40%, stop Crowd advisories and publish only the graded ledger until the event classes are revisited.
- **Nobody acts on a call:** if fewer than four of the six or more students interviewed by 8 November say they would act on a call or subscribe, drop Sky notices and keep the record and evidence path; if no round-one organiser (6 November) would shift an event or forward an advisory, the Crowd pack shrinks to the public calendar and ledger.
- **The agent and the shadow verdict disagree:** if they differ on more than 1 in 10 graded windows for reasons other than stale inputs, rewrite the clause wording before adding recipients; the count is published either way.
- **Two owners (merge risk):** the Sky pack's target owner is an office and the Crowd pack's a club, and the ranking merged only ideas that serve the same owner. If no club agrees by 9 November, the team runs the Crowd desk on GDGoC APU's public events and the hackathon final, and Impact is stated as unproven; if FSSW or a successor hasn't agreed by 5 February 2027, drop the office claim and keep the product as a club calendar for subscribers.
- **One platform buys nothing (merge risk):** if by 5 February 2027 no subscriber holds windows in both packs and no approver covers both, the case in [The insight](#the-insight) fails; keep the engine and take the packs to market separately.
- **Two tracks (merge risk):** if the Crowd pack ships in the pilot and the Sky crossing doesn't, revisit the track before submission closes at 23:59 MYT on 10 November.
- **A quiet assessment week:** 11–14 November has one listed show (BABYMONSTER on 14 November, whose file lands on 15 November) and storms only forecast; the video, recorded from the live system on 9 November, says what happened.
- **Feeds change or close:** APIMS, the JPS 5-minute JSON and GoLive are undocumented; each failure is an error on the call with no fallback value.
- **Platform limits:** schedule credentials expire every 14 days, so refresh them on 9 November; if quota use measured over ten runs projects past 80% of 160 queries a day, slow the crossing poll and move the Crowd outlook to the 07:00 schedule only.

## Not verified

Market and evidence unknowns only; product questions are in [PRD](/docs/PRD.md#open-questions) and technical ones in [TRD](/docs/TRD.md#not-verified).

- **Demand:** whether any student, lecturer or organiser wants a call rather than readings; no source shows anyone asking, and the 5–8 November interviews are the first test.
- **Owners:** whether FSSW exists under that name and what it decides; whether any club other than GDGoC APU will own the Crowd pack or act on an advisory; Student Service's remit.
- **The merge:** whether one approver or office will cover both hazards, and whether subscribers want both packs; the shared-engine case is **Inference**.
- **2 November:** whether a MET warning named Kuala Lumpur that afternoon; MET's endpoint keeps no history.
- **Rain totals:** for 3 November the KL portal's daily field says 46 mm and Public Infobanjir 39 mm.
- **The gauge's position:** JPS publishes no coordinates; the gauge is named for LRT Bukit Jalil station.
- **The Crowd backtest:** Fanfall's 48-event backtest and its precision and recall were not re-run; a plain eight-week median finds 20 nights at 5,000 or more extra exits where the source found 21 ([Fanfall not verified](/docs/ideas/04-fanfall.md#not-verified)).
- **The haze backtest:** the 9 Hybrid recommended, 5 Outdoor-limited, 7 Normal and 1 no-data weekdays ran on the Malaysia Haze Monitor log, which has no stored copy, so they can't be re-run from the repo.
- **Listings:** the 7, 8 and 28–29 November arena shows and the 13–15 November expo come from one fetch; whether GoLive's `Z`-suffixed times are local show times.
- **GDGoC APU's event count:** the [winners research](/docs/research/winners.md#this-hackathons-lineage) counts 24 completed events from 18 October 2024 to 28 October 2026; Fanfall and the ranking count 36 with `status=Completed`.
- **The Weeknd grade:** whether the 4 and 5 November forecasts land in band; the first file is due at 22:00 on 5 November.
- **Redistribution and the name:** JPS, APIMS and GoLive publish no terms, so whether public pages may show derived values is open; the Skyclause trademark at MyIPO is unchecked.

## See also

- [Skyclause product](/docs/PRODUCT.md), [product requirements](/docs/PRD.md), [technical requirements](/docs/TRD.md) and [design](/docs/DESIGN.md): what it is, what it must do, how it is built and how it looks.
- Source ideas [Skyclause][sky] and [Fanfall][fan], the nearest neighbour [KuyohGuard](/docs/ideas/09-kuyohguard.md), and the [cross-set ranking](/docs/ideas/00-ranking.md).
- [Brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md): tracks, dates and NTT DATA's five points.
- [Social research](/docs/research/social.md): the haze, flood, crowd and workaround evidence.
- [Data sources](/docs/research/data-sources.md), [Gemini Enterprise](/docs/research/gemini-enterprise.md), [competition](/docs/research/competition.md), [judging](/docs/research/judging.md), [IoT and network](/docs/research/iot-and-network.md) and [APU](/docs/research/apu.md): feeds, platform limits, the crowd, accuracy method, devices and APU's terms.

[sky]: /docs/ideas/02-skyclause.md
[sky why]: /docs/ideas/02-skyclause.md#why-people-will-use-it
[fan]: /docs/ideas/04-fanfall.md
[fan problem]: /docs/ideas/04-fanfall.md#problem-and-evidence
[x haze]: /docs/research/social.md#haze-and-air-quality-decisions
[x crowds]: /docs/research/social.md#event-crowds-and-flash-floods-around-bukit-jalil
[malaymail]: https://www.malaymail.com/news/malaysia/2026/11/03/hannah-yeoh-smart-city-solutions-bus-hub-among-plans-to-ease-bukit-jalil-concert-traffic/241750

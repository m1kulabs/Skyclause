# Khabar

Khabar tells one chosen friend when a student who lives alone has gone quiet. The student sets one standing rule (a time of day, a grace period, a buddy's email); the phone's own unlock, charger, app-open and fixed-time heartbeat events are the check-in, so there is nothing to tap, and no location is ever read. If the phone stays silent past the rule, the student is nudged first, and only then does the buddy get one email carrying the time of the last sign. It is for Asia Pacific University (APU) students living alone off campus, international students first, under the proposed track **Smart Campus & Student Experience** ("more accessible student experiences", see [challenge tracks](/docs/BRIEF.md#challenge-tracks)). Caveat: no APU office owns it, the team is the operator, the event it exists for is rare, and nothing has been built or run yet; **Inference** marks conclusions no source states.

Contents:

1.  [At a glance](#at-a-glance)
1.  [Origins](#origins)
1.  [Problem and evidence](#problem-and-evidence)
1.  [How it works](#how-it-works)
    1.  [Signal to cloud path](#signal-to-cloud-path)
    1.  [Workflow and rule set](#workflow-and-rule-set)
    1.  [States and failure handling](#states-and-failure-handling)
    1.  [Connectors and platform check](#connectors-and-platform-check)
    1.  [Cloud, IoT and network](#cloud-iot-and-network)
    1.  [Real data and privacy](#real-data-and-privacy)
1.  [Why people will use it](#why-people-will-use-it)
1.  [Why the crowd won't build it](#why-the-crowd-wont-build-it)
1.  [Off-campus fit](#off-campus-fit)
1.  [Scores](#scores)
1.  [Research plan](#research-plan)
1.  [Time to impact](#time-to-impact)
1.  [Demo and review](#demo-and-review)
1.  [Build plan](#build-plan)
1.  [Risks and kill criteria](#risks-and-kill-criteria)
1.  [Not verified](#not-verified)
1.  [See also](#see-also)

## At a glance

| Field                 | Plan                                                                                                                                                                                                                                           |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Owner                 | The team, as operator and sole approver, until a student society's welfare lead takes the seat; none has been asked. Each student owns their rule and can delete their rows by email. No APU office or staff is involved.                      |
| First users           | APU students living alone off campus, international students first. Before 10 November: the team's own 2 to 5 phones, plus any recruits. No source in `docs/research/` counts APU students who live alone.                                     |
| Track                 | Smart Campus & Student Experience.                                                                                                                                                                                                             |
| Trigger               | A Gemini Enterprise schedule, hourly from 08:00 to 23:00 MYT (16 runs a day), plus Sunday 18:00 for the opt-in weekly note.                                                                                                                    |
| Live signal           | Phone events POSTed to an Apps Script web app: Android (Automate) unlock, charger and a 03:00 heartbeat; iPhone (Shortcuts) charger, chosen app opened, alarm, home Wi-Fi join, and 03:00 and 12:00 heartbeats. A Pi 5 probe every 10 minutes. |
| Connectors            | GA only: Google Drive and Sheets (read), Gmail (read replies, send), Jira Cloud (create issue, create comment, change issue status). No preview feature or custom MCP.                                                                         |
| Decision              | Per student, per run: no action, nudge, ask the buddy, or close, from the rule, the status row, the student's own emailed replies and away notes (free text, English or Malay), and the open case.                                             |
| Action and approval   | A Jira case `KHB-n` and emails to the student and buddy; every write and send pauses at Needs Review for the workflow's author.                                                                                                                |
| Reviewer self-trigger | Post one event from the README's `curl` line or iPhone Shortcut with a reviewer code and your own email, then stay silent; the next hourly run opens a case and, once approved, emails you; post again to close it.                            |

## Origins

Khabar comes from one source, the [opus-03 Khabar doc](/docs/ideas/opus-03/05-khabar.md). It keeps that doc's core: a passive check from the phone's own events, never location, student first, a buddy the student chose, and false alarms per person-week as the headline metric and kill criterion. It changes the following, to answer the scorers' objections and to fix claims the research or the live pages contradict:

- **Android app:** MacroDroid, whose HTTP action no MacroDroid page confirms, is replaced by Automate, whose HTTP request block sends POST "when a body is supplied" ([IoT and network][iot-auto]) and whose block list includes Device unlocked, Power source plugged and Time await ([Automate blocks], opened 5 November 2026). The "5 free macros" figure goes with MacroDroid; Automate's free edition allows 30 running blocks.
- **iPhone heartbeat:** the source said an iPhone has no 03:00 heartbeat and that its silence can't be split into "offline" and "untouched". Time of Day automations do run without asking at fixed daily times ([IoT and network][iot-ios]), so an iPhone posts at 03:00 and 12:00 too, and the App trigger (also allowed without asking) gives it an unlock-like sign. Both are untested on a locked phone.
- **Home Assistant dropped:** it duplicated the phone's events through a second app exposed to the same vendor killers. The source also had its cadence wrong: Android sensors update "during a periodic 15-minute interval", and every minute only with Fast While Charging ([HA sensors], opened), not every 15 minutes on a charger.
- **Calendar dropped:** the connector reads the licensed domain, not students' personal calendars. Away notes now arrive by email and are read through Gmail.
- **Bookkeeping moved out of the workflow:** connector writes from a workflow require human review ([Gemini Enterprise][ge-unattended]), so the source's hourly Sheets update would have paused all 16 runs a day. `doPost` now keeps the status and days tabs, and the workflow writes only when a rule fires.
- **One approver, not a rota:** scheduled runs pause "for review and require user approval in chat history" ([Gemini Enterprise][ge-unattended]), which is the author's; whether a teammate can approve instead is unverified.
- **The buddy installs nothing:** the source built reciprocal pairs; now the buddy only receives email and confirms once by reply, which answers the objection that the buddy must adopt something new.
- **Dates:** the source's build plan ran "Thu 6" to "Mon 10", but 6 November 2026 is a Friday and 10 November a Tuesday.
- **Measurement:** "minutes from last sign to buddy notice" is now measured from window end, because the last sign includes a night's sleep. The 72-hour kill test on 5 phones is about 15 person-days; with zero false alarms the 95% upper bound is still about 1.4 per person-week (rule of three), so it can stop the build but cannot certify it.
- **Dropped:** the Scores section; Snug's "US phone line", which Snug's page doesn't state; the Life360 row, whose page returned 403 on 5 November.

[HA sensors]: https://companion.home-assistant.io/docs/core/sensors

## Problem and evidence

Students who live alone in off-campus flats have nobody whose job is to notice a missing day. In APU accommodation threads, living off campus is a usual workaround, with Parkhill, M Vertica and Bloomsvale the usual names ([social research](/docs/research/social.md#lifts-laundry-and-deposits)), and an incoming APU student asked for "the entire unit to myself" ([everyday][ev-alone]); neither says how many live alone. The event Khabar exists for is rare and the fear is constant, so this week's measurable impact is false alarms and notice latency, not harms prevented. **Inference:** the cost that matters most is the false alarm, because one wrong alert to a buddy ends the arrangement.

Evidence, from `docs/research/everyday.md` (counts re-checked on 5 November 2026):

- **The one Malaysian ask:** a Malaysian who lives alone asked X (in Malay) whether there is "any automation prompt to notify family members or friends so they know you died alone at home" (26 October 2025; 14 likes, 13 replies, 3,568 views). It asks for automation, not a button. A working Malaysian adult: "If I die in the house, people will only find a carcass" (5 September 2025; 15 likes) ([everyday][ev-alone]).
- **Paid demand abroad:** "Are You Dead?" (Sileme, later Demumu) asks for a tap every two days and was #1 on Apple's paid chart in China in January 2026; the top news post drew 60,989 likes and 1.86M views, and a founder said seven or eight in ten buyers were women over 25 living alone ([everyday][ev-alone]).
- **Daily-tap apps have real use:** Snug's AMA reported 20 million check-ins and "tens of thousands" of daily users; the top questions were about data (72 points) and a weekly rather than daily interval (47), and a user wrote "I forgot to check in one day and the Fire Department came to my door" ([everyday][ev-alone]).
- **People build passive versions:** QuietOK "checks in automatically using your phone's step activity… You don't tap anything, and it doesn't track your location" (7 October 2026); a Reddit builder ties the check-in to "your phone charging event"; on r/LivingAlone a user keeps a daily-contact pact with a friend who calls for a welfare check after three missed days (52 points) ([everyday][ev-alone]).
- **Families want a middle way:** a parent asked for "a third option, where the kids track one another and I don't… for safety" (26 May 2026; 11 likes, 25 replies) ([everyday][ev-loc]).
- **Isolation among APU newcomers:** about 30 intake and friend-seeking posts by APU students from July to 2 November 2026, mostly answered with jokes or offers to DM ([everyday][ev-lonely]). **Inference:** this shows isolation, not demand for a check-in.

Counterevidence, stated plainly:

- **Local demand is thin.** Apart from the one X ask, no Malaysian thread asks for a check-in app; the strongest demand is Chinese and may be "a January 2026 novelty spike" ([everyday][ev-disconf]). No APU student has asked for Khabar.
- **Passive clones found few users:** QuietOK "almost nobody knows it exists" and is "still struggling to reach actual app users"; clones on Hacker News and r/SideProject drew 3 points each ([everyday][ev-alone]).
- **False alarms are the main complaint:** "99% of the time the emergency contacts will be bc people forget to respond" (12 likes); "Seems really easy to miss the check in by accident and then freak out a loved one" (134 points) ([everyday][ev-alone]).
- **Watching adult students backfires:** the biggest location-sharing posts (16,755 to 25,521 likes) mock parents tracking college students ([everyday][ev-loc]). Khabar never reads location, and says so first.

## How it works

The student fills in one Google Form: a short code, their email, a buddy's email, a window end ("no sign by 11:00"), a grace period, and whether they want the Sunday note. They install one Automate flow (Android) or a set of Shortcuts automations (iPhone) carrying their code. If the phone shows no sign by window end plus grace, the student is emailed first; only after 60 more minutes of silence, and only if the phone is shown to be alive, does the buddy get an email.

### Signal to cloud path

1.  **Phone event:** each sign is an HTTPS POST of `{code, event, phone_ts}` to the Apps Script web app; clients follow its redirect, and `doPost` spends no trigger quota ([IoT and network][iot-pi]).
    - **Android (Automate):** Device unlocked, Power source plugged (both directions), and a Time await at 03:00 as the heartbeat, each feeding one HTTP request block. Doze defers jobs and blocks network on an unplugged, idle phone, but "connecting a charger" exits it ([IoT and network][iot-android]); a deferred heartbeat still counts if it lands before window end.
    - **iPhone (Shortcuts):** Charger Is Connected and Is Disconnected, App opened (one app the student picks), Alarm, home Wi-Fi join, and Time of Day at 03:00 and 12:00, each with Get Contents of URL; set to run without asking and Allow Running When Locked ([IoT and network][iot-ios]).
    - **Pi 5 (one teammate's home):** a systemd timer posts a probe every 10 minutes with `curl -L` and the previous round-trip time, under `Restart=always`, a hardware watchdog and Wi-Fi power save off ([IoT and network][iot-alive]).
1.  **Feeder:** `doPost` takes a script lock, appends `{code, event, phone_ts, server_ts}` to the **events** tab, updates the **status** tab (last sign, last heartbeat per code) and the **days** tab (first sign per code per date). `server_ts - phone_ts` is each event's network delay.
1.  **Read:** the workflow reads the rules and status tabs with Sheets Get cell values through the Drive connector (GA, federated, no indexed copy) ([Gemini Enterprise][ge-actions]), recent Gmail messages from each student and buddy, and open Jira cases.
1.  **Write:** Jira Cloud and Gmail actions, each pausing at Needs Review.

Signs are unlock, charger plugged or unplugged, app opened, alarm and Wi-Fi join. Heartbeats prove the phone is on and online but not that anyone touched it.

[Automate blocks]: https://llamalab.com/automate/doc/block/

### Workflow and rule set

One Gemini Enterprise workflow, `Khabar check`, on the hourly schedule. A Gemini agent node reads the inputs above, applies the rules, reads the student's free-text replies and away notes ("away until Sunday", in English or Malay), and drafts each message; an Approval step precedes the Jira and Gmail actions. **Inference:** the rules alone are a threshold check; Gemini earns its place by reconciling free-text replies with the rule and drafting a message that fits the state.

- **R0 Feeder guard:** if no row from any source, the Pi probe included, has landed in 30 minutes, open no cases and file one Jira issue "feeder unreachable since HH:MM".
- **R1 Nudge:** past window end plus grace, no sign since 00:00, no away note covering today, no open case. Create `KHB-n` (code, last sign time, state) and email the student: "No sign from your phone since HH:MM. Unlock it, plug it in, or reply to this."
- **R2 Buddy:** case open at least 60 minutes, still no sign, a heartbeat has arrived since 00:00, and the buddy has confirmed. Email the buddy: "Khabar has had no sign from your friend's phone since HH:MM. This is often a phone left behind or a flat battery. Could you message or call?" Add a Jira comment.
- **R3 Offline path:** no heartbeat and no sign means R1 only; R2 waits until window end plus 24 hours, since a flat battery or a killed app is the likelier cause (**Inference**).
- **R4 Close:** any new sign or a reply from the student moves the case to Done and, if the buddy was asked, sends "all good, sign at HH:MM".
- **R5 Buddy consent:** the first time a buddy is named, one email asks them to reply "yes"; R2 never mails an unconfirmed buddy.
- **R6 Sunday note (opt-in, cut first):** the count of days with a first sign before window end, emailed to the student only, to forward if they like.

### States and failure handling

- **States per student per day:** touched (a sign since 00:00), untouched but alive (heartbeat, no sign), offline (neither), away (an away note covers today), feeder down (R0). Only "untouched but alive" reaches a buddy the same day.
- **Lost events:** a POST that fails is lost, since neither app queues it. The heartbeat and R0 make the loss show as "offline" or "feeder down", never as a confirmed silence.
- **Run failures:** a failed run shows Error in the Runs tab and the next hourly run repeats the check. Schedule credentials expire every 14 days ([Gemini Enterprise][ge-unattended]) and are refreshed on 10 November, so they outlast assessment (11–14 November).
- **Approval latency:** a case waits in Needs Review until the author clicks, and a 02:00 silence waits for the 08:00 run. Each case logs opened, approved and sent times, and the README promises "noticed within the day", not rescue.
- **Wrong account type:** if the licence lands on consumer `@gmail.com` accounts, Drive and Gmail connectors return 403 ([Gemini Enterprise][ge-accounts]). The only alternative path, the Supabase connector, is preview, so that case is a stop, not a fallback.

### Connectors and platform check

| Connector               | 1P or 3P | Stage | Mode                                              | Job                                               |
| ----------------------- | -------- | ----- | ------------------------------------------------- | ------------------------------------------------- |
| Google Drive and Sheets | 1P       | GA    | Read: Get cell values, federated                  | Rules, status and days tabs in                    |
| Gmail                   | 1P       | GA    | Read; Send message                                | Replies and away notes in; nudge, buddy, note out |
| Jira Cloud (Free)       | 3P       | GA    | Create issue, Create comment, Change issue status | One case per silence, with its timeline           |

All three are listed as GA with these actions ([Gemini Enterprise][ge-actions]). Platform checks: the Sheet must sit in the licensed Workspace domain ([Gemini Enterprise][ge-accounts]); Jira comments and status changes are listed but unproven until they run in the app, and the fallback is create issue only; one run is not necessarily one query against Standard's 160 a day ([Gemini Enterprise][ge-limits]).

### Cloud, IoT and network

- **Cloud:** the Gemini Enterprise workflow judges every rule each hour, opens and closes Jira cases, and drafts every message; Apps Script and a Sheet are the feeder. Without the workflow there is no decision and no audit trail.
- **IoT:** the phone is the sensor: its unlock, charger, app and alarm events are the only evidence of a person, and its heartbeats are evidence of the device. The Pi 5 is a network probe, not on the critical path.
- **Network:** every row carries its own delay, the Pi logs round-trip times every 10 minutes, and the rule branches on what the network shows: a missing heartbeat sends the case down the softer offline path, and a feeder gap stops all cases.

### Real data and privacy

- **Live only:** events from the team's own phones and any recruits' phones, the Pi's probes, real emails, and deliberate silences (a teammate really leaves the phone untouched; the case is labelled "deliberate silence"). No replayed, mocked or synthetic data; Khabar uses no location, so mock GPS never arises. A failed source shows its error.
- **PDPA:** the Act's consent, notice, retention and security principles cover processing "in respect of commercial transactions", and the 2024 amendment added biometric data, "any personal data resulting from technical processing" of behavioural and other traits, to sensitive data ([judging](/docs/research/judging.md#malaysias-pdpa-and-the-2024-amendment)). **Inference:** a timestamped unlock history could be read that way, so raw events are deleted after 14 days, each day is reduced to a first-sign time and a state, and no profile or "usual hour" model is built.
- **Consent:** the Form response is the student's consent record and the buddy's "yes" is theirs; adults (18 and over) only. Either can opt out by email, which deletes their rows the same day.
- **Never stored or sent:** location, Wi-Fi network names (a join is sent as "home"), app or notification content, step counts beyond "steps > 0", and any wellbeing wording. A buddy notice carries a time and nothing else.
- **Operator exposure:** the approver sees a code, a last-sign time and a state for every case; this is a real exposure, and the README says so. No APU system, premises or staff are touched.

## Why people will use it

People already pay, rebuild and keep pacts for this: Demumu's buyers, Snug's daily users, QuietOK and the charging-event builder, and the r/LivingAlone friend who calls after three missed days ([everyday][ev-alone]). What each existing option leaves:

| Option             | What it does                                                                                                                            | What it leaves                                                            |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Apple Check In     | Timer or trip; "you'll receive a prompt and have 15 minutes to respond"; Limited shares location, battery and signal ([Apple Check In]) | Started per trip; "iOS 17 or later for both the sender and the recipient" |
| Pixel Safety Check | A timer "from one minute to 8 hours"; contacts get "a text that shares your current location on Google Maps" ([Pixel safety])           | A timer you start; location shared                                        |
| Snug               | "Open Snug and tap the green checkmark"; missed check-ins send "your most recent location"; Dispatch is US$12.50 a month ([Snug])       | A daily tap to forget; location shared                                    |
| Demumu             | One button every two days; the contact is emailed on the third ([everyday][ev-alone])                                                   | A tap, and a delay a user called "a death notice"                         |
| QuietOK            | Passive, from steps, no location ([everyday][ev-alone])                                                                                 | iPhone only; few users                                                    |

- **No new habit:** nothing to tap, the buddy needs only email, and iPhone Shortcuts is built in. Android students must install Automate, a real step.
- **Calibrated alarms:** the student hears first, the buddy only when the phone is alive but untouched, and the false-alarm rate is published. **Inference:** this answers the main complaint against tap apps; it is unproven until the team's own phones show it.

[Apple Check In]: https://support.apple.com/guide/personal-safety/use-check-in-for-messages-ips56b5bc469/web
[Pixel safety]: https://blog.google/products-and-platforms/devices/pixel/google-pixel-phone-watch-safety-features/
[Snug]: https://www.snugsafe.com/

## Why the crowd won't build it

- **Wellbeing is nearly absent:** student wellbeing holds 0.5% of 780 simulated ideas and sits in the "Absent" tier, and its typical stack is wearables or Wi-Fi signals, not the student's own phone events ([competition][comp-tiers]).
- **The near neighbour is campus hardware:** campus safety (5.5%, Crowded) means smoke, gas or seismic sensors on campus ([competition](/docs/research/competition.md#crowd-map)). A reviewer could still file Khabar there.
- **The crowd fakes data and skips connectors:** "simulate", "mock", "synthetic" or "dummy" appears in 98% of Claude's, 78% of ChatGPT's and 30% of Gemini's responses, and Jira or Gmail in at most 2% ([competition](/docs/research/competition.md#what-the-crowd-structurally-misses)).
- **Conceded:** check-in apps are a crowded clone space worldwide ([everyday][ev-disconf]). Khabar's difference is the passive rule on both platforms, student-first escalation and a published false-alarm rate, not the idea.

## Off-campus fit

Passes. The critical path is the team's phones at home, Apps Script, a Sheet in the licensed Workspace domain, the Gemini Enterprise workflow, Gmail and Jira Cloud Free. It needs nobody at APU, no APU staff action and no APU system; the Pi 5 is optional. It rests on one assumption the matrix also makes: a licence arrives on a supported Workspace domain. Recruited students add evidence but aren't needed for the loop.

## Scores

**65.9 / 100, rank 7 of 18** in the [cross-set ranking](/docs/ideas/00-ranking.md); it passes every gate, with G2 and G3 conditional. Scored on 5 November 2026 on the [matrix](/docs/ideas/00-ranking.md#scoring-matrix) by three independent scorers who read this doc and checked its claims: an NTT DATA forward deployed engineer (FDE), an APU School of Technology IoT lecturer, and a Google Cloud advocate who is also an APU student. Models: FDE (Claude Sonnet 5.5), Lecturer (Claude Fable 5.1), Advocate (Claude Opus 5.5). Day-to-day workflow and theme take the lowest score; the rest take the mean.

| Component           | Weight | FDE | Lecturer | Advocate | Used | Lowest scorer's reason                                                                                                                                       |
| ------------------- | -----: | --: | -------: | -------: | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Impact              |     13 |   2 |        3 |        2 | 2.33 | No APU office or group owns it, no APU student count, and the event is rare, so this week only false-alarm and latency figures on the team's own 2-5 phones. |
| Connectors          |     13 |   4 |        4 |        4 |    4 | Drive/Sheets reads, Gmail reply reading and sending, and Jira case writes are GA and used, though the 3P Jira is a case log rather than a decision input.    |
| Day-to-day workflow |     13 |   4 |        5 |        4 |    4 | Hourly 08:00-23:00 schedule with R0-R6 rules, heartbeat and feeder-down handling and one approval; every case waits on one author's click.                   |
| Research            |     13 |   2 |        3 |        2 | 2.33 | One Malaysian X ask and foreign viral apps (60,989 likes confirmed) are cited, but the doc admits no APU demand and the cold-stranger interviews are weak.   |
| Time to impact      |     13 |   3 |        4 |        3 | 3.33 | Immediate first value on team phones with a dated 3- and 6-month plan, but the named owner is the team and no society has been asked.                        |
| Theme               |     10 |   4 |        4 |        4 |    4 | Real phone unlock, charger and heartbeat events with per-row delay, plus a Pi probe, make IoT and network visible.                                           |
| Originality         |      9 |   3 |        3 |        3 |    3 | Wellbeing is an absent tier, but Apple Check In, Pixel Safety Check, Snug and Demumu are documented incumbents the doc concedes.                             |
| Real use            |      6 |   3 |        3 |        3 |    3 | Passive-check builders and a living-alone pact are cited, but local demand is thin and Android needs a new Automate install.                                 |
| Buildability        |      5 |   3 |        4 |        4 | 3.67 | Two phone platforms with untested locked-phone triggers, Apps Script, Jira and a hourly workflow is feasible but fiddly.                                     |
| Demo                |      5 |   3 |        4 |        4 | 3.67 | A reviewer can post one curl event, but the nudge arrives only after the hourly run and the author's approval.                                               |

- **Gates:** G1 pass (3 pass, 0 conditional, 0 fail); G2 conditional (2 pass, 1 conditional, 0 fail); G3 conditional (2 pass, 1 conditional, 0 fail); G4 pass (3 pass, 0 conditional, 0 fail).
- **Off-campus gate, per the lowest scorer:** Team phones, Apps Script and a home Pi; no campus presence or APU staff action.
- **What would help most, per the lowest scorer:** Run the 72-hour false-alarm test on every teammate's phones starting 6 November and publish n and the false-alarm rate before pitching the rule.

## Research plan

Remote, with no APU staff ([communities](/docs/research/everyday.md#communities-found), [recruiting](/docs/research/everyday.md#what-recruiting-looks-like-there)).

- **Interviews (6 to 8, Friday 6 and Saturday 7 November):** reply in public, then move to DM, to people who already posted: the Malaysian X poster, the incoming APU student who wanted a unit alone, and the APU friend-seeking posters. These are cold strangers, so add warm contacts who live alone from teammates' intake WhatsApp groups. Ask: who would you want told, after how long, what must never be shared, would you name a buddy.
- **Timed observation (Sunday 8 November):** one teammate's full day of events against their own diary, timing "last real touch" against "last recorded sign" to bound the blind spot.
- **Survey (Sunday 8 November):** 10 questions once in r/malaysiauni (about five survey posts a day compete; swaps or small Touch 'n Go payments are the norm) and in intake groups: live alone, who would notice, acceptable delay, tap or passive, location never or sometimes.
- **Items with ground truth:** each person-day is one item, labelled by the person's one-line diary ("fine, used phone by 09:10"). A false alarm is a case opened while the person was fine, unless the silence was deliberate; precision is correct cases over all cases, and recall is deliberate silences caught over deliberate silences. The same people also tap a daily button (a home-screen shortcut posting `tap`) as a Demumu-style baseline, so "forgot to tap" misses are counted against the passive rule's false alarms on the same days. About 10 to 40 person-days exist by the morning of 10 November, depending on team size and recruits, and 40 to 60 by 13 November only with recruits; zero false alarms over 40 to 60 person-days bounds the rate at about 0.35 to 0.53 per person-week. The write-up states n.

## Time to impact

- **By 10 November, owner the team:** 2 to 5 teammates' phones and any recruits on real days, the team as operator, and up to 80 hourly runs of history if the licence is live from 6 November.
- **By 10 February 2027 (3 months), owner the team:** 30 students with a confirmed buddy, recruited through the team's intake groups and student societies contacted online; false-alarm and latency figures published monthly. If a society's welfare lead agrees, they become the approver.
- **By 10 May 2027 (6 months), owner whoever approves:** 100 students, adding the new intake; continue only with fewer than 1 buddy-level false alarm per person-month and a median under 3 hours from window end to buddy notice.
- **What must be true:** the sponsored licence, or a paid Standard seat from $30 a month ([Gemini Enterprise](/docs/research/gemini-enterprise.md#gemini-enterprise-editions-and-prices)), continues past the hackathon on a Workspace domain the team controls; the author refreshes credentials every 14 days and approves daily; no APU system changes are needed.

## Demo and review

Video (about 3:45, recorded from the live system and labelled with its capture date, following the [minute plan](/docs/research/judging.md#minute-plan)):

1.  **0:00** The Malaysian ask (14 likes, 13 replies) and the "forgot to check in" complaint; one line: no tap, no location, your rule.
1.  **0:30** A rules row and the phones: the Automate flow and the Shortcuts automations each post one event; the events tab fills with per-event delay; the Pi probe's round-trip times.
1.  **1:15** The owner's Runs tab: days of hourly runs, nearly all "no action".
1.  **1:45** A real deliberate silence: the run after window end opens `KHB-n`, Needs Review, the author approves, the nudge arrives; an hour later the buddy notice; the teammate unlocks and the next run closes the case and tells the buddy.
1.  **3:00** The numbers with n: person-days, false alarms against the daily-tap baseline, minutes to notice, approval latency; what is never stored.

**Reviewer path (11–14 November):** the README's "How to review" gives the Apps Script URL, a one-line `curl -L` POST and an iPhone Shortcut. A reviewer posts one event with a reviewer code (`review-1` to `review-10`) and their own email; the reviewer rule opens a case after 10 minutes of silence and needs no buddy consent, since the reviewer is their own buddy. The next hourly run between 08:00 and 23:00 MYT drafts the nudge, which reaches them once the author approves; posting again closes the case at the following run. It takes up to an hour plus the approval wait, and the README says so. A reviewer with a seat can also be shared the workflow and run a preview, seeing their own runs, not the owner's ([Gemini Enterprise](/docs/research/gemini-enterprise.md#reviewer-access)).

## Build plan

| Day        | Work                                                                                                                                                                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Thu 5 Nov  | Apps Script `doPost`, the Form and Sheet tabs with the delay column; Automate on one Samsung and one other Android, Shortcuts on one iPhone; Pi probe; licence and account-type questions to the organisers; first recruitment replies |
| Fri 6 Nov  | 72-hour false-alarm test starts at 09:00 on every teammate's phone, with diaries and the daily-tap baseline; Jira Cloud Free project; workflow R0 to R4 if the licence is live; interviews 1 to 3                                      |
| Sat 7 Nov  | Needs Review tested end to end; Gmail reads of replies, away notes and buddy consent; interviews 4 to 8 and the interview kill decision; recruits onboarded with one email                                                             |
| Sun 8 Nov  | Deepavali; registration closes at 23:59, so confirm every member by noon. Survey posted; timed observation; 48-hour interim read; R6 Sunday note at 18:00 if green                                                                     |
| Mon 9 Nov  | Replacement holiday. 72-hour test closes at 09:00 and the go or stop decision is made; deliberate silences recorded for the video; precision and recall sheet; feature freeze at noon                                                  |
| Tue 10 Nov | Refresh schedule credentials; README (five points, connector table, diagram, privacy, how to review), deck and video; final numbers with n; submit early in the day                                                                    |

If the licence isn't live by Saturday, the feeder, status tab and test still run on real events, but the deciding step doesn't exist until it arrives, and the README says so.

## Risks and kill criteria

1.  **False alarms (fatal if unchecked):** a vendor-killed Android app (Samsung stops unused apps after 3 days, [IoT and network][iot-android]), an iPhone owner who sleeps unplugged and opens no chosen app, or a phone left at home. Student-first nudges, the heartbeat gate and the 24-hour offline wait limit what reaches a buddy, but one bad week can end an arrangement.
1.  **No owner:** no APU office or society owns Khabar; the team operates it, and nothing in the plan depends on a society signing.
1.  **Thin, non-local demand:** one Malaysian ask and a Chinese viral app; the interviews are the real test.
1.  **Reach:** students without a friend to name, the loneliest ones, can't use it ([everyday][ev-lonely]).
1.  **One approver and latency:** a case waits for the author's click and for the 08:00 run; a reviewer may find "within the day" too weak.
1.  **Platform:** the licence's account type, quotas for 16 runs a day, and Jira comment and status actions in a workflow.

**Kill criteria.** Interviews, by Saturday 7 November: fewer than 3 of the interviewees who live alone say they would set up a no-tap rule naming a buddy. False alarms, by 09:00 on Monday 9 November: across the 72-hour test on real phones (at least one iPhone and two Androids, one a Samsung, including idle overnights unplugged), more than 1 false alarm per person-week, which on 5 phones means 3 or more, or any buddy notice sent while the person was fine. Either stops the build. The 48-hour read on 8 November is a warning only, since it misses a weekend rhythm and an overnight on each phone.

## Not verified

- Automate's Device unlocked, Power source plugged and Time await blocks firing on a locked phone, and its 03:00 heartbeat inside Doze on Samsung and Xiaomi.
- Shortcuts' Time of Day, App and Alarm automations running unattended on a locked iPhone, and reading the step count while locked.
- Whether anyone but the workflow's author can approve a paused run, and whether one Approval step covers both the Jira and Gmail actions.
- Jira Cloud Create comment and Change issue status running from a workflow node in the sponsored app.
- The licence's account type and edition, its quota use per run, and whether it continues after 14 November.
- The number of APU students who live alone, and which APU student societies exist and would take the approver seat.
- The BBC article on Demumu (the fetch was blocked again on 5 November); its facts come from the research doc's summary.

## See also

- [Khabar source doc (opus-03)](/docs/ideas/opus-03/05-khabar.md)
- [Cross-set idea ranking](/docs/ideas/00-ranking.md)
- [Hackathon brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
- [Everyday signals: living alone and check-ins](/docs/research/everyday.md#living-alone-and-check-ins)
- [IoT and network: phones beyond the browser](/docs/research/iot-and-network.md#phones-beyond-the-browser)
- [Gemini Enterprise: unattended automation and connectors](/docs/research/gemini-enterprise.md)
- [Competition: saturation tiers](/docs/research/competition.md#saturation-tiers)

[ev-alone]: /docs/research/everyday.md#living-alone-and-check-ins
[ev-loc]: /docs/research/everyday.md#location-sharing-between-friends-students-and-parents
[ev-lonely]: /docs/research/everyday.md#loneliness-and-finding-people
[ev-disconf]: /docs/research/everyday.md#disconfirming-signals-and-gaps
[iot-auto]: /docs/research/iot-and-network.md#android-automation-apps-and-termux
[iot-ios]: /docs/research/iot-and-network.md#ios-shortcuts-personal-automations
[iot-android]: /docs/research/iot-and-network.md#android-background-limits
[iot-pi]: /docs/research/iot-and-network.md#pi-to-apps-script-and-sheets
[iot-alive]: /docs/research/iot-and-network.md#services-and-watchdogs
[ge-unattended]: /docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in
[ge-actions]: /docs/research/gemini-enterprise.md#actions-and-write-back
[ge-accounts]: /docs/research/gemini-enterprise.md#edition-and-account-limits
[ge-limits]: /docs/research/gemini-enterprise.md#platform-constraints-and-design-consequences
[comp-tiers]: /docs/research/competition.md#saturation-tiers

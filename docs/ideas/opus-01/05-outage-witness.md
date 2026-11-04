# Outage Witness

Outage Witness turns spare phones left on chargers in APU's residences and campus blocks, plus public network probes across Malaysia, into an independent, timestamped register of power, Wi-Fi, and Moodle outages. A lecturer or the Extenuating Circumstances (EC) office emails it a site and a time window and gets a witnessed answer with record IDs in minutes; a residence warden forwards a "resolved" fault and learns whether the fix held for 72 hours. APU's own rules reject network-failure claims without timestamped evidence and refuse self-certification, yet no independent record of APU's outages exists today.

Contents:

1.  [At a glance](#at-a-glance)
1.  [Problem and evidence](#problem-and-evidence)
1.  [How it works](#how-it-works)
    1.  [Day-to-day workflow](#day-to-day-workflow)
    1.  [Connectors and actions](#connectors-and-actions)
    1.  [Cloud, IoT, and network](#cloud-iot-and-network)
    1.  [Real data](#real-data)
1.  [Why people will use it](#why-people-will-use-it)
1.  [Why the crowd won't build it](#why-the-crowd-wont-build-it)
1.  [Scores](#scores)
1.  [Research plan](#research-plan)
1.  [Time to impact](#time-to-impact)
1.  [Demo and review](#demo-and-review)
1.  [Build plan](#build-plan)
1.  [Risks](#risks)
1.  [See also](#see-also)

## At a glance

- **Track:** Intelligent Automation & Digital Transformation.
- **Who it's for:** lecturers and Academic Mentors who receive "my connection failed" reports, the Office of Extenuating Circumstances Claims that decides them, and residence wardens who close power and Wi-Fi faults.
- **Owner:** Academic Administration's Office of Extenuating Circumstances Claims, which decides claims. After handover, Accommodation holds the residence probes and Technology Services the campus probes.
- **Trigger:** an evidence request emailed to the Witness inbox (Gmail event), plus an hourly schedule that keeps the register and the 72-hour watches current.
- **Decision:** one question, asked by both kinds of user: was an outage or degradation independently witnessed at this site or service during this window? The answer is "observed", "not observed at a covered site", or "no coverage".
- **Action and human gate:** the workflow drafts the reply, a Jira case note, and register entries; the register steward approves each one before it reaches anyone or enters the register.
- **Metric:** minutes to verify a network-failure report, against a timed baseline; precision and recall of verdicts on 30–50 real windows; share of "resolved" residence faults that recur within 72 hours.
- **Weighted score:** 72 out of 100 in the [ranking](00-ranking.md); the per-component reasoning in [Scores](#scores) totals 73.

## Problem and evidence

APU's EC rules, read through the public Confluence REST API without logging in on 4 November 2026, make timestamped, independent evidence the deciding factor for network-failure claims:

- **Network failure needs a timestamp:** "evidence of the network issue with appropriate time stamp and screen shots must be provided along with any related engagement with the concerned lecturer or invigilation staff, without which the claim will be rejected" ([What happens when IT equipment fails?][kb-it], AA page 2229272659, current, version 1 of 21 December 2022).
- **Wide failures can earn an extension:** "If a significant number of computers were out of action for several hours then this might form the basis for granting a short extension", and the student "should request the Technical Assistant to countersign" the claim (same page).
- **Self-certification is refused:** claims "must normally be supported by relevant and independent documentary evidence", and "The University will not accept self-certification of your own circumstances or other evidence which is not supplied by an independent authority" ([documents needed][kb-docs], AA 221152216).
- **No evidence means finding a witness:** "try to find an independent person, organization or support service that can provide verification" ([What if I have no evidence?][kb-noevid], AA 2229338213).
- **The clock is short:** claims go in "no more than 3 days after the extenuating circumstances occurred" ([How do I submit EC?][kb-submit], edited 9 January 2026), and the EC meeting "will be held every two weeks" ([EC status][kb-status]).
- **Faking is costly:** falsified evidence goes to the Academic Dishonesty Regulations, and "Personal computer or printer problems" are not grounds ([grounds not considered][kb-grounds]). The [Office of Extenuating Circumstances Claims][kb-who] decides each claim.
- **Why a reader may see "Page not found":** deep links under `kb.apu.edu.my` return 404, while the same pages open at `apiit.atlassian.net/wiki` (HTTP 200, rule text present, 4 November 2026). Cite the `apiit.atlassian.net` URLs.

The pain behind the rule, from public posts:

- **Wi-Fi and core platforms:** "Moodle and APspace constantly crashing. Need for better/New servers." (Google Maps, 2 stars, 18 June 2026); "It's got the worst WiFi connection among all the universities in Malaysia" (1 star, 29 October 2026); an on-campus resident "Cant even make a whatsapp video call" (1 star, 17 September 2026). The theme ranks 5th of 15 themes on review sites and other platforms ([other platforms][sop-wifi]).
- **Reddit:** five APU threads from 2025–2026 complain about Wi-Fi, including "The wifi hilang kadang2 and or is just genuinely slow gila" (5 June 2025, 69 points) ([Reddit][red-wifi]).
- **APU concedes congestion:** its own KB explains slow Wi-Fi "when many students are using Microsoft Teams in the same area, such as large classrooms" ([Wi-Fi congestion page][kb-teams]).
- **Residence faults and non-closure:** "three whole-floor power cuts, five dead sockets" in seven months at Satellite Campus Residence (Google Maps, 1 star, 3 November 2026); "despite reporting these problems, no one came to fix anything" (1 star, 9 July 2025); residence upkeep ranks 2nd and admin replies and handoffs 1st ([residence upkeep][sop-res]).
- **Closure is the chore elsewhere too:** facilities managers say the drain is "the follow-ups and status tracking … Is the PM done? Why is this still open?", and "the real test isn't whether you can see a live feed it's whether you can pull up a recording from last tuesday" ([facilities threads][red-fm]).

No independent record of APU outages exists:

- `status.apu.edu.my` doesn't resolve, and the KB has no service-status page. The Wayback Machine holds 1,363 APSpace captures since 2025 with no 5xx responses, and 23 APU searches on X found no first-hand Moodle or APSpace complaint ([X research][x-apu]). The vendor's account of the Moodle 4.5 upgrade says production went into maintenance mode, without a date ([Pukunui]).
- **Today's workaround:** the student's own screenshot, which the rule treats as self-certification; a classmate's word; or a Technical Assistant's countersignature. Residents rely on Virtual Help Centre tickets and a WhatsApp group the warden made admin-only ([residence upkeep][sop-res]).
- **Precedent:** the Australian National University lists "evidence you are customer of an Internet Provider Service that experienced a wide-spread internet outage" as accepted documentation ([ANU EC page]), so outage records are an accepted evidence type elsewhere.
- **Frequency and volume:** network-failure claim counts are not public. **Inference:** every assessment week produces some, and one service-wide record can answer every claim in its window at once; the research plan asks the EC office for real counts.

[kb-noevid]: https://apiit.atlassian.net/wiki/spaces/AA/pages/2229338213
[kb-status]: https://apiit.atlassian.net/wiki/spaces/AA/pages/221054232
[kb-grounds]: https://apiit.atlassian.net/wiki/spaces/AA/pages/2229469321
[kb-who]: https://apiit.atlassian.net/wiki/spaces/AA/pages/2229272695
[kb-teams]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2291695772
[sop-wifi]: /docs/research/social.md#wi-fi-power-and-core-platforms
[red-fm]: /docs/research/social.md#facilities-approvals-follow-ups-and-proof-of-work
[Pukunui]: https://pukunui.com.my/asia-pacific-university-technology-innovation/
[ANU EC page]: https://anu.edu.au/students/program-administration/assessments-exams/extenuating-circumstances-application

## How it works

### Day-to-day workflow

1.  **Probes (unattended):** spare phones stay plugged in at each site: a floor's common kitchen and study lounge at Satellite Campus Residence, public areas in campus blocks. A probe page on GitHub Pages keeps the screen on with a wake lock and, every 60 seconds, records the charging state, the connection type, and timed fetches of Moodle (`lms2.apiit.edu.my`), APSpace, and a control URL. Readings queue on the phone and post to an Apps Script web app; when the link is down they buffer and arrive later with their device timestamps.
1.  **Feeder (unattended):** Apps Script appends each heartbeat with its receipt time. A 5-minute time trigger runs Globalping HTTP checks of Moodle and APSpace from three Malaysian networks, plus its own checks from Google's network, writes error rows when a check fails, and rebuilds each probe's state intervals ("P07 not charging 21:02–21:47"). It never decides that an outage happened.
1.  **Request (event):** a lecturer forwards a student's report, the EC office asks about a window, a student checks before filing, or a warden forwards a "resolved" notice. Gmail's "When an email is received" trigger starts the request workflow within 5–10 minutes ([triggers][ge-trig]). If the site or window is missing, a **Request info** step asks ([workflows][ge-wf]).
1.  **Decide (unattended):** a Gemini agent node reads the intervals, vantage rows, and the editable rule Sheet live through the Drive connector's Sheets actions ([actions][ged-act]), searches the matching Globalping measurements by ID ([Globalping][ged-gp]), groups intervals across probes and sources, and applies the witness rules below. It writes a verdict with the record, probe, and measurement IDs, and never says a claim is false.
1.  **Approve (the one gate):** the reply and the Jira case (`EVID-n`) wait in **Needs Review** until the register steward approves; connector writes from a workflow require human review anyway ([unattended runs][ge-un]). Then the reply goes out and the case is filed.
1.  **Watch (hourly, unattended):** the hourly workflow reads open watch cases in Jira, checks each watched site for a recurrence since the fix time, and drafts "recurred" (with the episode) or, at 72 hours, "held" for the warden. It never reopens APU's own ticket; the warden decides.
1.  **Register (daily at 08:00):** the same scheduled workflow drafts yesterday's episodes and a probe-health line ("P11 silent since 14:20") for approval, then writes them to the published register tab, which is the citable record. Schedules run on the author's credentials, refreshed every 14 days ([unattended runs][ge-un]).
1.  **Close the loop:** the EC officer records the claim outcome on the Jira case, and the warden's watch case closes as held or recurred. Those outcomes are the labels for monthly precision checks.

**Witness rules,** kept in an editable Sheet the owner can change:

- **Quorum:** a site episode needs at least two probes, and a majority of the site's live probes, in the same failed state with onsets within 60 seconds. One device never corroborates anything.
- **No self-witness:** the register takes readings only from enrolled probes. It has no upload path for a claimant's screenshots or logs, and probe custody moves to Accommodation and Technology Services after handover so that no student hosts a probe. Two probes on one power strip or in one room count as one.
- **Unplug check:** as in GridWatch, a probe that moves when it stops charging is marked "likely unplugged" and excluded ([Grid Watch]).
- **Cross-source:** a service episode needs at least two Globalping probes on two different Malaysian networks failing the same check in the same 5-minute slot, plus a failure from Google's network or an APU-site probe. A site network episode needs the site's probes failing both Moodle and the control URL while still charging. A provider episode needs at least two Globalping probes on the claimant's provider failing the control URL.
- **Degradation counts:** when at least two vantage networks see a check take more than three times its 7-day median for two consecutive slots, the episode is a "degradation window". A fixed 2-second threshold applies until three days of history exist.
- **Coverage:** a site counts as covered only if at least two of its probes reported normally in the 10 minutes before the window; otherwise the answer is "no coverage", never "not observed".

**Inference:** grouping a few dozen intervals per day against written rules is within a Gemini agent node's reach, and the precision and recall test below checks it.

### Connectors and actions

| Connector                      | 1P, 3P, or MCP        | Mode                          | Job                                                                                                           |
| ------------------------------ | --------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Gmail                          | 1P, GA                | Trigger, read, write          | The Witness inbox: requests start the event workflow; approved replies go out                                 |
| Google Drive with Sheets       | 1P, GA                | Read, write                   | Reads heartbeats, intervals, vantage rows, and the rule Sheet live; writes approved register rows             |
| Jira Cloud (Free)              | 3P, GA                | Read, write, optional trigger | A case per request and per watch, searched hourly; holds EC outcomes; stands in for APU's Virtual Help Centre |
| Globalping                     | 3P, preview           | Read                          | Searches the team's own Moodle and APSpace measurements for the window and cites their IDs                    |
| Globalping MCP server (add-on) | MCP, custom MCP store | Read                          | Runs a fresh HTTP check from Malaysian networks when a request asks about "right now"; off the critical path  |

- **No Microsoft 365:** the team can't get a tenant, so the pilot uses Google Workspace and Jira. **Inference:** APU runs Microsoft 365 and its Virtual Help Centre on Atlassian ([APU systems][apu-sys]), so handover swaps Gmail for an Outlook shared mailbox and Sheets for a SharePoint list (both GA) and points the Jira connector at APU's own site.
- **Platform fit:** event triggers on Gmail and Jira Cloud and cron schedules are documented ([triggers][ge-trig]); Sheets cell reads and writes have been GA through the Drive connector since 12 October 2026 ([actions][ged-act]); Approval and Request info steps exist for workflows ([workflows][ge-wf]); the Globalping connector is federated and read-only ([Globalping][ged-gp]). The custom MCP store needs Streamable HTTP with OAuth and an organisation policy lifted ([custom MCP][ged-mcp]); Globalping's server answers at `https://mcp.globalping.dev/mcp` with OAuth.

[apu-sys]: /docs/research/apu.md#systems-apu-runs

### Cloud, IoT, and network

- **IoT, phones as power and network sensors:** the Battery Status API (`navigator.getBattery()`, `charging`, `chargingchange`) works in Chrome 38+ on desktop and Android, Edge, Samsung Internet, and Android WebView, needs a secure context since Chrome 103, was removed from Firefox after version 52, and never shipped in Safari or on iOS (MDN browser-compat-data 8.1.8, fetched 4 November 2026). `navigator.connection.type` reports Wi-Fi or cellular only in Chrome for Android. Screen Wake Lock works in Chrome 84+, Firefox 126+, and Safari 16.4+, fully on iOS from 18.4.
- **Design around Android-only power sensing:** Android phones are the power probes. iPhones run the same page as network probes, and report power through a Shortcuts automation on Apple's documented "Charger: Is Connected / Is Disconnected" trigger, which posts the event when the phone has mobile data ([Shortcuts triggers]). Where no spare Android phone exists, a mains-only board such as a Pico 2 W on a USB plug can only fall silent when power goes; silence then counts as power loss only if a phone at the site stays online.
- **4G fallback:** one probe per residence site carries a prepaid data SIM, so when the floor's Wi-Fi dies with the power, Android switches to mobile data, reports arrive in real time, and `connection.type` reads "cellular", which separates "power and Wi-Fi down" from "Wi-Fi down". Probes without a SIM buffer, and the gap itself is the signal.
- **Network, the measured thing:** Globalping lists 44 probes in Malaysia, seven on TM in Kuala Lumpur plus Maxis, TIME, DiGi, and U Mobile. They test Moodle and APSpace over HTTP every 5 minutes, because ICMP to Moodle is blocked (100% ping loss from three probes on 4 November). Every heartbeat carries device time and receipt time, so delay and buffered backlogs are visible.
- **Cloud:** GitHub Pages serves the probe page; Apps Script receives heartbeats and runs the 5-minute checks under Workspace quotas (6 hours of trigger runtime and 100,000 URL fetches a day; about 2,300 fetches a day here) ([quotas][ged-quota]); Gemini Enterprise workflows do the grouping, deciding, and drafting; Jira holds cases.
- **What a reviewer sees:** a phone on a charger showing its state; the register Sheet with per-reading delay; a buffered backlog landing after Wi-Fi returns; Globalping rows from named Malaysian networks; the Runs tab with hourly runs over several days; and a reply whose record IDs trace back to readings.
- **Prior art, and its lesson:** in Accra, DumsorWatch phones showed that "uncoordinated smartphones experiencing charge state changes at the same time correlate with ground truth grid reliability measurements", and the app queued data while offline ([DumsorWatch chapter], [DumsorWatch]). Within 3 months it caught only about 10% of the outages it had at the start, because participants uninstalled the app from their own phones and Android curbed background services, while dedicated plug-in sensors "regularly remained plugged in". Hence dedicated spare phones in common areas, a foreground page instead of a background app, and a steward who watches probe health.

[Shortcuts triggers]: https://support.apple.com/en-my/guide/shortcuts/apde31e9638b/ios
[DumsorWatch chapter]: https://nline.io/docs/klugman22developmenteng.pdf

### Real data

| Source                                            | Live or replayed        | Cadence             | Licence or terms                                                                | Smoke test on 4 Nov 2026 (MYT)                                                                                  |
| ------------------------------------------------- | ----------------------- | ------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Probe heartbeats from team and volunteer phones   | Live                    | 60 s, buffered      | Team-owned; hosts sign a notice; site label only                                | Not built yet; first probe due 4 Nov                                                                            |
| Globalping HTTP checks of Moodle and APSpace      | Live                    | 5 min               | Free API: 250 tests an hour anonymous, 500 with an account; kept up to 6 months | 00:23: HTTP 200 from 4 Malaysian probes each; Moodle 83–181 ms, APSpace 29–288 ms; ping 100% loss, so HTTP only |
| Globalping probe list                             | Live                    | Each run            | Same                                                                            | 00:23: 5,387 probes online, 44 in Malaysia                                                                      |
| Direct checks from Google's network (Apps Script) | Live                    | 5 min               | APU Terms of Use; HEAD requests, no login                                       | 00:23 (curl): Moodle login page 200 in 0.19 s, APSpace 200 in 0.31 s; `status.apu.edu.my` doesn't resolve       |
| Control URL `www.gstatic.com/generate_204`        | Live                    | 60 s                | Google                                                                          | 00:23: 204 in 0.13 s                                                                                            |
| APU KB EC rule pages (AA space)                   | Live, checked on change | Daily version check | APU Terms of Use; written permission needed                                     | 00:16: REST API 200, all current; logged-out web page 200 with the rule text; `kb.apu.edu.my` deep link 404     |
| TNB Power Alert planned notices, KL Selatan       | Live                    | Daily               | TNB terms bar storing or linking without written consent                        | 00:25: 200; 325 planned notices in WP Kuala Lumpur for 1 Oct–30 Nov, 86 in KL Selatan; off until TNB consents   |
| Globalping MCP server (add-on)                    | Live                    | On demand           | OAuth with a Globalping account                                                 | 00:34: 401 with OAuth metadata, as expected without a token                                                     |

- **TNB, the power cross-check:** TNB's public information for Kuala Lumpur is a list of planned outage notices at `www.tnb.com.my/residential/power-alert`, including "BKT JALIL NO. 1" on 11 November 2026 from 12:00 for 4 hours; its outage map covers only Selangor, Melaka, Kedah, Perlis, Johor, and Kelantan. Its terms forbid storing the content or linking to the site without prior written consent, so the team asks TNB on 4 November and keeps the check off until TNB agrees. A TNB notice can only strengthen a power episode; its absence weakens nothing.
- **Sites:** Satellite Campus Residence sits inside Technology Park Malaysia next to campus, includes electricity in the rent, and has a common kitchen on each floor and a study lounge with Wi-Fi ([Satellite page][kb-sat]), so its outages can't be prepaid-meter cuts. On-campus and off-campus residences pay as they go through prepaid smart meters, which cut power when the balance runs out ([residence policies][kb-pol], [prepaid meter][kb-meter]); a cut in one unit is never a building outage under the quorum rule, and the register infers nothing about any unit's balance.
- **Will there be enough real events?** No public downtime history exists, so the register has to build it. **Inference:** degradation windows on campus and residence Wi-Fi, which APU's own KB and reviews describe, should supply most items; power episodes depend on luck and on the 34 planned TNB notices in KL Selatan for November. If fewer than 30 natural windows exist by 8 November, report the real n.
- **Rule on data:** live readings from the team's own phones are allowed; a video recorded from the live system and labelled with its capture date is allowed, but never instead of live access ([decisions][ctx-dec]). Staged unplug tests are real readings of real events, labelled as tests and kept out of the scored set.

[kb-sat]: https://apiit.atlassian.net/wiki/spaces/AC/pages/3778183193
[kb-pol]: https://apiit.atlassian.net/wiki/spaces/AC/pages/3777691664
[kb-meter]: https://apiit.atlassian.net/wiki/spaces/AC/pages/4045996076
[ctx-dec]: /docs/CONTEXT.md#decisions-so-far

## Why people will use it

- **The trigger already lands in their inbox:** lecturers get "my connection failed" emails, since the rule expects "engagement with the concerned lecturer"; wardens get Virtual Help Centre "resolved" notices. One forward to the Witness inbox returns a dated, signed-off answer they can attach.
- **Students check before filing:** within the 3-day window, a student checks the published register and cites the record ID in Section C of the EC e-Form, which accepts PDF and image uploads ([How do I submit EC?][kb-submit]).
- **Zero install for askers:** email and a view-only Sheet. Probe hosts open one web page on a spare phone and leave it plugged in; the daily probe-health line tells the steward which probe went quiet.
- **Habit loop:** the report arrives, the user forwards it, the answer comes back with a record ID, and each EC outcome or warden verdict sharpens the rules. **Inference:** requests bunch up in assessment weeks and after residence faults, so lecturers and wardens are the habitual users, not every student.
- **After the team graduates:** the EC office owns the decision and the rule Sheet; Accommodation holds residence probes and Technology Services holds campus probes and the app; a named steward approves drafts and refreshes schedule credentials every 14 days.

## Why the crowd won't build it

- **It isn't the Wi-Fi watch or fault-to-ticket:** Wi-Fi and network diagnosis (8.7% of 780 simulated ideas) and facilities fault-to-ticket (7.6%) are saturated, and their stack is access-point telemetry with auto-filed tickets ([saturation tiers][cb-sat]). Outage Witness diagnoses nothing and files no fault: it answers a decision-maker's question about a past window, with a refusal built in when one device is all it has.
- **No crowd cluster covers evidence for decisions:** none of the 26 clusters in the crowd map covers extenuating circumstances, claims, or closure checks ([clusters][cb-clu]).
- **The crowd fakes its data:** "simulate", "mock", "synthetic", or "dummy" appears in 98% of Claude responses, only 3% of ideas use public feeds, and only 2 of 780 name Jira, ServiceNow, SharePoint, or MCP ([crowd misses][cb-miss]).
- **Crowd check on 4 November 2026:**
  - Devpost: "dumsorwatch" 0 projects; "extenuating circumstances" 24, none about evidence; "outage witness" 14, all unrelated; "power outage crowdsourced" 5, the nearest being NEPAWatch (community power data in Nigeria) and BijliGuard (load-shedding forecasts in Pakistan).
  - GitHub: "extenuating circumstances" 6 repositories, none about outage evidence; two personal outage loggers, one "for evidence of outages" (October 2026) and one producing evidence reports for an ISP. Both are single-device self-evidence, exactly what APU's rule calls self-certification.
  - Apps: OutageWatch (crowd-reported outage map) and single-phone power monitors such as poweroutage.app. None ties several independent probes to an institution's evidence rule.
- **Name:** no product, Devpost project, or GitHub repository called Outage Witness was found; the nearest names are OutageWatch and Power Outage.

[cb-sat]: /docs/research/competition.md#saturation-tiers
[cb-clu]: /docs/research/competition.md#clusters-and-shares
[cb-miss]: /docs/research/competition.md#what-the-crowd-structurally-misses

## Scores

| Component              | Weight | Score | Reason                                                                                                                                                                      |
| ---------------------- | ------ | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impact                 | 15     | 3     | Supplies the independent, timestamped evidence APU's rules demand, for lecturers, the EC office, and wardens; claim volume unknown                                          |
| Technical build        | 15     | 4     | Gmail, Drive and Sheets, Jira Cloud, and Globalping each do a job in the loop; Globalping is preview and MCP an optional add-on                                             |
| Research depth         | 10     | 3     | Lecturers, students, and residents are reachable; the EC office isn't yet; the 30–50 windows lean on degradations                                                           |
| Time to impact         | 10     | 3     | Lecturers can use it in week one; EC acceptance and custody moves need two offices to agree                                                                                 |
| Day-to-day workflow    | 15     | 4     | Hourly schedule and Gmail events run unattended with one sign-off per outgoing statement; run history starts 5 November                                                     |
| Theme convergence      | 10     | 5     | No verdict without all three: phone power and reachability, Malaysian network vantage points and buffered delivery, Apps Script and Gemini Enterprise; sources checked live |
| Originality            | 10     | 4     | No crowd cluster or found project turns several probes into evidence for decisions; some reviewers may still file it under Wi-Fi monitoring                                 |
| Real usage             | 10     | 3     | Uses emails staff already get; probe upkeep rests on volunteers until handover; events per person are rare                                                                  |
| Demo and pitch clarity | 5      | 4     | One rule, one email, one witnessed answer; refusing a single unplug shows the anti-spoof rule in seconds                                                                    |

| Gate                                                | Result  | Why                                                                                                                          |
| --------------------------------------------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Real public data only                               | Pass    | Live probe readings, live Globalping measurements, APU's public rules; requests carry only a site and window; tests labelled |
| Buildable by 10 Nov inside Gemini Enterprise limits | Pass    | Gmail event and cron triggers, no webhook; approvals designed in; critical path on GA connectors                             |
| Core in Gemini Enterprise                           | Pass    | Grouping, cross-checks, verdicts, and wording happen in the workflows; Apps Script only collects and summarises probe states |
| IoT layer real and visible                          | Pass    | The phones' charge state and reachability are the evidence                                                                   |
| Users and owner reachable, 30–50 real items         | At risk | Lecturers, students, and residents are reachable; the EC office is unconfirmed; items depend on degradation windows          |
| Reviewer can trigger it                             | Pass    | Email the inbox, or open the probe page on any phone and unplug it                                                           |
| No-card path                                        | Pass    | GitHub Pages, Apps Script, Sheets, Gmail, Jira Cloud Free, and a free Globalping account                                     |

The strongest objection to each component, and the answer:

- **Impact:** "The EC office has no reason to accept a student-run register." The rules ask for "independent" evidence and suggest a "support service that can provide verification", and staff supporting statements strengthen claims ([documents needed][kb-docs]), so lecturers' statements come first and probe custody moves to Technology Services and Accommodation. Conceded: the effect on EC decisions is unproven until the office agrees.
- **Technical build:** "Outlook, SharePoint, and Teams can't be stood up." None is used; every connector in the table runs on accounts the team can create, and handover maps each to APU's Microsoft and Atlassian systems.
- **Research depth:** "There won't be 30–50 real outages." The items are windows, including degradations and matched quiet windows, labelled from evidence the register doesn't use. Conceded: the power class may hold fewer than five items.
- **Time to impact:** "EC policy changes take semesters." Lecturers can attach replies to supporting statements now; formal acceptance is the 6-month milestone, not the 3-month one.
- **Day-to-day workflow:** "Every write pauses for approval, so it isn't maximizing." Watching, grouping, deciding, and drafting run unattended every hour and on every email; the click is a sign-off an evidence record should carry anyway.
- **Theme convergence:** "Charging state is Android-only, so the IoT is a gimmick." Charge-state outage sensing is established in GridWatch and DumsorWatch, Chrome on Android supports it, iPhones report through Shortcuts, and the network checks run on every phone.
- **Originality:** "It's the Wi-Fi watch with a clever name." It answers questions about past windows for people making decisions and never diagnoses or files a fault; the crowd check found only single-device loggers.
- **Real usage:** "A student would never open it." Its daily users are staff who already get the emails. Conceded: volunteers must keep probes plugged in until custody moves.
- **Demo:** "With no outage during assessment, the register is empty." Degradation windows, probe-health lines, the buffered backlog, and a reviewer's own refused single unplug show it working.

## Research plan

- **First interview round (5–6 November), the problem:**
  - P1–P2: two School of Technology lecturers or Academic Mentors who have had "my connection failed" reports: how they check them today, how long it takes, and what they would sign.
  - P3: a staff member of the Office of Extenuating Circumstances Claims, reached through the organisers or Academic Administration: network-failure claims per meeting, the share rejected for no evidence, and what counts as independent. If unreachable, record the attempts.
  - P4–P5: two students who had a connection failure during an assessment, one resident and one commuter: what evidence they had and what happened.
  - P6: a Satellite Campus Residence resident from a floor with power cuts: what happens after a fault is marked resolved.
- **Second interview round (7 November, and 9 November by video call over the Deepavali holiday), the solution:** P1–P2 again with real replies from the live register; P7, a Technology Services engineer at the TechCentre (Level 6, opposite Block D), on probe custody and countersigning; P8, a warden or Accommodation officer, on the 72-hour watch and common-area sockets. Label quotes by role and keep consent records out of the repo ([consent][rai-consent]).
- **Timed baseline:** with P1 and P2, time how long it takes to decide whether to support three real connection-failure reports from this week (team members' and volunteers' own, shared with consent) using today's means: the screenshot, asking Technology Services, asking classmates. Repeat with the Witness reply and record minutes and confidence. For the warden, record how long a recurrence went unnoticed after a past "resolved", from ticket history if shared, otherwise labelled as an estimate.
- **Scoring 30–50 real items:**
  - Items are windows: every episode the register records from 5 to 9 November, plus matched quiet windows (same site, same hour, another day), until there are 30–50. The positive class is "an outage or degradation happened at this site or service in this window".
  - Two team members label each window independently, blind to the verdict, from evidence the register doesn't use: two-person site diaries (a form with site, time, and what failed; no names), an independent laptop loop logging Moodle and the control URL at two sites, and official notices. Disagreements are recorded.
  - Lead with precision, because a false "observed" could support a false claim; report recall, the confusion matrix, n, and a Wilson 95% interval per class: service, provider, site network, site power ([accuracy][rai-acc]). "No coverage" items are counted separately.
  - **Spoof tests, labelled and kept out of the set:** 10 single-probe unplugs, 5 two-probe unplugs more than 60 seconds apart, and 3 single-probe Wi-Fi-off tests; the expected number of episodes is zero.

[rai-consent]: /docs/research/judging.md#consent-and-anonymised-quotes
[rai-acc]: /docs/research/judging.md#measuring-an-agents-accuracy-honestly

## Time to impact

- **By 3 months (early February 2027):**
  - **Coverage:** at least two probes on each Satellite floor the warden approves and in four campus blocks, kept by the steward with Accommodation's and Technology Services' consent.
  - **Users:** School of Technology lecturers forward reports, and Academic Mentors attach Witness replies to supporting statements; the EC office trials Witness records as supporting evidence for network claims.
  - **Measured:** requests per week, minutes per verification against the baseline, verdict precision against EC outcomes, and probe uptime.
- **By 6 months (early May 2027):**
  - **Custody:** Technology Services takes the campus probes and the app, and Accommodation the residence probes; the inbox moves to an APU Outlook shared mailbox and cases to APU's own Atlassian site through GA connectors.
  - **Policy:** the EC e-Form lists an Outage Witness record ID as an evidence type, as ANU lists widespread ISP outages.
  - **Measured:** share of network-failure claims decided with a record, the 72-hour recurrence rate of residence faults, and outage minutes per site per month.
- **Owners:** business owner, the Office of Extenuating Circumstances Claims; IT owner, Technology Services; residence owner, Accommodation; data protection, whoever answers for PDPA at APU ([owners][rai-own]).
- **Assumptions:** the EC office and Technology Services agree in writing; APU keeps or licenses Gemini Enterprise seats; probes stay at 80% uptime or better, measured weekly; the organisers give written permission to use the KB text.

[rai-own]: /docs/research/judging.md#owners-and-what-has-to-be-true

## Demo and review

| Time      | Beat                          | On screen                                                                                                                                  |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 0:00–0:10 | Slate                         | "Recorded from the live system", with the capture date                                                                                     |
| 0:10–0:35 | Problem                       | The rule's "without which the claim will be rejected" and "will not accept self-certification"; the baseline minutes                       |
| 0:35–1:35 | One real request, end to end  | A forwarded report of a real failure from the week; the Runs tab reading Sheets and Globalping; Needs Review; approve; reply and Jira case |
| 1:35–2:00 | One device never corroborates | A probe unplugged on camera, labelled as a test: the reading lands, no episode, and the rule line                                          |
| 2:00–2:20 | The network, visible          | A probe's Wi-Fi off and on: buffered readings arrive with their delay; Globalping rows from TM, Maxis, and TIME                            |
| 2:20–2:40 | Closed means fixed            | A real "resolved" notice forwarded; the hourly run's "held" or "recurred" draft                                                            |
| 2:40–3:00 | Impact                        | Minutes before and after; precision and recall with n and interval; 3- and 6-month owners                                                  |
| 3:00–3:30 | Research                      | Eight interviews, what changed because of them                                                                                             |
| 3:30–3:45 | Team and close                | Who did what; app, repo, and video links; capture date again                                                                               |

- **A reviewer triggers it themselves:** email the Witness inbox a site and window ("Moodle from Satellite level 3, 5 Nov 21:00–21:30") or a watch ("Satellite level 3 Wi-Fi fixed at 10:00 today"), and get the reply once the steward approves. The team watches **Needs Review** from 8 AM to midnight MYT during 11–14 November.
- **Their own probe:** open the probe page on any phone as a "reviewer" site and unplug it: the register records the reading and refuses to call it an outage, because one device can't corroborate.
- **Access:** reviewers need a seat, the Gemini Enterprise User role, and the workflow shared with them; shared users see their own runs, so the README and video show the owner's Runs tab over several days ([reviewer access][ge-rev]).

[ge-rev]: /docs/research/gemini-enterprise.md#reviewer-access

## Build plan

| Day        | Build                                                                                                                                                                                | Research and operations                                                                                                             | Done when                                                              |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Wed 4 Nov  | Riskiest first: the probe page on an Android phone (charging state, wake lock, buffer) posting to Apps Script; a Sheet in the licensed Workspace domain; a draft workflow reading it | Permission requests to the organisers (KB text), Technology Services (probes), Accommodation (sockets), and TNB; Globalping account | A phone has run for 2 hours and a Wi-Fi off and on lands buffered rows |
| Thu 5 Nov  | 5-minute feeder: Globalping and direct checks, intervals, error rows; 8–12 probes at 3–4 sites; hourly workflow turned on                                                            | First interviews begin; diary form live                                                                                             | Runs tab shows unattended hourly runs                                  |
| Fri 6 Nov  | Request workflow: Gmail trigger, Request info, verdict, Approval, reply and Jira case; Globalping connector                                                                          | First interview round ends; timed baseline with P1                                                                                  | A forwarded request gets an approved reply within 15 minutes           |
| Sat 7 Nov  | Watches and the 08:00 register; iPhone Shortcuts power events; MCP add-on if the policy allows                                                                                       | Second interview round begins; baseline with P2                                                                                     | A watch case moves to held or recurred on its own                      |
| Sun 8 Nov  | Score 30–50 windows; spoof tests; tune the rule Sheet                                                                                                                                | Deepavali: remote work; confirm every member is registered                                                                          | Precision and recall written down with n                               |
| Mon 9 Nov  | Feature freeze; record the video; reviewer access test; refresh schedule credentials                                                                                                 | Second-round video calls                                                                                                            | A non-team account triggers a reply                                    |
| Tue 10 Nov | README, deck, diagram; submit early                                                                                                                                                  | Final probe-health check                                                                                                            | Submitted before noon                                                  |

- **No-card path:** every piece above is free: GitHub Pages, Apps Script and Sheets in the Workspace domain, Gmail, Jira Cloud Free, and a free Globalping account. Nothing needs Cloud Run, Pub/Sub, or a billing account.

## Risks

- **Too few real outages:** degradation windows and matched quiet windows fill the set; staged tests stay separate; report the real n rather than pad it.
- **The EC office won't treat a student-run register as independent:** verdicts are phrased as observations with raw IDs, lecturers' supporting statements are the first route, and custody moves to Technology Services and Accommodation by month 6.
- **Spoofing and collusion:** quorum, the 60-second onset rule, the unplug check, common-area placement, and no claimant uploads. The residual risk is two colluding hosts at a two-probe site, so sites aim for three probes and a majority.
- **Probe drift and theft:** theft is common in the residences ([residence upkeep][sop-res]), so use the cheapest spare phones, label them, place them where staff can see, and track silent probes in the daily register.
- **Browser limits:** Chrome may discard a tab under memory pressure; one silent probe only ever counts as "probe offline". The Battery Status API is Android-only, so iPhones need mobile data for power events. Probe pages must stay top-level on HTTPS, which is why they live on GitHub Pages.
- **Privacy (PDPA):** probes send a random ID, a site label at floor or area level (never a room), charging state, connection type, and timings; no location, names, or accounts, and Apps Script's `doPost` event carries no caller IP. Requests keep only site, window, and requester role in Jira; forwarded emails are deleted after 30 days and heartbeats after 90; hosts sign a notice; no personal data goes to free-tier AI tools ([PDPA][jp-pdpa]).
- **Permissions:** APU's Terms of Use reserve copyright, so the KB text becomes a knowledge file only with written permission ([terms][apu-terms]). Technology Services runs the network, removes non-standard access points, and allows 4 OnBoard@APU devices per user on 5 GHz ([Wi-Fi policy][kb-wpol], [OnBoard@APU][kb-onb]): ask before placing probes, send one HEAD request a minute per probe, never log in, and never use a phone hotspot as a campus uplink. TNB stays off until it consents.
- **Platform limits:** Gmail and Drive connectors need a Workspace account, not `@gmail.com` ([accounts][ged-acc]); if the licence is consumer, requests become Jira issues on the Jira Cloud event trigger and the register moves to Supabase. Every write pauses for review; credentials expire after 14 days; quota failures aren't retried, so the hourly run also picks up unanswered requests; Globalping and custom MCP are preview, so the measurement rows in Sheets keep the critical path on GA connectors ([limits][ge-lim]).
- **Read as the Wi-Fi watch:** the pitch opens with the EC rule and a decision, never with a dashboard, and the product files no fault tickets.

[jp-pdpa]: /docs/research/judging.md#malaysias-pdpa-and-the-2024-amendment
[apu-terms]: /docs/research/apu.md#terms-of-use-and-robotstxt
[kb-wpol]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2215378997
[kb-onb]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/669581410
[ged-acc]: /docs/research/gemini-enterprise.md#edition-and-account-limits
[ge-lim]: /docs/research/gemini-enterprise.md#limits-that-bite-in-a-one-week-build

## See also

- [Gemini Enterprise](/docs/research/gemini-enterprise.md) and [Gemini Enterprise data](/docs/research/gemini-enterprise.md#data-in-and-out): triggers, approvals, connectors, and live-data paths.
- [APU public documents](/docs/research/apu.md#apu-knowledge-base-on-confluence): the public Confluence KB and its terms.
- [IoT and network](/docs/research/iot-and-network.md#phone-and-laptop-sensors-in-the-browser): phone sensors in the browser and [APU campus Wi-Fi](/docs/research/iot-and-network.md#apu-campus-wi-fi).
- [Social research on other platforms][sop-res], [Reddit][red-wifi], and [X][x-apu]: the evidence of pain.
- [Crowd baseline](/docs/research/competition.md): what other teams are likely to build.
- [Research and impact](/docs/research/judging.md#minute-plan): the README skeleton and the video minute plan.
- [What happens when IT equipment fails?][kb-it] and [Safe Exam Browser FAQ][kb-seb], which says exam halls use "a dedicated SSID" where APU does "not anticipate any downtime".
- [Grid Watch: Mapping Blackouts with Smart Phones][Grid Watch] and [DumsorWatch in Accra][DumsorWatch]: the research behind charge-state outage sensing.
- [Globalping API](https://api.globalping.io/v1/spec.yaml) and [MDN browser-compat-data](https://github.com/mdn/browser-compat-data).

[kb-seb]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2925101136
[kb-it]: https://apiit.atlassian.net/wiki/spaces/AA/pages/2229272659
[kb-docs]: https://apiit.atlassian.net/wiki/spaces/AA/pages/221152216
[kb-submit]: https://apiit.atlassian.net/wiki/spaces/AA/pages/221152223
[Grid Watch]: https://patpannuto.com/pubs/klugman14gridwatch.pdf
[DumsorWatch]: https://nline.io/docs/klugman19scale.pdf
[sop-res]: /docs/research/social.md#residence-upkeep-and-theft
[red-wifi]: /docs/research/social.md#campus-wi-fi-and-network-filtering
[x-apu]: /docs/research/social.md#apus-footprint-on-x
[ge-trig]: /docs/research/gemini-enterprise.md#triggers-and-schedules
[ge-wf]: /docs/research/gemini-enterprise.md#workflows
[ge-un]: /docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in
[ged-act]: /docs/research/gemini-enterprise.md#actions-and-write-back
[ged-gp]: /docs/research/gemini-enterprise.md#network-measurements-through-globalping
[ged-mcp]: /docs/research/gemini-enterprise.md#requirements-and-registration
[ged-quota]: /docs/research/gemini-enterprise.md#free-tier-limits-that-matter

# Outage Witness

Outage Witness keeps an independent, timestamped register of when Asia Pacific University's (APU) Moodle and APSpace failed and, in its full form, when power and Wi-Fi failed on APU residence floors and campus blocks. A lecturer, a student inside the 3-day Extenuating Circumstances (EC) window, or the Office of Extenuating Circumstances Claims emails a service or site and a time window; a Gemini Enterprise workflow reads the live register and an editable rule Sheet and answers observed, degradation window, not observed while covered, or no coverage, citing Globalping measurement IDs anyone can reopen, and a steward approves the reply and its Jira case before they go out. Proposed track: **Intelligent Automation & Digital Transformation**. Caveat: the full product needs spare phones left on chargers at APU sites, which nobody on the team can place before 10 November, so this week's build is the service-scope witness only, run from the team's phones and Pi at home; nothing has been built or run yet, and **Inference** marks conclusions no source states.

Contents:

1.  [At a glance](#at-a-glance)
1.  [Origins](#origins)
1.  [Problem and evidence](#problem-and-evidence)
1.  [How it works](#how-it-works)
    1.  [Workflows](#workflows)
    1.  [Witness rules](#witness-rules)
    1.  [States and failure handling](#states-and-failure-handling)
    1.  [Connectors and platform check](#connectors-and-platform-check)
    1.  [Cloud, IoT, and network](#cloud-iot-and-network)
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

| Field                 | Full product (needs campus)                                                                                                                                                       | Build by 10 November (off campus)                                                                                                         |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Owner                 | The Office of Extenuating Circumstances Claims, which decides claims ([who decides][kb-who]); Technology Services holds campus probes and Accommodation residence probes          | A named team steward; the EC office is the target owner, not a partner this week                                                          |
| First users           | Lecturers and Academic Mentors who receive "my connection failed" reports; students inside the 3-day window; residence wardens closing power and Wi-Fi faults                     | Students checking whether Moodle or APSpace failed for everyone in a window before they file; lecturers who forward a report              |
| Track                 | Intelligent Automation & Digital Transformation                                                                                                                                   | Same                                                                                                                                      |
| Trigger               | Gmail "When an email is received" on the Witness inbox; an hourly schedule for missed requests, 72-hour watches, and the 08:00 register                                           | Same, without watches                                                                                                                     |
| Live signal           | Spare Android phones on chargers at APU sites (charge state, connection type, timed HTTPS checks, buffered offline); Globalping HTTP checks from Malaysian ISPs; Google's network | Two team Android phones and the Pi 5 at team members' homes on different ISPs, plus the same Globalping and Google checks                 |
| Connectors            | 1P Gmail and Drive with Sheets actions, 3P Jira Cloud, all GA; add-on: Globalping connector (preview) in a chat agent                                                             | Same                                                                                                                                      |
| Decision              | Was an outage or degradation independently witnessed at this site or service in this window?                                                                                      | The same question for Moodle and APSpace only                                                                                             |
| Action and approval   | The agent drafts a reply, a Jira case, and register rows; the steward approves each in **Needs Review**                                                                           | Same                                                                                                                                      |
| Reviewer self-trigger | Email the inbox a site or service and a window; or open the probe page on any phone and unplug it (refused: one device never corroborates)                                        | Email "Moodle, 5 Nov 21:00–21:30"; or open the probe page as site "reviewer" and switch Wi-Fi off and on (buffered rows land, no episode) |

## Origins

One source: [Outage Witness](/docs/ideas/opus/01/05-outage-witness.md), revised against the team's off-campus limits and three scorers' objections.

- **Kept:** the name; the witness question and its answers, including the "no coverage" refusal; the quorum, no-self-witness, unplug, cross-network, degradation, and coverage rules; buffered delivery as the visible network; the Gmail trigger with **Request info**; the steward's approval; Jira cases; the daily register and probe-health line; spoof tests; window-based scoring; and the DumsorWatch lesson that dedicated plugged-in devices outlast apps on people's own phones.
- **Changed:**
  - **Globalping leaves the decision path.** The source had the agent node search measurements through the Globalping connector, which is preview and not on Workflow Builder's connector list ([workflows][ge-wf], [Globalping connector][ge-gp]). The Apps Script feeder now calls Globalping's public API and writes each result and measurement ID to the Sheet, which the agent reads through GA Sheets actions.
  - **The critical path shrinks to service scope,** which works off campus; residence and campus probes become the full product, built only if campus access and consent appear.
  - **The Pi 5 joins as a fixed home probe,** because a phone page stops when its tab is discarded ([pages left running][iot-pages]) and the source's Pico 2 W can't arrive in time.
  - **Lighter load:** APU services get a HEAD request every 5 minutes per probe instead of every 60 seconds; the control URL stays at 60 seconds.
  - **Every reply states its scope,** so "Moodle answered normally" can't be read against a student whose own line failed.
- **Dropped:** the provider-outage rule (**Inference:** an ISP-wide outage takes that ISP's Globalping probes offline too, so they can't report it); the TNB planned-outage check, whose terms bar storing or linking without written consent; the daily check of APU's KB EC pages and their use as a knowledge file, which needs written permission under APU's Terms of Use ([terms][apu-terms]) and which the rule Sheet doesn't need; the Globalping MCP add-on; prepaid SIMs; iPhone Shortcuts power events; and, from the build, the 72-hour residence watch.
- **Objections answered:** the preview connector and APU and TNB content are off the critical path; the build no longer waits for any APU office; components fall to a probe page, a feeder, a Sheet, two workflows, and Jira.
- **Objections that still stand:** no APU site is witnessed before 10 November; EC acceptance is untested; real service failures in one week may be few, so the 30–50 items lean on degradations and quiet windows.
- **Numbers re-checked on 5 November 2026 (07:29–07:35 MYT):** Globalping listed 5,485 probes online and 45 in Malaysia (the source had 5,387 and 44), with all five networks the source named still present but only TM above two home probes; Moodle and APSpace timings are re-measured below and replace the source's; daily URL fetches are recounted at about 2,000 (the source said 2,300); Screen Wake Lock on iOS reaches only home-screen web apps from 18.4, not "fully"; the Battery Status secure-context date is dropped as unverified. The source's claim that the rule treats a screenshot as self-certification is corrected: the network rule asks for screenshots. The EC rule quotes, the Wayback count, the X query count, and the Devpost counts held.

## Problem and evidence

APU's EC rules, re-read through the public Confluence REST API on 5 November 2026 ([rules and guarantees](/docs/research/rules-and-guarantees.md#extenuating-circumstances-for-it-or-network-failure)):

- **A network failure needs a timestamp:** "evidence of the network issue with appropriate time stamp and screen shots must be provided along with any related engagement with the concerned lecturer or invigilation staff, without which the claim will be rejected" ([IT equipment fails](https://apiit.atlassian.net/wiki/spaces/AA/pages/2229272659), version 1 of 21 December 2022).
- **Wide failures can earn an extension:** "If a significant number of computers were out of action for several hours then this might form the basis for granting a short extension", and the student "should request the Technical Assistant to countersign" (same page).
- **Self-certification is refused:** claims "must normally be supported by relevant and independent documentary evidence"; "The University will not accept self-certification of your own circumstances or other evidence which is not supplied by an independent authority"; claims are "strengthened when supported by the University staff such as Academic Mentors, Programme Leaders or Lecturer" ([documents needed](https://apiit.atlassian.net/wiki/spaces/AA/pages/221152216)). Without evidence, "try to find an independent person, organization or support service that can provide verification" ([no evidence](https://apiit.atlassian.net/wiki/spaces/AA/pages/2229338213)).
- **The clock is short:** claims go in "no more than 3 days after the extenuating circumstances occurred", with uploads in Section C of the e-Form ([submit EC](https://apiit.atlassian.net/wiki/spaces/AA/pages/221152223), last edited 9 January 2026), and the EC meeting "will be held every two weeks" ([EC status](https://apiit.atlassian.net/wiki/spaces/AA/pages/221054232)). Falsified evidence goes to the Academic Dishonesty Regulations, and "Personal computer or printer problems" aren't grounds ([grounds](https://apiit.atlassian.net/wiki/spaces/AA/pages/2229469321)).

The pain behind the rule:

- **Moodle, APSpace, and Wi-Fi:** "Moodle and APspace constantly crashing. Need for better/New servers." (Google Maps, 2 stars, 18 June 2026); "It's got the worst WiFi connection among all the universities in Malaysia" (1 star, 29 October 2026); 10 of 58 low-star reviews mention Wi-Fi, internet, systems, or sockets, and the theme ranks 5th of 15 on review sites and other platforms ([Wi-Fi, power and core platforms](/docs/research/social.md#wi-fi-power-and-core-platforms)). Five APU Reddit threads from 2025–2026 complain about Wi-Fi, including "The wifi hilang kadang2 and or is just genuinely slow gila" (5 June 2025, 69 points) ([campus Wi-Fi](/docs/research/social.md#campus-wi-fi-and-network-filtering)).
- **Residence power (full product):** three whole-floor power cuts and five dead sockets in seven months at Satellite Campus Residence (Google Maps, 1 star, 3 November 2026), and "despite reporting these problems, no one came to fix anything" (9 July 2025) ([residence upkeep](/docs/research/social.md#residence-upkeep-and-theft)).
- **No independent record exists:** `status.apu.edu.my` doesn't resolve (07:30 MYT, 5 November); the Wayback Machine holds 1,363 APSpace captures since 2025, none a 5xx; 23 X queries found no first-hand 2025–2026 Moodle or APSpace complaint ([X](/docs/research/social.md#apus-footprint-on-x)); the vendor's account of the Moodle 4.5 upgrade says "the production site was put into maintenance mode", without a date ([Pukunui](https://pukunui.com.my/asia-pacific-university-technology-innovation/)). Today the evidence is the student's own screenshots, which the network rule asks for alongside lecturer or invigilator engagement but which no independent authority supplies (**Inference**), a classmate's word, or a Technical Assistant's countersignature.
- **Precedent:** the Australian National University accepts "evidence you are customer of an Internet Provider Service that experienced a wide-spread internet outage" ([ANU EC page](https://anu.edu.au/students/program-administration/assessments-exams/extenuating-circumstances-application)).

Counterevidence and limits:

- **Volume is unknown:** network-failure claim counts aren't public, and the Wayback captures show no APSpace server error since 2025. **Inference:** service-wide failures may be rare, and a week may hold few.
- **The commonest failure may be the student's own line:** one Unifi customer reports an outage "almost every week", and multi-day home outages appear on X up to 4 November 2026 ([home internet outages](/docs/research/everyday.md#water-power-and-home-internet-outages)). A service-scope witness can't see one home line, so those claims stay as hard to evidence as before.
- **Everyone-down failures may already be handled (Inference):** when Moodle fails for everyone at a deadline, lecturers notice and may extend without any claim; the register earns most where a failure is partial, short, or after hours.
- **Independence is contestable:** a student-run register may not count as "an independent authority". The answer below rests on third-party measurement IDs; the effect on EC decisions stays unproven.

## How it works

Signal to cloud: team phones and the Pi 5 POST readings over HTTPS to an Apps Script web app, which also polls Globalping and checks both services from Google's network every 5 minutes, writing everything to one Sheet in the licensed Workspace domain. A Gmail event and an hourly schedule start two Gemini Enterprise workflows that read the Sheet live, decide, and stop at one approval before a Gmail reply, a Jira case, and a register row.

### Workflows

1.  **Probe (unattended):** a page on GitHub Pages, opened on a spare Android phone left on a charger with a wake lock, fetches `www.gstatic.com/generate_204` every 60 seconds and sends HEAD requests to Moodle's login page (`lms2.apiit.edu.my`) and APSpace every 5 minutes, never logging in. It reports a random probe ID, a site label, charge state, connection type, and timings; offline readings queue and arrive later with their device time. The Pi 5 runs the same checks from a systemd timer over Ethernet.
2.  **Feeder (unattended, Apps Script):** `doPost` stamps receipt time. A 5-minute time trigger creates Globalping HTTP measurements of both services on three probes from different Malaysian networks under the team's account, checks both directly from Google's network, writes an error row for any failed call, and builds one row per service per slot with each network's result and the measurement ID. It never decides that an outage happened.
3.  **Request (Gmail event):** a lecturer forwards a report, a student asks before filing, or a reviewer tests. The trigger starts the workflow within 5–10 minutes ([triggers][ge-trig]); **Request info** asks for a missing service, site, or window ([workflows][ge-wf]).
4.  **Decide (Gemini agent node):** turns "last night around nine" into slots in MYT, reads the rule Sheet and slot rows live through Sheets **Get cell values** ([actions][ge-act]), applies the rules, searches Jira for an open case on the same window, and drafts a reply citing slot, probe, and measurement IDs with its scope sentence. It never says a claim is false and never names a cause.
5.  **Approve (the one gate):** connector writes from a workflow require human review anyway ([unattended runs][ge-un]); once the steward approves, the reply goes out, the case (`EVID-n`) is created or commented, and the register row is written.
6.  **Sweep (hourly):** answers requests the event trigger missed (no `witness/answered` label) and at 08:00 drafts yesterday's episodes and probe-health lines ("P2 silent since 14:20") for the same approval. In the full product it also advances 72-hour watches on residence faults marked resolved.

### Witness rules

Kept in a versioned Sheet the owner edits:

- **Service episode:** Moodle or APSpace fails (an error, a 5xx status, or no answer in 10 seconds) on at least two Globalping probes on two different Malaysian networks in the same 5-minute slot, plus a failure from Google's network or a team probe. Count networks, not probes.
- **Degradation window:** at least two vantage networks see a check take more than three times its 7-day median for two consecutive slots; a fixed 2-second threshold applies until three days of history exist.
- **Coverage:** a slot is covered only if at least two networks returned results; an uncovered slot is "no coverage", never "not observed".
- **Site episode (full product):** at least two enrolled probes, and a majority of the site's live probes, in the same failed state with onsets within 60 seconds; two probes on one power strip count as one; a probe that moves as it stops charging is "likely unplugged" and excluded, as in [Grid Watch].
- **No self-witness:** only enrolled probes count, nobody can upload screenshots or logs, and a requester's own probe never counts for their request.
- **Scope in every reply:** "Moodle answered normally from three networks" says nothing about one person's connection, and the reply says so.

### States and failure handling

- **Requests:** received → info requested → drafted → **Needs Review** → sent or rejected. **Verdicts:** observed, degradation window, not observed while covered, no coverage. **Probes:** live, buffering, silent, or not charging.
- **Loud failures:** a Globalping `429`, a failed direct check, or a script exception writes an error row with time and HTTP status, and that slot becomes uncovered; nothing reuses an earlier value. A probe with no row for 10 minutes is "silent" and never counts as an outage on its own.
- **Platform failures:** event runs that fail on quota aren't retried, so the sweep picks them up ([unattended runs][ge-un]); schedules run on the author's credentials, refreshed before 11 November and every 14 days after.

### Connectors and platform check

| Connector                        | Type and status | Mode                                         | Job                                                                               |
| -------------------------------- | --------------- | -------------------------------------------- | --------------------------------------------------------------------------------- |
| Gmail                            | 1P, GA          | Event trigger, read, reply, label            | The Witness inbox: requests start the workflow; approved replies go out           |
| Google Drive with Sheets actions | 1P, GA          | Get and Update cell values                   | Reads slot rows and the rule Sheet live; writes approved register rows            |
| Jira Cloud Free                  | 3P, GA          | Search, create issue, comment, change status | One case per request with its verdict and IDs; repeat windows become comments     |
| Globalping (add-on)              | 3P, preview     | Read-only search                             | In a chat agent only, lets a seated reviewer look up measurements; never decisive |

- **Platform fit:** Gmail and Jira Cloud event triggers and cron schedules are documented ([triggers][ge-trig]); Sheets cell reads and writes have been GA through the Drive connector since 12 October 2026, and Jira Cloud's create, comment, and status actions are listed ([actions][ge-act]); **Approval** and **Request info** steps exist ([workflows][ge-wf]). Gmail and Drive refuse consumer `@gmail.com` accounts ([account limits](/docs/research/gemini-enterprise.md#edition-and-account-limits)).
- **Handover (Inference):** APU runs Microsoft 365 and its Virtual Help Centre on Jira Service Management ([APU systems](/docs/research/apu.md#systems-apu-runs)), so handover swaps Gmail for an Outlook shared mailbox and Sheets for a SharePoint list, both GA, and points Jira at APU's own site.

### Cloud, IoT, and network

- **IoT this week:** two team Android phones on chargers at two homes on different ISPs, and the Pi 5 on Ethernet where it already sits, are real vantage points on residential networks. Honest limit: they witness APU's services from outside, not campus Wi-Fi or residence power.
- **IoT in the full product:** the Battery Status API works in Chrome 38+ and Android WebView and never shipped in Safari ([phone sensors](/docs/research/iot-and-network.md#phone-and-laptop-sensors-in-the-browser)), and `navigator.connection.type` only in Chrome, Samsung Internet, and WebView on Android (MDN browser-compat-data, fetched 5 November 2026), so Android phones are the power probes and iPhones run network checks only. A page reports only while visible with a wake lock held ([pages left running][iot-pages]).
- **Network:** at 07:29 MYT on 5 November, Globalping listed 45 Malaysian probes, 19 on home or mobile networks (14 TM, 2 Maxis, and one each on TIME, DiGi, and U Mobile) ([Globalping API]). Every check is HTTP, because ICMP to Moodle is blocked (100% ping loss from three probes the same minute). Each reading carries device and receipt time, so delay and buffered backlogs show per row ([network visibility](/docs/research/iot-and-network.md#what-a-judge-can-see-of-the-network)).
- **Cloud:** GitHub Pages serves the probe page; Apps Script receives readings and runs the 5-minute checks inside Workspace quotas of 6 hours of trigger runtime and 100,000 URL fetches a day, against about 2,000 here ([quotas](/docs/research/gemini-enterprise.md#free-tier-limits-that-matter)); Gemini Enterprise workflows decide and draft; Jira holds cases.
- **Prior art:** DumsorWatch phones in Accra showed that "uncoordinated smartphones experiencing charge state changes at the same time correlate with ground truth grid reliability measurements", but after 3 months it was "only detecting around 10% of the outages" it caught at the start, as participants uninstalled it, while plug-in sensors "regularly remained plugged in" ([DumsorWatch chapter]). Hence dedicated spare phones, a foreground page, and a daily health line.

### Real data and privacy

| Source                                          | Cadence        | Terms                                                                                                     | Check on 5 November 2026 (MYT)                                                                |
| ----------------------------------------------- | -------------- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Team probe readings                             | 60 s, buffered | Team-owned; site label only                                                                               | Not built yet                                                                                 |
| Globalping HTTP checks of Moodle and APSpace    | 5 min          | 250 free tests an hour anonymous, 500 with an account; results "typically available for up to six months" | 07:29: HTTP 200 from four probes (three TM, one Maxis); Moodle 221–593 ms, APSpace 74–181 ms  |
| Globalping probe list                           | Each run       | Same                                                                                                      | 07:29: 5,485 online, 45 in Malaysia                                                           |
| Direct checks (Google's network; a team laptop) | 5 min          | APU Terms of Use; HEAD only, no login                                                                     | 07:30: Moodle login 200 in 0.28 s, APSpace 200 in 0.16 s; `status.apu.edu.my` doesn't resolve |
| Control URL `www.gstatic.com/generate_204`      | 60 s           | Google                                                                                                    | 07:30: 204 in 0.09 s                                                                          |

- **Re-openable evidence:** anyone can fetch `api.globalping.io/v1/measurements/<id>` without an account while a result lasts, so the EC office can check a cited episode without trusting the team's Sheet ([Globalping API]).
- **Real data only:** live readings and measurements; staged Wi-Fi-off tests are real readings labelled as tests and kept out of the register and the scored set ([decisions](/docs/CONTEXT.md#decisions-so-far)). A failed source shows its error.
- **Privacy (PDPA):** probes send a random ID, a site label (never a room or address), charge state, connection type, and timings; no location, names, or accounts. Jira keeps only service or site, window, and requester role; forwarded emails are deleted after 30 days and readings after 90; no personal data goes into free-tier AI tools ([PDPA](/docs/research/judging.md#malaysias-pdpa-and-the-2024-amendment)).
- **APU content:** the product stores only HTTP status and timing of public login pages and no APU text; the rule Sheet is the team's own wording with links ([terms][apu-terms]).

## Why people will use it

- **The request already reaches lecturers:** the rule expects "engagement with the concerned lecturer", so "my connection failed" emails land with them; one forward returns an approved note they can attach to the staff support the rules say strengthens a claim.
- **Students check before filing:** inside the 3-day window, a student emails the inbox or reads the published register and cites the record in Section C.
- **Zero install for askers:** email and a view-only Sheet; a probe host opens one page and leaves the phone on its charger.
- **Independence without trust:** the answer to "a student-run register isn't independent" is that every observed episode cites measurements a third party ran from other people's networks, which the office can reopen itself. Conceded: whether it accepts them is unknown until it's asked.
- **Habit (Inference):** requests bunch up around assessment deadlines, so lecturers and the EC office are the repeat users, not every student. Conceded: no cited workaround shows students already logging outages for claims, beyond the single-device loggers found on GitHub.

## Why the crowd won't build it

- **It isn't the Wi-Fi watch:** Wi-Fi and network diagnosis (8.7% of 780 simulated ideas) and fault-to-ticket agents (7.6%) are saturated ([saturation tiers](/docs/research/competition.md#saturation-tiers)), and their stack is access-point telemetry with auto-filed tickets. Outage Witness reads no access point, files no fault, and answers a decision-maker's question about a past window, refusing when coverage is thin.
- **No cluster covers evidence:** none of the 26 crowd clusters covers claims or extenuating circumstances ([clusters](/docs/research/competition.md#clusters-and-shares)); "simulate", "mock", "synthetic", or "dummy" appears in 98% of Claude responses, 3% of ideas use public feeds, and 2 of 780 name Jira, ServiceNow, SharePoint, OneDrive, Salesforce, SAP, or MCP ([crowd misses](/docs/research/competition.md#what-the-crowd-structurally-misses)).
- **Crowd check, re-run on 5 November 2026:** Devpost has 0 projects for "dumsorwatch", 24 for "extenuating circumstances", and 14 for "outage witness", none on the first page about outage evidence; GitHub has 6 "extenuating circumstances" repositories, all claim-management apps, and a macOS logger "for evidence of outages", which is single-device self-evidence.
- **Nearest substitute (Inference):** GitHub's `icelanced/Witness` offers "multi-region uptime monitoring with consensus-based alerting", and any uptime monitor would record a Moodle outage. The off-campus build sits close to that; its difference is the coverage refusal, the scoped answer to one claim, and the approved record. Campus site probes are what no monitor found here offers.

## Off-campus fit

- **Full product: fails.** Its critical path needs spare phones on chargers on Satellite Campus Residence floors and in campus blocks, someone on campus to place them, written consent from Technology Services and Accommodation, and a warden for the 72-hour watch. None is possible before 10 November.
- **Reduced build: passes.** Service scope runs with nobody at APU and no staff action, on two team phones and the Pi 5 at home, Globalping, Apps Script, and free accounts. It witnesses Moodle and APSpace failures and degradations; it can't witness campus Wi-Fi, residence power, or one student's home line, and it isn't the full product.
- **Research reach:** lecturers and the EC office can't be counted on this week, so research rests on students the team can reach remotely and on real windows from its own probes; staff contacts are recorded as attempts.

## Scores

**71.3 / 100, rank 1 of 18** in the [cross-set ranking](/docs/ideas/00-ranking.md); it passes every gate, with G4 conditional. Scored on 5 November 2026 on the [matrix](/docs/ideas/00-ranking.md#scoring-matrix) by three independent scorers who read this doc and checked its claims: an NTT DATA forward deployed engineer (FDE), an APU School of Technology IoT lecturer, and a Google Cloud advocate who is also an APU student. Models: FDE (Claude Sonnet 5.5), Lecturer (Claude Fable 5.1), Advocate (Claude Opus 5.5). Day-to-day workflow and theme take the lowest score; the rest take the mean.

| Component           | Weight | FDE | Lecturer | Advocate | Used | Lowest scorer's reason                                                                                                                                                                |
| ------------------- | -----: | --: | -------: | -------: | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impact              |     13 |   3 |        3 |        3 |    3 | The EC office is a named target owner and claim rejection without evidence matters, but claim volume is unknown and the reduced build has no APU-side owner.                          |
| Connectors          |     13 |   4 |        5 |        4 | 4.33 | Gmail event and reply, Drive/Sheets live reads and approved writes (1P GA) and Jira Cloud cases (3P GA) are on the critical path with the preview Globalping connector kept off it.   |
| Day-to-day workflow |     13 |   4 |        5 |        4 |    4 | Gmail trigger plus hourly sweep and 08:00 register read an editable rule Sheet, write loud error rows, and stop at one approval.                                                      |
| Research            |     13 |   4 |        4 |        4 |    4 | The EC rule quotes (timestamp, self-certification, countersign) matched the live Confluence pages, and the 30-50 windows plus a fourth-ISP laptop loop are reachable.                 |
| Time to impact      |     13 |   4 |        3 |        3 | 3.33 | Service register delivers in weeks with no consent, but the 6-month value (EC accepting a Witness record) needs three offices to agree in writing, which the doc calls the slow part. |
| Theme               |     10 |   4 |        4 |        4 |    4 | Team phones on chargers and the Pi on different home ISPs are real vantage points with per-row delay and buffered backlog, but they witness APU only from outside.                    |
| Originality         |      9 |   3 |        3 |        3 |    3 | It is not the Wi-Fi watch, but the reduced build is close to uptime monitoring that incumbents already do.                                                                            |
| Real use            |      6 |   2 |        2 |        2 |    2 | The doc concedes no cited workaround shows students logging outages for claims beyond single-device loggers.                                                                          |
| Buildability        |      5 |   3 |        3 |        3 |    3 | Probe page, Apps Script feeder with Globalping, Sheet, two workflows, Jira and spoof tests is moderate and mostly small pieces.                                                       |
| Demo                |      5 |   4 |        4 |        4 |    4 | A reviewer can email a service and window and get an approved reply citing re-openable Globalping measurement IDs, or toggle Wi-Fi on a phone.                                        |

- **Gates:** G1 pass (3 pass, 0 conditional, 0 fail); G2 pass (3 pass, 0 conditional, 0 fail); G3 pass (3 pass, 0 conditional, 0 fail); G4 conditional (1 pass, 2 conditional, 0 fail).
- **Off-campus gate, per the lowest scorer:** The service-scope build runs on home phones, the Pi, Globalping and free accounts; only the full residence and campus product needs phones placed on APU chargers and consent from Technology Services and Accommodation.
- **What would help most, per the lowest scorer:** Email the EC office now with one real register record and its Globalping IDs, asking whether it would count as independent evidence; one written yes or no settles the impact claim.

## Research plan

- **Interviews (5–9 November, remote):** P1–P6 are students reached through the team's own course and residence chats who had a connection or Moodle failure near a deadline: what evidence they kept, whether they filed EC, what happened, and what they would attach. P7–P8 are emailed attempts to a lecturer and the EC office, recorded whether or not they answer. Label quotes by role and keep consent records out of the repo ([consent](/docs/research/judging.md#consent-and-anonymised-quotes)).
- **Timed observation (6 November):** two team members each answer "was Moodle down for everyone between these times?" for three real windows from the week by today's public means (asking classmates, searching Reddit and X, opening the site), then with the Witness reply, recording minutes and confidence.
- **30–50 real items:** 30-minute windows per service from 5 to 9 November: every episode and degradation, plus matched quiet windows (same service, same hour, another day). Two team members label each blind to the verdict from evidence the register never reads: a teammate's laptop on a fourth ISP logging both services each minute. Lead with precision, because a false "observed" could back a false claim, then recall, the confusion matrix, n, and a Wilson 95% interval, with "no coverage" counted apart ([accuracy](/docs/research/judging.md#measuring-an-agents-accuracy-honestly)). Conceded: positives may be few, so the interval will be wide.
- **Spoof tests, labelled and kept out:** 10 single-phone Wi-Fi-off tests and 5 two-phone tests on one home network, which counts once; the expected number of episodes is zero.

## Time to impact

- **By 10 February 2027 (3 months):** the service register runs unattended and public under a named steward, and lecturers forward reports; if Technology Services and Accommodation consent, two Satellite floors and two campus blocks get at least two probes each. **Measured:** requests a week, minutes per verification against the baseline, precision against the laptop loop and any EC outcomes, and weekly probe uptime (target 80%).
- **By 10 May 2027 (6 months):** the EC office decides whether a Witness record counts as supporting evidence, as ANU lists ISP outages; Technology Services holds campus probes and the script, Accommodation the residence probes; the inbox moves to an Outlook shared mailbox and cases to APU's Jira site through GA connectors. **Measured:** share of network-failure claims citing a record, 72-hour recurrence of residence faults, and outage minutes per site per month.
- **Owners:** business, the Office of Extenuating Circumstances Claims; IT, Technology Services; residences, Accommodation; data protection, whoever answers for PDPA at APU ([owners](/docs/research/judging.md#owners-and-what-has-to-be-true)).
- **Assumptions:** the service register needs no office's consent and delivers first; site probes and EC acceptance need three offices to agree in writing, which is the slow part; APU keeps or licenses Gemini Enterprise seats; Globalping's free limits hold.

## Demo and review

| Time      | Beat                          | On screen                                                                                                       |
| --------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------- |
| 0:00–0:10 | Slate                         | "Recorded from the live system", with the capture date                                                          |
| 0:10–0:35 | Problem                       | "without which the claim will be rejected" and "will not accept self-certification"; the baseline minutes       |
| 0:35–1:35 | One real request, end to end  | A forwarded request about a real window; the Runs tab reading the Sheet; **Needs Review**; approve; reply; case |
| 1:35–1:55 | Anyone can check              | A cited measurement ID opened on Globalping's public API                                                        |
| 1:55–2:20 | One device never corroborates | A phone's Wi-Fi off on camera, labelled a test: buffered rows land with their delay, and no episode forms       |
| 2:20–2:50 | Impact                        | Minutes before and after; precision and recall with n and interval                                              |
| 2:50–3:20 | Research                      | The interviews and what changed because of them                                                                 |
| 3:20–3:45 | Limits and close              | What the full product needs on campus; 3- and 6-month owners; links; the capture date again                     |

- **By email:** a reviewer sends "Moodle, 5 Nov 21:00–21:30" or "APSpace, last night 20:00–22:00" and gets the reply once the steward approves; the team watches **Needs Review** from 8 AM to midnight MYT during 11–14 November.
- **By phone:** open the probe page as site "reviewer" and switch Wi-Fi off and on: the readings arrive buffered, and the register refuses to call it an outage.
- **Access:** reviewers need a seat, the Gemini Enterprise User role, and the workflow shared with them; shared users see only their own runs, so the README and video show the owner's Runs tab over several days ([reviewer access](/docs/research/gemini-enterprise.md#reviewer-access)).

## Build plan

Three builders: B1 workflows and Jira, B2 probe page and Pi 5, B3 feeder, research, and video. The licence hasn't arrived, so everything before the workflows runs first.

| Day        | Build, critical path first                                                                                                                                             | Research and operations                         | Done when                                                                   |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------- |
| Thu 5 Nov  | B3: feeder with Globalping (account token), direct checks, slot and error rows. B2: probe page on one Android phone. B1: Jira Cloud Free project; rule Sheet           | Recruit P1–P6; email P7–P8; laptop loop running | Slot rows every 5 minutes with measurement IDs; a Wi-Fi drop lands buffered |
| Fri 6 Nov  | B2: second phone on another ISP; Pi 5 timer. B1: once licensed, prove Sheets read and write, Gmail reply and label, Jira create and comment; then the request workflow | P1–P3; timed observation                        | A forwarded request gets an approved reply within 20 minutes                |
| Sat 7 Nov  | B1: sweep workflow and the 08:00 register. B3: spoof tests                                                                                                             | P4–P6                                           | The Runs tab shows unattended hourly runs                                   |
| Sun 8 Nov  | Label and score windows; tune the rule Sheet                                                                                                                           | Deepavali; every member registered before 23:59 | Precision and recall written down with n                                    |
| Mon 9 Nov  | Feature freeze; record the video; reviewer access from a non-team account; refresh schedule credentials                                                                | Follow-up calls                                 | A non-team account triggers a reply                                         |
| Tue 10 Nov | README, deck, diagram, and what Antigravity built; submit                                                                                                              | Final probe-health check                        | Submitted before 18:00 MYT                                                  |

- **Cut lines:** the Pi 5 timer first, then the Globalping add-on; never the rule Sheet, the approval, error rows, or the scope sentence.
- **No card:** GitHub Pages, Apps Script and Sheets in the licensed Workspace domain, Gmail, Jira Cloud Free, and a free Globalping account. If the licence lands after Thursday, the feeder moves into that domain and earlier rows stay as a labelled log.

## Risks and kill criteria

- **Kill on the licence (Mon 9 November, 12:00 MYT):** with no licence, the deciding step can't run in Gemini Enterprise; say so in the README and submit the feeder and rules as built. On a consumer account, Gmail and Drive refuse it, so requests move to Jira Cloud event triggers and the register to Supabase, a preview connector labelled as such, or stop; never fake the store.
- **Kill on Friday (6 November, 22:00 MYT):** if more than 10% of slots lack two networks, or Globalping refuses the feeder's calls, the service rule can't hold; run the Globalping calls from the Pi 5, or stop.
- **Too few real failures:** degradations and matched quiet windows fill the set; staged tests stay separate; report the real n.
- **A verdict used against a student:** every reply carries its scope sentence, never calls a claim false, and goes only to the requester; the public register lists episodes, never "not observed".
- **Not independent yet:** until an office adopts it, each reply is labelled a team observation with third-party measurement IDs.
- **Read as an uptime monitor or the Wi-Fi watch:** the pitch opens on the EC rule and the refusal, never on a dashboard.
- **Platform limits:** every write pauses for review; credentials expire after 14 days; about 24 sweeps plus requests a day sit against one Standard seat's 160 queries, measured over ten runs ([limits](/docs/research/gemini-enterprise.md#limits-that-bite-in-a-one-week-build)).
- **Load and permissions:** one HEAD request per probe per service every 5 minutes, never logged in; site probes go on campus only with written consent.

## Not verified

- Nothing is built, and no Gemini Enterprise run exists; the licence's edition and account type are unknown.
- Whether the EC office treats a Witness reply or a Globalping measurement as independent evidence, and how many network-failure claims it handles.
- Whether Apps Script can create 72 Globalping tests an hour under an account token; **Inference:** anonymous limits are per IP, and Apps Script shares Google's addresses with other scripts.
- Whether at least two Malaysian networks answer in most slots; outside TM, each home network had one or two probes on 5 November.
- Whether the preview Globalping connector finds measurements the team created; the public API has no "list my measurements" endpoint.
- Whether the browser unplug check (motion as charging stops) works on the team's phones.
- How many service-wide failures or degradations a week holds, and whether the team's homes sit on different ISPs.

## See also

- [Outage Witness source idea](/docs/ideas/opus/01/05-outage-witness.md) and the [cross-set ranking](/docs/ideas/00-ranking.md).
- [Rules and guarantees](/docs/research/rules-and-guarantees.md), [APU](/docs/research/apu.md#apu-knowledge-base-on-confluence), and [Social](/docs/research/social.md#wi-fi-power-and-core-platforms): the EC rule and the evidence of pain.
- [Gemini Enterprise](/docs/research/gemini-enterprise.md), [IoT and network](/docs/research/iot-and-network.md#globalping-probe), and [Competition](/docs/research/competition.md).
- [Grid Watch: Mapping Blackouts with Smart Phones][Grid Watch], [DumsorWatch at scale][DumsorWatch], and the [Globalping API].

[kb-who]: https://apiit.atlassian.net/wiki/spaces/AA/pages/2229272695
[ge-wf]: /docs/research/gemini-enterprise.md#workflows
[ge-gp]: /docs/research/gemini-enterprise.md#network-measurements-through-globalping
[ge-trig]: /docs/research/gemini-enterprise.md#triggers-and-schedules
[ge-act]: /docs/research/gemini-enterprise.md#actions-and-write-back
[ge-un]: /docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in
[iot-pages]: /docs/research/iot-and-network.md#web-pages-and-pwas-left-running
[apu-terms]: /docs/research/apu.md#terms-of-use-and-robotstxt
[Grid Watch]: https://patpannuto.com/pubs/klugman14gridwatch.pdf
[DumsorWatch]: https://nline.io/docs/klugman19scale.pdf
[DumsorWatch chapter]: https://nline.io/docs/klugman22developmenteng.pdf
[Globalping API]: https://api.globalping.io/v1/spec.yaml

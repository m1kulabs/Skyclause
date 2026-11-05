# Tukar

Tukar ("swap" in Malay) is a free survey-swap exchange for Malaysian final-year project (FYP) and research-methods students who recruit on Google Forms: members earn respondents for their own survey by answering other members' surveys, a Raspberry Pi 5 gateway at a teammate's home records the network and country each response session starts from and then drops the address, and a nightly Gemini Enterprise workflow writes each survey a provenance statement its owner can attach to the methodology chapter. Proposed track: **Data-Driven Research & Intelligent Decision Making** ("supporting evidence-based decisions"), where the decision is which responses an owner keeps and whether the sample is fit to report. Caveat: nothing has been built or run, the exchange starts with no members on either side, and no sensor is read, so the IoT part of the theme is thin; **Inference** marks conclusions no source states.

Contents:

1.  [At a glance](#at-a-glance)
1.  [Origins](#origins)
1.  [Problem and evidence](#problem-and-evidence)
1.  [How it works](#how-it-works)
    1.  [Signal to cloud path](#signal-to-cloud-path)
    1.  [Workflows](#workflows)
    1.  [Rule set](#rule-set)
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

| Field                 | Plan                                                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner                 | The team's exchange operator, a team member, who approves each night's batch and each enrolment. No APU office is involved. Survey owners decide which flagged rows to drop; supervisors and examiners only read what students attach.                             |
| First users           | Malaysian FYP and research-methods students who post for respondents on r/malaysiauni and X, APU posters first. Respondents are members answering for credits.                                                                                                     |
| Track                 | Data-Driven Research & Intelligent Decision Making.                                                                                                                                                                                                                |
| Trigger               | A schedule at 23:00 MYT every night, and a Gmail "When an email is received" event when an owner emails the Tukar inbox to enrol (polled every 5–10 minutes).                                                                                                      |
| Live signal           | Each member phone's network when it opens a session (ASN, country, network class), read by the Pi from the client address Tailscale Funnel forwards, then dropped; each owner's response timestamps; the Pi's heartbeat and undervoltage state. No sensor is read. |
| Connectors            | GA 1P: Google Drive with Sheets actions, Gmail, Google Calendar. GA 3P: Slack. Add-on only: a custom MCP server (preview, blocked by default), not built this week.                                                                                                |
| Decision              | Which rules apply to each survey, which responses to flag, each member's credits and tomorrow's queue order, and what each survey's statement discloses.                                                                                                           |
| Action and approval   | After one batched approval at **Needs Review**: Sheets cell updates (flags, credits, queue), a statement Doc per survey, Gmail to each owner, a Slack ops summary. Each enrolment pauses for its own approval before the Calendar deadline and onboarding mail.    |
| Reviewer self-trigger | Open the README's reviewer link on their own phone and answer the team's 2-minute survey: their carrier and country land in the ledger within seconds, and R2 fires if they're on a VPN. Or email an enrolment for a Google Form of their own.                     |

## Origins

Tukar has one source, the [opus-03 Tukar doc](/docs/ideas/opus-03/01-tukar.md), which leads. Its own scorers' strongest objections were a two-sided cold start, many moving parts, and an absent IoT layer; this version answers the first two and concedes the third.

- **Kept:** the swap exchange with credits, the Funnel gateway that classes the network and drops the address, the Workspace ledger, the nightly workflow with one batched approval, Gmail enrolment, rules R1 to R4 and the panel cap, the statement built on PNAS's five disclosures, the research plan and the kill criteria.
- **Changed, for the cold start:** every session from a team member's link is now marked `team=true` and kept out of outcome figures, the team answers each poster's survey before asking them to join, and the doc now says which measurements survive with no outside owners and which don't ([Risks](#risks-and-kill-criteria)).
- **Changed, for buildability:** the IPinfo Lite cross-check, the Editor onboarding path and the panel's queue-priority penalty moved behind cut lines; the Viewer path now uses a prefilled link the owner makes, so no Editor access is needed; Thursday's first slice is one Funnel request landing in the ledger.
- **Fixed against sources:** the X survey posts now cite their current anchor; the APU FYP with a Touch 'n Go reward needed 50 respondents and "appears to have offered" it, per the research; the PNAS behaviour quote now matches the paper; the Microsoft Forms export columns are paraphrased, since the source "quote" is a column list; Protect's cost for 100 people in a month is $4.50 after 10 free, not "about $5"; PollPool's European claim rests on its testimonials; "absent from the 780 simulated ideas" became "no cluster covers it", which is what the competition research shows.
- **Dropped:** the source's scores and score line; the Supabase fallback for a consumer licence, a preview connector on the critical path that the team limits make moot (the licence is assumed to arrive on a supported domain); Jira Cloud from the first-week connectors; a reviewer-shared ledger that held member emails (emails now sit in a separate, unshared Sheet).

## Problem and evidence

APU has "over 13,000 students ... from more than 130 countries" ([QAA review, March 2024][qaa]); its FYP share isn't published. r/malaysiauni, where the requests appear, has 63,046 weekly active users ([communities](/docs/research/everyday.md#communities-found)).

- **How often:** the 100 newest r/malaysiauni posts matching "survey" span 17 October to 4 November 2026, about five a day, and 77 of their titles ask for respondents ([recruiting]).
- **APU requests go unanswered:** "I need at least 40 responders for ARS assignment" (31 October 2026, 0 comments); an APU co-curricular event survey got one reply, itself a request to fill in another survey; an APU FYP needing 50 respondents appears to have offered a Touch 'n Go reward and drew mostly swap offers (July 2026) ([recruiting]).
- **Stakes and padding:** "my lecturer need 100 responders for my fyp survey plsss help me I only have 2 days" (13 June 2026, 181 points, 133 comments); the top reply, at 41 points, was "U could just fill it up urselves lol" ([FYP survey](/docs/research/social.md#survey-respondents-for-final-year-projects)).
- **On X:** "If I don't get enough respondents, I won't be able to graduate" (3 November 2026; 0 likes, 7 views); "aiming to collect 150 respondents for my fyp" (13 March 2026; 13 likes, 17 reposts, 1,300 views); a Filipino commission for 300 responses where "All answers will be provided. No need to analyze" (15 May 2026; 3,041 views); an Indonesian thesis-respondent service (11 August 2026; 21,053 views) ([recruiting]).
- **The threat to the data is measured:** a 2025 PNAS study built an LLM respondent that passed attention checks at "a 99.8% pass rate on 6,000 trials"; "a typical survey can be completed for approximately $0.05", and "completion times, straight-lining detection, and even standard attention checks are insufficient countermeasures" ([PNAS 2025][pnas]).
- **Against, engagement:** most requests get little engagement (0 to 17 likes on X), so many students may live with the pain rather than adopt a tool ([X pass profile](/docs/research/everyday.md#group-assignments-and-free-riders)).
- **Against, what's asked for:** no Malaysian post asks for a quality check; the stated demand is for respondents. Students would join for respondents, and the statement is what sets Tukar apart, not why they come.
- **Against, the reader:** no source shows an APU supervisor or examiner rejecting data over quality. The reader's need is **Inference** from the padding norm and PNAS, and the team can't test it with APU staff this week.
- **Against, the sample:** PNAS says "Data from low-barrier convenience samples should be treated with skepticism until shown to be trustworthy", and ranks panels that "simply route traffic to third-party survey platforms like Qualtrics, where it is not possible to observe respondent behavior" below integrated ones ([PNAS 2025][pnas]). Tukar is such a sample and routes to Google Forms: it can disclose that, not fix it. No check proves a human answered.

**Existing substitutes**, checked on 5 November 2026. Malaysian searches ("cari responden", "tukar survey") found no Malaysian exchange, only one Indonesian Telegram group; WhatsApp, Telegram and Facebook groups can't be searched, so a local group may exist.

| Substitute                                                        | What it offers                                                                                                                                                                                                                                          | Gap for a Malaysian student on Google Forms                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| [SurveySwap exchange](https://surveyswap.io/free-survey-exchange) | Karma, "the currency of the exchange"; "1,500+" weekly active; "Attention and AI-bot checks built in", but tied to its own tool: "If you copy your survey with 2 clicks to our survey tool"; [imports Forms](https://surveyswap.io/free-survey-builder) | Peers "mainly from the US, UK, DE, FR, PT, IT, ES, IN, and NL"; Malaysia not mentioned                                |
| [SampleLabs Protect](https://samplelabs.io/protect)               | A check page in front of any Form link that "runs the bot trap, rushed answers, duplicates and the attention check"; flags a second response "from the same browser or IP address"; $0.05 a person after 10 free                                        | Paid; per-response flags, no per-survey country or panel disclosure; notes "timings and positions on the survey page" |
| [SurveyCircle](https://www.surveycircle.com/en/)                  | Points and SmartRank; "Over 150,000 Survey Managers"; [Rule #7](https://www.surveycircle.com/en/faq/): "Do not use multiple accounts"                                                                                                                   | No verification described; six European interface languages                                                           |
| [PollPool](https://poll-pool.com/)                                | "Get survey participants for every answer you give"                                                                                                                                                                                                     | No checks described; testimonials from European universities                                                          |
| [Timer for Google Forms][t]                                       | 5M+ installs, 4.8 stars, listing updated 2 November 2026; "start time and duration next to each response"                                                                                                                                               | Timing only; no network or country                                                                                    |
| Microsoft Forms                                                   | Excel export carries ID, start time and completion time columns ([Microsoft Q&A][msq])                                                                                                                                                                  | Most posts link Google Forms, which stamps only the submission time ([Forms help][gf])                                |

**Inference:** the gateway, the duplicate check and timing aren't new. Tukar has to win on who answers (a Malaysian pool) and on what it discloses per survey: PNAS asks panels to disclose validation, throttling ("surveys per day or week"), professionalism ("How many surveys has the panelist completed in the last 1, 7, and 30 d?"), quality flags and location ("Is the panelist starting a survey from the state/region/country registered to the account? Is a VPN being used?"), and no substitute page describes reporting these. Price is weak on its own: Protect costs $4.50 for 100 people in a month.

[pnas]: https://doi.org/10.1073/pnas.2518075122
[t]: https://workspace.google.com/marketplace/app/timer_for_google_forms/341515549984
[msq]: https://learn.microsoft.com/en-us/answers/questions/1167846/excel-data-file-of-office365-form-shows-additional
[gf]: https://support.google.com/docs/answer/2839588

## How it works

### Signal to cloud path

1.  A member taps their personal queue link (emailed on joining) and picks a survey. Nothing is installed and everything runs in the foreground, which matters because neither OS keeps a web page running in the background ([web pages](/docs/research/iot-and-network.md#web-pages-and-pwas-left-running)).
1.  HTTPS reaches the Funnel ingress at `<pi>.<tailnet>.ts.net`, which forwards over the tailnet with `Tailscale-Ingress-Src`. In `serve.go` at [`e19eb27`][ts-serve], "srcAddr represents the source AddrPort and not that of the ingressPeer", and the proxy overwrites `X-Forwarded-For` with the client address and sets `Tailscale-Funnel-Request: ?1`. Tailscale's docs say only that Funnel traffic carries no identity headers, so a live request from mobile data is the first build task ([Funnel and the client address](/docs/research/iot-and-network.md#tailscale-funnel-and-the-client-address)).
1.  The Pi app rejects requests without the Funnel header, looks up ASN and country in local tables, classes the network (Malaysian consumer, hosting or VPN, other), keeps an HMAC of the /24 (IPv4) or /64 (IPv6) with a per-survey salt, and drops the address. It issues a one-time code and redirects (302) to the owner's prefilled Form.
1.  The app POSTs the session to an Apps Script `doPost`, following its redirect ([Pi to Sheets](/docs/research/iot-and-network.md#pi-to-apps-script-and-sheets)), which appends member ID, survey, code, `opened_at` (Pi clock, NTP-synced), ASN, AS name, country, class and prefix hash to the `sessions` tab.
1.  The phone submits its answers straight to Google; Tukar never sees them.
1.  At 22:30 MYT an Apps Script time trigger reads only new rows' timestamp, Tukar code, declared attention item and Likert grid from each owner's response Sheet, and writes `duration_s = submitted_at − opened_at`, attention pass, longest identical run and a deterministic `script_flags` column to the `responses` tab. Answers are never copied.
1.  Gemini Enterprise reads the ledger through the Drive connector, which "only searches documents that are owned by the domain of the user who performs the search" ([account limits](/docs/research/gemini-enterprise.md#edition-and-account-limits)), hence a ledger Tukar owns rather than the owners' Sheets.

- **Lookup tables**, refreshed daily: [iptoasn](https://iptoasn.com/) IPv4 and IPv6 (public domain, PDDL; the IPv4 file was last modified 1 November 2026 and holds 540,291 ranges); the [X4BNet](https://github.com/X4BNet/lists_vpn) datacenter and VPN ASN list (948 entries, no licence file); and nine Malaysian consumer ASNs, each checked in iptoasn: TM AS4788, AS17971, AS18206; TIME AS9930; Maxis AS9534; DiGi AS4818; Celcom AS10030; U Mobile AS38466; YTL AS45960. X4BNet lists AWS, Google, DigitalOcean and Gigabit Hosting MY but misses Evoxt, IP ServerOne and Exabytes, which is why R2 also flags Malaysian ASNs off the consumer list.
- **Owner onboarding (Viewer path):** add one short-answer item, "Tukar code"; make a prefilled link with Forms' "Get pre-filled link" and the value `TUKAR`; email it to the Tukar inbox; share the response Sheet as Viewer with Tukar's Workspace account. The Pi swaps `TUKAR` for each one-time code. The Editor path, where Apps Script adds the item and builds the link with `toPrefilledUrl()` ([FormResponse][as-fr]), is a cut line.
- **Pi keep-alive:** the official 27 W supply and Ethernet if possible ([power](/docs/research/iot-and-network.md#power-undervoltage-and-the-rtc)); `tailscale funnel --bg 8080`, which "will automatically resume" after a reboot ([public HTTPS](/docs/research/iot-and-network.md#public-https-without-a-card)); `Restart=always` with `StartLimitIntervalSec=0` and `RuntimeWatchdogSec=10` ([services](/docs/research/iot-and-network.md#services-and-watchdogs)); a 5-minute self-check that fetches the public URL and restarts `tailscaled` after two failures, since users report Funnel stopping after a control-plane reconnect ([what kills home deployments](/docs/research/iot-and-network.md#what-kills-home-deployments)); a heartbeat with `vcgencmd get_throttled` every 5 minutes.

[ts-serve]: https://github.com/tailscale/tailscale/blob/e19eb275ea21790aac94be1a5eddcd20ebb40a35/ipn/ipnlocal/serve.go
[as-fr]: https://developers.google.com/apps-script/reference/forms/form-response

### Workflows

**Workflow A, "Tukar nightly":** a schedule trigger at 23:00 `Asia/Kuala_Lumpur` ([triggers](/docs/research/gemini-enterprise.md#triggers-and-schedules)).

1.  **Read:** Drive Search and the Sheets action Get cell values on the `surveys`, `sessions`, `responses`, `members`, `heartbeat` and `rules` tabs, plus owner and member addresses from the separate contacts Sheet.
2.  **Decide:** apply each survey's enabled rules with their applicability (n of 10 or more for R1; R3 only with a target); list every disagreement with `script_flags`; compute credits (the survey's median minutes for each unflagged response a member gave) and tomorrow's queue (credit balance, then the owner's deadline); turn heartbeat gaps into unobserved windows; draft each statement, the owner emails and an ops summary.
3.  **Approval:** the operator approves the whole batch once. Connector writes from a workflow require human review, and scheduled runs that email other people pause for approval ([unattended runs](/docs/research/gemini-enterprise.md#what-runs-without-anyone-signed-in)), so one batched click is the design, not a bolt-on.
4.  **Write:** Sheets Update cell values (flags, credits, queue); Drive Update document (each statement Doc); Gmail Send message (each owner's statement link and progress); Slack Send message (disagreements, unobserved windows, tomorrow's queue). Each **statement** Doc carries: the sample source (a convenience sample recruited through a student exchange for credits); PNAS's five disclosures for that survey (email-confirmed members, the throttle, respondents' 1-, 7- and 30-day survey counts, prior-flag share, the country and network-class distribution); "Network and country describe where each response session started, not where the answers were entered"; exclusions by rule with text, version and n; unobserved windows; run IDs from the Runs tab ([run history](/docs/research/gemini-enterprise.md#run-history-as-evidence)); and "No check here proves a human answered."

**Workflow B, "Tukar enrol":** a Gmail "When an email is received" trigger. The owner writes from their own address with the prefilled link, target population, target n and deadline, following a template on the queue page; the agent extracts the fields and R3's target country, and a mail that isn't an enrolment ends the run with no writes. After the operator approves: a `surveys` row, a Calendar Create event for the deadline with reminders, and a Gmail onboarding mail with the Viewer-share step and the information-sheet paragraph. Self-sent mail fires "When an email is sent" instead ([triggers](/docs/research/gemini-enterprise.md#triggers-and-schedules)), so tests come from another address.

### Rule set

| ID    | Rule                                                                                          | Catches                                   | Basis                                                         |
| ----- | --------------------------------------------------------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------- |
| R1    | Duration under one third of the survey's median, once it has 10 or more completed responses   | Inattentive humans, not bots              | Standard speeding check; PNAS shows bots defeat it            |
| R2    | ASN on the X4BNet list, or a Malaysian ASN not on the consumer list                           | Hosting, VPN and farmed sessions          | PNAS location check: "Is a VPN being used?"                   |
| R3    | Country differs from the owner's stated target (only if one is set)                           | Out-of-population respondents             | PNAS location check                                           |
| R4    | Two or more members start the same survey from the same prefix hash and ASN within 10 minutes | Multi-account credit farming; review only | SurveyCircle's "Do not use multiple accounts", made checkable |
| Panel | At most 6 surveys per member per day                                                          | Professionalised answering                | PNAS throttling and professionalism disclosures               |

The rules live in the ledger's `rules` tab, each with a version, and each can be switched off per survey. Attention-check pass rate and straight-lining are reported, not exclusion rules, because PNAS shows LLM respondents pass them. Speeding errs towards misses: a respondent who opens a session and waits only lengthens the duration. **Inference:** R2's second clause also catches university and office networks, so the statement lists flagged rows by AS name and the owner decides. A row records the network the browser was on when the session opened; a member can finish on a laptop on a VPN, and the statement says so.

### States and failure handling

- **Pi or network down:** a member link fails with the browser's connection error (**Inference:** the exact page isn't tested), and Tukar never hands out the bare Form link instead. A Pi 5 boots when power returns and Funnel resumes ([power cuts](/docs/research/iot-and-network.md#power-cuts-and-sd-cards)); the `heartbeat` tab shows the last beat, and the statement and Slack summary list the gap as an unobserved window.
- **A table download fails:** the error shows in the Pi log and the Slack summary, and lookups return `unknown` rather than use yesterday's copy.
- **An owner revokes the share:** that survey's feature read records the Apps Script error, and its statement says features weren't read that night; no earlier features are reused.
- **No approval:** the batch waits at **Needs Review**; no credits, mail or Slack summary go out, and a night with no new rows says so.
- **Quotas and credentials:** 160 assistant queries per user per day on Standard, with pools resetting at 4:00 PM MYT; one run isn't necessarily one query, so measure on 6 November ([limits](/docs/research/gemini-enterprise.md#limits-that-bite-in-a-one-week-build)). Event runs that fail on quota aren't retried; the operator forwards the mail again. Schedule credentials expire every 14 days; refresh them on 10 November so they hold to 24 November.
- **A public front door:** Funnel hostnames appear in public certificate logs ([public HTTPS](/docs/research/iot-and-network.md#public-https-without-a-card)), so the gateway answers only valid member links, rate-limits each link and prefix, and logs refusals.

### Connectors and platform check

| Connector                         | 1P or 3P | Stage                                   | Mode                                                         | Job                                                      |
| --------------------------------- | -------- | --------------------------------------- | ------------------------------------------------------------ | -------------------------------------------------------- |
| Google Drive, with Sheets actions | 1P       | GA                                      | Search, Get cell values; Update cell values, Update document | Read the ledger; write flags, credits, queue, statements |
| Gmail                             | 1P       | GA                                      | Event trigger (When an email is received); Send message      | Start enrolment; onboarding and nightly owner mail       |
| Google Calendar                   | 1P       | GA                                      | Create event                                                 | The owner's collection deadline, with reminders          |
| Slack                             | 3P       | GA                                      | Send message                                                 | Operators' summary, disagreements, unobserved windows    |
| Custom MCP server on the Pi       | 3P       | Preview; blocked by organisation policy | Add-on only, not built this week                             | A read-only `lookup_network(code)` tool if policy lifts  |

Stages are from [third-party sources](/docs/research/gemini-enterprise.md#third-party-data-sources) and [actions](/docs/research/gemini-enterprise.md#actions-and-write-back); Slack is on the workflow connector list ([workflows](/docs/research/gemini-enterprise.md#workflows)). Approval steps and event triggers have to be added in the Workflow Builder UI, not by natural language ([limits](/docs/research/gemini-enterprise.md#limits-that-bite-in-a-one-week-build)).

### Cloud, IoT and network

- **Network, load-bearing:** the Funnel hop is the only place the respondent's address is seen, and the Pi turns it into ASN, country and class before dropping it. Without it, a Google Form has a submission timestamp and nothing else. The demo shows a Pi log line with `Tailscale-Funnel-Request: ?1` and the address dropped, and the reviewer's own carrier in the ledger.
- **IoT, conceded:** no sensor is read. The phones contribute their network at session start, not a reading, and the Pi is a gateway; its only readings are its own heartbeat and `get_throttled` power state. The team has no add-on sensors, and behaviour sensing is left out on purpose: PNAS's synthetic respondent fakes "realistic reading times, mouse movements, and keystrokes", so it isn't evidence. A reviewer looking for a sensor won't find one, and bolting one on wouldn't serve the product.
- **Cloud, load-bearing:** Apps Script lands sessions and features in a Workspace ledger; Gemini Enterprise reads it, applies the rules, drafts the statements and writes back after one approval; the Runs tab is the audit trail.

### Real data and privacy

- **Live:** sessions from members' phones through the Pi (from 6 November); response features from owners' Sheets, nightly; the Pi's heartbeat; lookup tables fetched daily and used as lookups, never republished; baselines from each owner's own Form timestamps for the 7 days before joining. Team members' sessions are real but marked `team=true` (answering) or `tester=true` (a VPN test) and kept out of every outcome figure. Nothing is replayed and no GPS is used.
- **Stored:** member ID, survey ID, one-time code, `opened_at`, ASN, AS name, country, network class, salted prefix hash, `submitted_at`, duration, attention and straight-line features, flags and credits; member and owner emails only in the unshared contacts Sheet. **Never stored:** the IP address (in memory for the lookup only), survey answers, device fingerprints, user-agent strings, motion, keystrokes, page positions and location.
- **PDPA:** Act 709 covers processing "in respect of commercial transactions" ([PDPA](/docs/research/judging.md#malaysias-pdpa-and-the-2024-amendment)). **Inference:** a free student exchange probably falls outside it, but Tukar follows the principles anyway: a notice and consent on the Join Form listing what's stored, retention limits, access and deletion on request, and a breach plan. The 2024 amendment's biometric data comes from "technical processing" of traits; Tukar processes none.
- **Research practice:** the [ESOMAR/GRBN guideline (2015)][esomar] defines paradata as "data about the process by which survey data were collected", says "participants must be informed" of passive collection, and counts "using keystroke loggers without obtaining the participant's opt-in consent" among its "Unacceptable practices". Tukar's notice names its network and timing paradata and uses no loggers.
- **APU ethics:** FYP ethics forms go through FYPPGBank, whose Fast Track needs every "Participant Confidentiality" answer Yes ([ethics forms](/docs/research/rules-and-guarantees.md#research-ethics-forms-for-final-year-students)), and APU's committee covers "all research involving human participants, the processing of personal data" ([QAA review][qaa]). Tukar gives each owner a paragraph for their information sheet naming the exchange and its paradata. **Inference:** an owner with approval in hand may need an amendment for a new channel; that's the owner's call, and Tukar never contacts APU.
- **Retention:** sessions and features are deleted 30 days after a survey's deadline, with its salt, so prefix hashes can't be recomputed. Statements keep counts only. Gemini Enterprise sees ledger features, never answers.

[esomar]: https://swiss-insights.ch/wp-content/uploads/2020/05/ESOMAR-GRBN-Online-Research-Guideline-October-2015.pdf

## Why people will use it

- **Swapping is already the habit:** "I will be open to survey swapping", RM5 per response paid "around December-ish", and an RM50 lucky draw commenters suspected was a scam ([recruiting]). Global swap subreddits are busy: [r/SampleSize](https://www.reddit.com/r/SampleSize/) has 22,856 weekly active users, [r/SurveyExchange](https://www.reddit.com/r/SurveyExchange/) 4,029 (5,627 weekly contributions) and [r/SurveySwap](https://www.reddit.com/r/SurveySwap/) 730 (ScrapeCreators subreddit details, re-checked 5 November 2026), and Malaysian FYP students post there: "Survey questionnaire fyp, pls help me to graduate" ([r/SurveyExchange, 2 June 2024](https://www.reddit.com/r/SurveyExchange/comments/1d6ekdt/)).
- **It reaches them where they already ask:** a reply in their own thread, a link that opens in the browser, and email; no app to install.
- **A local pool:** no exchange found recruits in Malaysia, where most FYP surveys target respondents.
- **Something to attach:** the statement gives the methodology chapter numbers it can cite. **Inference:** students come for respondents and keep the statement; demand for the statement itself is unproven.

## Why the crowd won't build it

- **Far from the crowd:** none of the 26 clusters in the [crowd map](/docs/research/competition.md#clusters-and-shares) covers survey recruitment or respondent quality. The nearest, research trend and literature analytics (3.4%), is in the crowded tier but reads papers, not respondents, and researchers are the primary user of only 4% of the 780 simulated ideas ([what the crowd misses](/docs/research/competition.md#what-the-crowd-structurally-misses), [saturation tiers](/docs/research/competition.md#saturation-tiers)).
- **Real data from the first hour:** "simulate", "mock", "synthetic" or "dummy" appears in 30% to 98% of the crowd's answers, depending on the model family (same research); Tukar's rows are real sessions or none.
- **The competition is incumbents, not teams:** SurveySwap and Protect already do the swap and the gateway. A reviewer who knows them will ask what's new; the answer is the Malaysian pool and the per-survey disclosure, and the README names both incumbents first.

## Off-campus fit

The critical path passes with nobody at APU, no APU staff action, and only the team's phones and the one Pi 5. The Pi sits at a teammate's home on home broadband behind Tailscale Funnel (the Personal plan is "$0 Free forever" for up to 6 users, [public HTTPS](/docs/research/iot-and-network.md#public-https-without-a-card)); members and owners use their own phones wherever they are; recruiting runs through r/malaysiauni and X thread replies, the hackathon Discord and team members' WhatsApp groups ([remote recruiting](/docs/research/everyday.md#how-a-remote-team-could-use-them)); the ledger and workflows are in the cloud. Nothing is placed on campus, so no reduced version is needed. What remote work can't fix is the cold start, which is about people, not place.

## Scores

**67.9 / 100, rank 6 of 18** in the [cross-set ranking](/docs/ideas/00-ranking.md); it passes every gate, with G2 and G3 conditional. Scored on 5 November 2026 on the [matrix](/docs/ideas/00-ranking.md#scoring-matrix) by three independent scorers who read this doc and checked its claims: an NTT DATA forward deployed engineer (FDE), an APU School of Technology IoT lecturer, and a Google Cloud advocate who is also an APU student. Models: FDE (Claude Sonnet 5.5), Lecturer (Claude Fable 5.1), Advocate (Claude Opus 5.5). Day-to-day workflow and theme take the lowest score; the rest take the mean.

| Component           | Weight | FDE | Lecturer | Advocate | Used | Lowest scorer's reason                                                                                                                                                                                  |
| ------------------- | -----: | --: | -------: | -------: | ---: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Impact              |     13 |   3 |        3 |        3 |    3 | Owners are FYP students (about five survey pleas a day, everyday.md) with a per-owner 7-day baseline, but the owner is the team operator and outside owners may never enrol.                            |
| Connectors          |     13 |   4 |        4 |        3 | 3.67 | Drive/Sheets, Gmail and Calendar (1P GA) do real reads and approved writes, but the only 3P, Slack, just posts an ops summary.                                                                          |
| Day-to-day workflow |     13 |   5 |        5 |        4 |    4 | A nightly 23:00 schedule and a Gmail enrolment trigger read a versioned rules tab, heartbeat gaps become unobserved windows, and there is one batched approval.                                         |
| Research            |     13 |   4 |        4 |        4 |    4 | Counts match everyday.md (63,046 WAU, 100 posts, 77 asks) and the plan is reachable, but no source shows an APU supervisor rejecting data and 'no cluster covers it' rests on the crowd map.            |
| Time to impact      |     13 |   4 |        3 |        4 | 3.67 | Dated Feb/May 2027 plan with the operator named and assumptions listed, but first value needs 3 to 6 outside owners within a week and the doc's own 7 November kill criterion says that may not happen. |
| Theme               |     10 |   3 |        2 |        2 |    2 | The doc concedes no sensor is read; the Pi is a gateway classifying ASN and country, so IoT is absent even though the Funnel hop makes the network load-bearing and visible.                            |
| Originality         |      9 |   3 |        3 |        3 |    3 | No crowd cluster covers survey quality, but SurveySwap and Protect already ship the swap and the gateway, as the doc admits.                                                                            |
| Real use            |      6 |   4 |        4 |        4 |    4 | Local swapping habit and r/SampleSize/SurveyExchange activity are cited, and it reaches users in their own threads, but demand for the statement itself is unproven.                                    |
| Buildability        |      5 |   2 |        2 |        2 |    2 | Pi app, Funnel, lookup tables, Apps Script, two workflows and a two-sided cold start is too many parts for three people.                                                                                |
| Demo                |      5 |   4 |        4 |        4 |    4 | A reviewer can open a link on their own phone and see their carrier in the ledger, but the nightly workflow and approval are not reviewer-triggerable in-session.                                       |

- **Gates:** G1 pass (3 pass, 0 conditional, 0 fail); G2 conditional (2 pass, 1 conditional, 0 fail); G3 conditional (2 pass, 1 conditional, 0 fail); G4 pass (3 pass, 0 conditional, 0 fail).
- **Off-campus gate, per the lowest scorer:** The Pi stays at home behind Tailscale Funnel, recruiting is online, and nothing needs campus or APU staff.
- **What would help most, per the lowest scorer:** Cut scope to the provenance statement on the team's own survey plus 3 recruited owners, and replace Slack with a 3P connector that does real work (for example Jira for disputes).

## Research plan

All remote, with no APU staff:

- **Interviews (6 to 8), 6 to 8 November:** reply in the newest r/malaysiauni and X survey threads, answer the poster's survey first and ask for a 15-minute call, APU posters first. Ask how many respondents are required and by whom, days spent recruiting, what they do with suspicious answers, what their supervisor asked about the sample, and how their methodology chapter describes recruitment. Add 2 regular swappers for the respondents' side.
- **Timed observation, 7 November:** with consent, watch one FYP student's normal 30-minute recruiting session over screen share and count responses gained per minute spent. Time a teammate answering 3 surveys from r/SurveyExchange to set credit-minutes.
- **The team's survey, live 6 November through Tukar:** 8 questions, one attention check, and two self-reports, "Which country are you in right now?" and "Are you using a VPN right now?". Target 50 non-team responses, offering a swap, the local norm.
- **Items:** compare Tukar's country and network class with the self-reports on 50 real responses, reported with a Wilson 95% interval ([honest accuracy](/docs/research/judging.md#measuring-an-agents-accuracy-honestly)); two teammates independently label 40 real responses keep or exclude, blind to the flags, for "recall R and precision P on 40 real responses labelled by two reviewers (95% interval A to B), tested 9 November 2026". Self-reports come at submission and the network at session start, so a switch counts as a disagreement. **Consent:** quotes labelled by role; consent records and raw notes kept out of the repo ([consent](/docs/research/judging.md#consent-and-anonymised-quotes)). Not done: supervisor or examiner interviews.

## Time to impact

| When                         | Owner (role)                                                                           | What changes                                                                                                                                                     | Measured by                                                                                                    |
| ---------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| By 14 November 2026          | Exchange operator (team member)                                                        | 3 to 6 enrolled surveys, a live queue, nightly statements                                                                                                        | Responses per day against each owner's own 7-day baseline, with n                                              |
| 3 months, by 5 February 2027 | Operator, plus a student co-operator if a society such as GDG on Campus APU volunteers | Target 30 enrolled surveys and 1,500 responses; Microsoft Forms through owner-uploaded exports; Jira Cloud for disputes; a standby Pi at another teammate's home | Median days to target against baselines; disputes upheld                                                       |
| 6 months, by 5 May 2027      | The same                                                                               | Open to other Malaysian universities' students through r/malaysiauni; a quarterly aggregate note on student-survey provenance (counts only)                      | Members active per week; owners returning with a second survey. Stop if responses per day don't beat baselines |

Nothing waits on APU staff or systems; supervisors only see what students attach. Assumptions: outside owners keep enrolling through thread replies; the Pi stays at one home until someone buys a standby; no society has agreed to co-operate. **Inference:** the sponsored licence may end after the event, and Standard seats cost "from $30 per seat per month" ([editions](/docs/research/gemini-enterprise.md#gemini-enterprise-editions-and-prices)); nobody has committed to pay.

## Demo and review

The video runs about 3.5 minutes from the live system, labelled as a recording with its capture date:

1.  **0:00 to 1:00:** the problem (five pleas a day, 0 replies, "fill it up urselves", "won't be able to graduate"); then an owner enrols by email; the Gmail event run waits for approval, then creates the Calendar deadline and sends onboarding (Runs tab shown).
2.  **1:00 to 1:50:** two real sessions on one survey: a teammate's phone on mobile data lands as its carrier's ASN, MY, consumer, with no address stored; a teammate's laptop on a VPN gets R2 (`tester=true`); a Pi log line shows `Tailscale-Funnel-Request: ?1` and the address dropped.
3.  **1:50 to 2:40:** the nightly workflow: the Runs tab with its nights, the **Needs Review** approval, flags written, and one statement Doc.
4.  **2:40 to 3:30:** the outcome: responses per day before and after for real owners, with n (or "0 outside owners" if so), and the validation and precision and recall table; then how to review.

**Reviewer access:** each reviewer needs a licence seat, the Gemini Enterprise User role and the workflow shared with them, and outside domains may need an exception ([reviewer access](/docs/research/gemini-enterprise.md#reviewer-access)). Shared users see their own runs, so the README carries the owner's Runs tab. **Reviewer trigger:** without a seat, a reviewer opens the README's reviewer link on their own phone and answers the team's survey; the row appears within seconds in the ledger, which is shared view-only with reviewers and holds no emails, and on a VPN they'll see R2 fire. The next night's statement includes their row. Or they email an enrolment for their own Form and receive the onboarding mail once the operator approves; with a seat, they can also open the shared workflow.

## Build plan

Roles for three people: **A**, Pi and network; **B**, Apps Script and Gemini Enterprise; **C**, research, recruiting and the video. If the licence hasn't arrived, B builds the Apps Script side and drafts the workflow steps, and the workflows go live on the first licensed day.

| Day                   | A (Pi)                                                                                          | B (Apps Script, Gemini Enterprise)                                                                  | C (research)                                                                 |
| --------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Thu 5 Nov             | Funnel with an echo app; live test from a phone on mobile data and home Wi-Fi, logging ASN only | Ledger and contacts Sheets, `doPost`, Join Form with notice; one Funnel request lands in the ledger | Draft the team survey; reply in 10 threads, answering posters' surveys first |
| Fri 6 Nov             | Lookup tables, hashing, queue and redirect, heartbeat                                           | Feature script; Workflow A v0 (read plus statement draft) at 23:00                                  | Team survey live through Tukar; interviews 1 to 3                            |
| Sat 7 Nov             | Self-check and watchdog; check the first night's network classes                                | R1 to R4 in `script_flags` and the agent; approval and writes; Workflow B                           | Interviews 4 to 6; timed observation; **kill check at 18:00**                |
| Sun 8 Nov (Deepavali) | Panel cap on the queue                                                                          | Credits, queue order, Slack summary                                                                 | 2 to 4 owners live; every member registered before 23:59                     |
| Mon 9 Nov             | Freeze configuration                                                                            | Statement v1; export for labelling; **network-flag checkpoint**                                     | Label 40 responses; self-report validation; record the demo                  |
| Tue 10 Nov            | Freeze updates                                                                                  | Refresh schedule credentials; final runs                                                            | README, diagram, deck; submit early, before 23:59 MYT                        |

**Cut lines, in order:** the IPinfo Lite cross-check, the Editor onboarding path, the panel's queue-priority penalty, then the Calendar deadline event. **Never cut:** the Funnel gateway that drops the address, the ledger, the nightly workflow with its approval and statements, and the team-survey validation.

## Risks and kill criteria

1.  **A two-sided cold start**, the fatal risk all three scorers named: too few outside owners and respondents, so the before and after is the team measuring itself and R2 to R4 never fire. Conceded: the owners' before and after is the measurement most likely to fail, and `team=true` keeps the team from flattering it. What survives with no outside owner is the provenance half: the team survey's non-team respondents feed the 50-response validation and the 40-response labels. Mitigation: answer each poster's survey before asking them to join, and recruit members through the team survey before owners arrive.
2.  **Owners won't share their response Sheet with a stranger's account within 48 hours.** Then only the team's survey is enrolled. Mitigation: Viewer only, a 2-minute guide, and the team answering their survey first.
3.  **Many moving parts:** the Pi app, Funnel, lookup tables, Apps Script and two workflows. Mitigation: the cut lines above, and Thursday's one-request slice before anything else.
4.  **R2 to R4 don't fire on real sessions.** Then the pitch is provenance description, not fraud detection, and against a 5M-install timer add-on a timing-only result has no case.
5.  **The Pi or Funnel drops during 11 to 14 November.** Mitigation: watchdogs, the self-check, frozen updates from 10 November, and unobserved windows in each statement. Carrier-grade NAT could make R4 noisy, so R4 is review-only.

**Kill by Saturday 7 November, 18:00 MYT,** if any holds: fewer than 3 outside owners have enrolled after replies in 15 or more threads; fewer than 20 non-team sessions are in the ledger; the mobile-data test shows no public carrier address in `X-Forwarded-For`; or the first nightly run doesn't show a hosting or VPN session and a mobile-data session in different classes with `get_throttled` clean. If the kill fires, the team drops Tukar rather than submit the gateway on its own survey: without the exchange, what's left is provenance nobody has asked for.

**Network-flag checkpoint, Monday 9 November:** if no R2 to R4 flag has fired on a real non-team session, pitch the Pi as provenance description and drop any claim that it catches fraud.

## Not verified

- Nothing has been built or run: no session, workflow run, interview, label or enrolment exists.
- `X-Forwarded-For` on a live Funnel request (read from source code only), how often Funnel stops after a reconnect (a user report), and whether Malaysian carriers use carrier-grade NAT ([not verified](/docs/research/iot-and-network.md#not-verified)).
- Whether outside owners will join or share Sheets, and whether any supervisor or examiner values a provenance statement.
- Whether Protect's "Rented servers" check runs on Google Forms: its Google Forms answer lists only the bot trap, rushed answers, duplicates and the attention check. The Google Forms help page's wording on the submission timestamp wasn't re-read on 5 November (the page renders by script); the Viewer path's `TUKAR` placeholder swap is untested.
- The licence's edition, account type and arrival; whether the Gmail trigger watches the Tukar inbox as designed; whether workflow agent nodes can read Slack. APU's Research Ethics Policy is login-gated and wasn't read, so whether owners need an ethics amendment is unknown.

## See also

- [Tukar source doc (opus-03)](/docs/ideas/opus-03/01-tukar.md)
- [Cross-set idea ranking](/docs/ideas/00-ranking.md)
- [Hackathon brief](/docs/BRIEF.md) and [context](/docs/CONTEXT.md)
- [Recruiting on r/malaysiauni and X](/docs/research/everyday.md#what-recruiting-looks-like-there)
- [Phones, Pi 5 and Tailscale Funnel](/docs/research/iot-and-network.md)
- [Gemini Enterprise workflows, connectors and limits](/docs/research/gemini-enterprise.md)
- [Competition and saturation tiers](/docs/research/competition.md#saturation-tiers), and [judging, accuracy and consent](/docs/research/judging.md)

[recruiting]: /docs/research/everyday.md#what-recruiting-looks-like-there
[qaa]: https://www.qaa.ac.uk/docs/qaa/reports/asia-pacific-university-of-technology-and-innovation-iqr-24.pdf

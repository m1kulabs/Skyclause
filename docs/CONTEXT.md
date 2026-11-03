# Hackathon context

What a team needs to know, beyond the rules, to compete well in the APU Cloud Innovation Hackathon 2026: what the judges will likely reward, what past winners share, how to cover the Cloud + IoT + Network theme, and which tools and real data fit a one-week build. The event's facts (eligibility, tracks, dates, submission fields) are in the [brief]; the evidence behind this page is in [docs/research](/docs/research/). Written on 3 November 2026, before the briefing; **Inference** marks conclusions that no source states outright.

Contents:

1.  [Decisions so far](#decisions-so-far)
1.  [What the judges will likely reward](#what-the-judges-will-likely-reward)
    1.  [Likely criteria](#likely-criteria)
    1.  [Sponsor and organiser lenses](#sponsor-and-organiser-lenses)
1.  [What past winners share](#what-past-winners-share)
1.  [Crowded and open ground](#crowded-and-open-ground)
1.  [Covering the theme](#covering-the-theme)
    1.  [Cloud](#cloud)
    1.  [IoT](#iot)
    1.  [Network](#network)
1.  [Real data per track](#real-data-per-track)
1.  [Tools and accounts](#tools-and-accounts)
1.  [Recommended shape](#recommended-shape)
1.  [Submission checklist](#submission-checklist)
1.  [Build plan to 17 November](#build-plan-to-17-november)
1.  [Strategic risks](#strategic-risks)
1.  [See also](#see-also)

## Decisions so far

The repo allows only real public data, never mock or sample data, with no fallback when a source fails ([project conventions]). On 3 November 2026 the user ruled on the cases that rule left open for the IoT part:

- **Allowed:** live readings from the team's own phones or boards; a published real dataset replayed as a stream, labelled as a replay; a real sensor log the team recorded, once published with its provenance, then replayed.
- **Forbidden:** synthetic or random readings; recorded data shown when a live source fails (already in the rule); a recorded demo video. The demo link is therefore the live hosted app, and the live pitch runs live.

The case-by-case table is in [IoT and network](/docs/research/iot-and-network.md#real-versus-simulated-data).

[project conventions]: /docs/references/project-conventions.md

## What the judges will likely reward

Until the official criteria are out ([brief](/docs/BRIEF.md#judging-and-prizes)), this section rests on comparable rubrics and on what the organisers and sponsor publish. Replace it once the criteria appear.

### Likely criteria

Every comparable rubric scores technical implementation, and all but MLH's score problem and impact; most also score a working product, design, and originality ([judging and pitching]).

| Likely criterion          | Why we expect it                                                                             | Evidence to show                                                 |
| ------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Problem and impact        | In all but MLH's rubric; APU's own hackathons score "product validation"                     | A named APU user, a before/after metric, results from real users |
| Technical implementation  | In every rubric; Google rubrics ask why each Google product was chosen                       | Architecture diagram where each product has a distinct job       |
| Working product           | KitaHack wants "not a mockup"; comparable events reject incomplete entries before scoring    | Live hosted app, run instructions, a real-versus-replay table    |
| Feasibility and value     | The same School of Technology's Maybank Hackathon 2025 scored feasibility and business value | Who at APU would run it, what it costs, how it scales            |
| Design and originality    | Devpost, MLH, and Google rubrics                                                             | A clean flow on a phone; an angle the crowded ideas lack         |
| Presentation (final only) | KitaHack 2026's final gave presentation 40%                                                  | One rehearsed speaker, 3-, 5-, and 10-minute versions            |

The Solution Challenge 2026 India rubric also asks whether AI earns its place ("could a simpler approach have worked?"), the Gemini API Developer Competition scores LLM best practice, and comparable events gate on completeness first ([judging and pitching]).

### Sponsor and organiser lenses

**Inference:** each likely judge group has a visible bias ([judging and pitching]).

- **NTT DATA:** its 2026 messaging is Gemini Enterprise agents with Google Cloud, private 5G and edge AI, and, from its Malaysia blog, "operational problems where faster, richer information changes the outcome". Expect it to reward an operational problem with a measurable outcome and AI that acts, not only chats.
- **APU School of Technology:** its staff teach a Coral Edge TPU to Vertex AI pipeline and call Google APU's "primary cloud partner". Expect them to spot a faked IoT layer quickly and to value privacy-conscious edge processing.
- **Google Cloud:** expect a clear reason for every Google product and current product names.

## What past winners share

No earlier APU Cloud Innovation Hackathon, or NexConnect hackathon with published winners, was found, so this looks like the first edition ([past winners]). From 18 documented winners of KitaHack, the Solution Challenge, the Gemini API Developer Competition, the ADK Hackathon, and APU-run hackathons:

- **A narrow, named user:** people with mild dementia, ALS patients, flood rescuers, medical students rehearsing clinical exams; never just "students".
- **Several Google products in one pipeline,** not a lone chatbot: KitaHack 2025's champion EqualLens chained Gemini, Document AI, Cloud Vision, Speech-to-Text, and Firebase.
- **Trust features:** expert review, crowdsourced verification, bias checks, redaction of personal data.
- **Measured validation stands out because it is rare:** Gaze Link reported a 30-person test with up to 85% fewer keystrokes.
- **Hardware is rare but appears among winners:** 3 of the 10 Solution Challenge winners from 2022 to 2024 built a device; no KitaHack podium project with public details did.
- **Judges name real-world fit:** "real-world relevance" (KitaHack 2025), "real-world applicability" and "business value" (Maybank Hackathon 2025).

## Crowded and open ground

- **Crowded:** campus navigation, campus chatbots, AI tutors and learning companions, attendance and face recognition, mental health, and food waste. Several are on this hackathon's own idea list, and GDGoC APU has run workshops on attendance tracking and chatbots ([past winners]). **Inference:** many APU teams will start there.
- **Thinner on Devpost:** lecturer dashboards (35 matches), classroom occupancy (28), and helpdesk tickets (60). Campus energy (410) and study-space occupancy (216 for `occupancy sensor`) are more common, so they need a decision layer on top ([past winners]). **Inference:** IT support and lecturer insights are on this hackathon's own idea list, so expect company at APU even where Devpost is thin.
- **How crowded categories were won:** depth and scope, not novelty. EqualLens covered the whole hiring flow, and TrustLens set out 11 document types and 46 checks ([past winners]).

## Covering the theme

The theme is "When Cloud, IoT, and Network Converge" ([brief](/docs/BRIEF.md#at-a-glance)). **Inference:** with asynchronous judging, each of the three parts only scores if the repo, deck, and live app make it visible.

### Cloud

- Google has had no managed IoT service since Cloud IoT Core retired on 16 August 2023. For a few devices, Google's own pattern posts readings over REST or gRPC straight into Pub/Sub, with no MQTT endpoint described ([IoT and network]).
- **Inference, with a card:** device → HTTPS on Cloud Run → Pub/Sub → a BigQuery subscription and Firestore → Gemini, called on events and summaries rather than on every reading. A free EMQX Serverless broker can take MQTT, but neither EMQX pricing page confirms its Pub/Sub connector is in the free plan ([IoT and network], [Google tools]).
- **Inference, without a card:** phone browser → HTTPS on an AI Studio Starter Tier app (Cloud Run) → Firestore → Gemini API free tier. Pub/Sub needs a card and the BigQuery sandbox can't stream, so analytics would be batch-loaded ([Google tools]).

### IoT

- **Phones are the fastest real sensor:** geolocation, motion, camera, and microphone work in browsers on Android and iPhone; Web Bluetooth, Web NFC, and the Generic Sensor API are Chromium-only and absent on iOS ([IoT and network]).
- **Boards are a lead-time risk:** Cytron ships from Penang in 2–3 working days; the Pico W and NodeMCU ESP32 were out of stock on 3 November while the Pico 2 W was in stock at RM31.60–39.60; Deepavali is Sunday 8 November, with Monday 9 November reported as the replacement holiday (secondary) ([IoT and network]).
- **LoRaWAN isn't viable this week:** 1 of 96 mapped gateways near Kuala Lumpur was online, and Cytron's cheapest gateway costs RM998.75 ([IoT and network]).
- **Inference:** live public sensor feeds (air quality, river levels, bus positions) complement the team's own signal; see [Real data per track](#real-data-per-track).

### Network

- **Inference:** a network is invisible unless the demo shows it. Three visible proofs: per-reading latency from the device timestamp against Pub/Sub's server-set `publishTime`; a device dropping offline and its buffered readings arriving on reconnect (MQTT Will Messages, or Firestore offline writes, which are off by default on the web); a diagram naming every hop and protocol ([IoT and network]).
- **Campus Wi-Fi is unknown for devices:** OnBoard@APU uses an on-screen enrolment with up to four devices per user, and nothing public says whether headless boards can join. Plan on a phone hotspot and ask APU IT Helpdesk early ([IoT and network]).

## Real data per track

Each source below returned current data on 3 November 2026 without a key; endpoints, limits, and licences are in [public data sources].

| Track                  | Strongest real sources near APU                                                                                                                                        | Sensor feed          |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| Smart Campus           | Rapid Bus KL GTFS Realtime positions every 30 seconds, with route T580 stopping about 360 m from campus, joined to GTFS Static; OpenStreetMap around TPM; MET forecast | Bus GPS              |
| Intelligent Automation | Public Infobanjir gauge "Sg. Kuyoh di LRT Bukit Jalil" every 15 minutes with four alert thresholds; DOE APIMS air quality hourly, nearest station 5.9 km; MET warnings | River gauge, air     |
| Data-Driven Research   | OpenAlex's 3,711 APU works with topics (CC0); Rapid Rail daily origin-destination ridership, including Bukit Jalil, up to the previous day                             | No (daily aggregate) |

- **Nothing APU-specific is public:** APU publishes no API or open data, OpenStreetMap maps almost nothing inside the campus, and MOHE statistics never break APU out. **Inference:** don't promise APU student analytics from public data; campus ideas rest on the surrounding feeds plus the team's own sensors.
- **The limits force a server:** data.gov.my allows 4 requests a minute per API, APIMS blocks browser requests from other sites, and Infobanjir is HTML only. **Inference:** one cloud job that polls each feed and stores every snapshot with its source timestamp keeps the app inside the limits and is itself a visible network layer. When a poll fails, the app shows that feed's error, not the last snapshot.
- **Terms:** data.gov.my is CC BY 4.0 and OpenAlex is CC0; WAQI forbids storing its data, Open-Meteo's free tier is non-commercial, and APIMS and Infobanjir publish no terms. List attributions in the README.
- **Not verified:** Google Maps Platform and BigQuery public datasets, which need an enabled Cloud project.

## Tools and accounts

As of 3 November 2026; quotas and prices change without notice ([Google tools]).

- **Google AI tools:** `#welcome-and-rules` says to build with them, while the FAQ lists no required stack ([brief](/docs/BRIEF.md#source-discrepancies)). **Inference:** make Gemini central so both readings are met.
- **No payment card needed:** Google AI Studio Build mode can publish 2 full-stack apps on Cloud Run through the Starter Tier, with Firestore and sign-in; Starter Tier eligibility varies by account. The Gemini API free tier, Firebase Spark, the BigQuery sandbox (no streaming), the Maps Demo Key, and Data Studio are also free without a card. Use personal Google accounts: Workspace accounts can't use the Starter Tier.
- **A card is needed** for Pub/Sub, Cloud Functions, the $300 Free Trial (which doesn't cover the AI Studio Gemini API), and both Gemini Enterprise trials. Cloud Billing rejects prepaid cards and debit cards that require two-factor authentication. The Free Trial is once per person, so pick whose card the team uses early and add the others to that project.
- **Gemini Enterprise,** the subject of the NTT DATA training, is a seat-licensed workspace for staff, formerly Agentspace. The Business trial gives 5 seats for 30 days with a card, and can't host the team's own ADK agents. **Inference:** build the product on the Gemini API or Agent Platform, and use Gemini Enterprise at most as a staff-side view.
- **Free-tier Gemini limits:** prompts may be read by human reviewers and must not contain personal information; users must be 18 or older; per-model limits aren't published, one secondary source reports 20 requests a day for Gemini 3.8 Flash and others report more, and daily quotas reset at 4:00 PM MYT. **Inference:** use Flash-Lite for frequent calls.
- **Renamed in 2026:** Vertex AI is now Gemini Enterprise Agent Platform, Looker Studio is Data Studio, free Gemini CLI moved to Antigravity, Firebase Studio closed to new users, and Gemini 2.5 is legacy. Use current names in the README and deck.

## Recommended shape

**Inference**, from the sections above; the track and idea are the team's call.

- **Problem:** one campus operational problem for one named APU group, such as facilities staff, lab technicians, or researchers, where faster, richer information changes the outcome.
- **Signal:** a real live signal the judges can trigger from their own phones, plus a live public feed; one board only if it arrives by 6 November, and never on the critical path.
- **Decision:** Gemini turns events into a decision or an automated action with a human in the loop, not a chat box.
- **Proof:** a before/after metric and results from 5–10 real APU users, gathered this week.
- **Tracks:** Intelligent Automation and Data-Driven Research face a thinner field than Smart Campus apps; a Smart Campus entry needs a sharp angle.
- **Avoid:** campus chatbots, navigation, AI tutors, and attendance by face recognition without a distinct angle; face or other biometric data, which the 2024 PDPA amendment made sensitive; personal data in free-tier prompts; LoRaWAN; Gemini Enterprise as the backend.

## Submission checklist

This adds the quality layer to the required fields in the [brief](/docs/BRIEF.md#submission-requirements) ([judging and pitching]).

- **Repo:** public and opening from a logged-out browser; no secrets, with GitHub push protection turned on for the repository.
- **README order:** problem and track; live app link and screenshots; architecture diagram (device, network, cloud, AI); a table of what is live, what is replayed, and from which source; run instructions; data sources and licences; AI tools used, including coding assistants; team.
- **Deck:** a PDF of at most 10 MB that reads without a presenter: one idea per slide with a headline sentence, sections that follow the likely criteria, links to the repo and live app on the first and last slides, and a privacy slide. **Inference:** the brief doesn't mention the SDGs, but one line naming a target is cheap insurance.
- **Live app:** works on Android and iPhone, and stays up and within quota through the 11–14 November assessment, with any board that feeds it powered and online. If a live source fails it shows the error, never cached data.

## Build plan to 17 November

**Inference:** a schedule that front-loads the risky parts.

| When      | Goal                                                                                                            |
| --------- | --------------------------------------------------------------------------------------------------------------- |
| 3 Nov     | Attend the briefing together; pick track, user, and problem; order any board by 4 November                      |
| 4–5 Nov   | One thin slice live end to end: real signal → cloud → Gemini → UI, deployed                                     |
| 6–7 Nov   | The decision or action layer and one trust feature; test with 5–10 APU users and record the numbers             |
| 8 Nov     | Deck and README drafts; confirm every member has registered before registration closes that night               |
| 9 Nov     | Feature freeze; logged-out repo and app check on two phones; compress the deck                                  |
| 10 Nov    | Final submission by the leader early in the day, not at 11:59 PM                                                |
| 11–14 Nov | Assessment: keep the app, feeds, and any board running; watch quotas; leave the repo's default branch untouched |
| 15 Nov    | Top 5 announced; if selected, cut the pitch to the announced format                                             |
| 16–17 Nov | Rehearse with one speaker; test the auditorium network and a phone hotspot; pitch live                          |

## Strategic risks

The [brief's open questions](/docs/BRIEF.md#open-questions) list what the organisers haven't answered. Risks to plan around:

- **The criteria may reweight everything above.** Re-read this page when they are released.
- **Quota exhaustion while judges test the app,** 11–14 November: call Gemini on events, rate-limit per user, and move to a paid tier if a card is available. Caching as a fallback is ruled out.
- **A public source failing during assessment:** the rule requires showing the error, so prefer documented sources. The APIMS endpoint is undocumented and could change without notice.
- **Devices can't join campus Wi-Fi:** use a phone hotspot; ask APU IT Helpdesk this week.
- **Age and data terms:** the Gemini API requires users to be 18 or older; keep student data out of free-tier prompts.
- **Stale tutorials** that use 2025 product names and retired free tiers.

## See also

- [Brief](/docs/BRIEF.md): the event's rules, dates, and open questions.
- [Past winners]: winner profiles, patterns, and crowding counts.
- [Judging and pitching]: comparable rubrics, sponsor focus, packaging, pitching, and privacy.
- [Google tools]: products, quotas, prices, and the no-card path.
- [IoT and network]: Google Cloud IoT architecture, sensors, boards, protocols, and pitfalls.
- [Public data sources]: the live data catalogue per track.

[brief]: /docs/BRIEF.md
[past winners]: /docs/research/past-winners.md
[judging and pitching]: /docs/research/judging-and-pitching.md
[Google tools]: /docs/research/google-tools.md
[IoT and network]: /docs/research/iot-and-network.md
[public data sources]: /docs/research/public-data-sources.md

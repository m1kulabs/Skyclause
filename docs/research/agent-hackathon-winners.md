# Agent hackathon winners

What did documented winners of agent and workflow-automation hackathons build, especially at events judged by enterprises on agent platforms with connectors, and what do they share that maps to NTT DATA's judging outline from the briefing? This file adds agent-focused events to [past winners](/docs/research/past-winners.md) and doesn't repeat it. Researched on 3 November 2026; anything no source states outright is marked **Inference**.

Contents:

1.  [Google agent events](#google-agent-events)
    1.  [Gemini Enterprise, Agentspace, and Antigravity](#gemini-enterprise-agentspace-and-antigravity)
    1.  [Google Cloud Rapid Agent Hackathon](#google-cloud-rapid-agent-hackathon)
    1.  [Gemini 3 Hackathon](#gemini-3-hackathon)
    1.  [Agentic AI Day 2025](#agentic-ai-day-2025)
    1.  [APAC and Malaysia](#apac-and-malaysia)
1.  [NTT DATA hackathons and contests](#ntt-data-hackathons-and-contests)
1.  [Other agent hackathons](#other-agent-hackathons)
    1.  [Microsoft Agent Academy Hackathon](#microsoft-agent-academy-hackathon)
    1.  [Microsoft AI Agents Hackathon 2025](#microsoft-ai-agents-hackathon-2025)
    1.  [AWS AI Agent Global Hackathon](#aws-ai-agent-global-hackathon)
1.  [University and campus-operations agents](#university-and-campus-operations-agents)
    1.  [Education winners](#education-winners)
    1.  [University customer stories](#university-customer-stories)
1.  [Agents acting on sensor and telemetry data](#agents-acting-on-sensor-and-telemetry-data)
1.  [Winner profiles](#winner-profiles)
1.  [Patterns by NTT DATA's judging points](#patterns-by-ntt-datas-judging-points)
    1.  [Impact on students, the university, or operations](#impact-on-students-the-university-or-operations)
    1.  [Connectors and MCP](#connectors-and-mcp)
    1.  [Problem research](#problem-research)
    1.  [Time to impact](#time-to-impact)
    1.  [Day-to-day automated workflows](#day-to-day-automated-workflows)
    1.  [Standing out in crowded categories](#standing-out-in-crowded-categories)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [See also](#see-also)

## Google agent events

### Gemini Enterprise, Agentspace, and Antigravity

- Not found: any hackathon, challenge, or showcase with published winners built inside Gemini Enterprise or Google Agentspace. Searched web search, Devpost, the Google Cloud blog, and NTT DATA's newsroom for "Gemini Enterprise", "Agentspace" and "hackathon", "winners" or "challenge".
- Google's GKE hackathon post (3 December 2025) announced Gemini Enterprise Agent Ready (GEAR) as "a new educational sprint designed to help developers and decision-makers learn, build and deploy AI agents", launching in early 2026 ([gke winners]). It is a learning programme with badges, not a competition with winners.
- None of the 18 Rapid Agent winners below lists Gemini Enterprise or Agentspace in its "Built with" tags; 12 list the Agent Development Kit (ADK) ([rapid gallery]). The nearest low-code, connector-based analogue with published winners is Microsoft's Copilot Studio hackathon ([below](#microsoft-agent-academy-hackathon)).
- **Antigravity:** GDG Surabaya ran an Antigravity hackathon whose first place went to two UPN "Veteran" Jawa Timur students. The university's article (2 September 2026) doesn't describe the project or tools ([antigravity surabaya]). GDG chapters in Islamabad, Surrey and Jordan listed Antigravity hackathons in May 2026, with no winners posted. Not found: any Antigravity winner with a documented project.

[gke winners]: https://cloud.google.com/blog/topics/developers-practitioners/winners-and-highlights-from-gke-hackathon
[antigravity surabaya]: https://sisfo.upnjatim.ac.id/mahasiswa-sistem-informasi-raih-juara-1-hackathon-antigravity-google-developer-groups-surabaya/

### Google Cloud Rapid Agent Hackathon

This is the closest public match to the briefing's "connectors plus MCP" brief: Google Cloud Partnerships ran it on Devpost from 5 May to 11 June 2026, and it drew more than 14,500 registrations and 1,430 projects ([fivetran winners]).

- **Brief:** "Build a functional agent—powered by Gemini and Google Cloud Agent Builder—that integrates a Partner Entity's MCP server to solve a real challenge", in one of six partner tracks: Arize, Dynatrace, Elastic, Fivetran, GitLab, MongoDB ([rapid rules]).
- **Judges:** "a panel of experts who are employees of Sponsor, Devpost and/or Partners", so enterprise vendors scored entries in their own tracks ([rapid rules]).
- **Judging:** stage one is pass/fail on whether the entry "reasonably applies both the required data provided by Partner and Google Cloud products". Stage two weighs four criteria equally: technological implementation ("Does the interaction with Google Cloud and Partner services demonstrate quality software development?"), design, potential impact, and quality of the idea ([rapid rules]).
- **Winners**, first to third in each track, from the winner labels on each Devpost project page ([rapid gallery]):
  - Arize: Cassandra (an agent that watches other agents for confident wrong answers), ComplianceOS (audits code against real law), ClinTrace (emergency department triage with every reasoning step traced).
  - Dynatrace: AutoSRE (an autonomous on-call engineer), Karma (learns a deprecated service's hidden contracts and catches regressions in its replacement), Heimdall (autonomous incident response).
  - Elastic: CrisisRoute AI (matches emergency patients to hospitals), BLUEPRINT (seven agents run property due diligence on US public records), Carryover (detects visa-agency scams and files complaints).
  - Fivetran: Unravel, TruthKeeper, How Did I?
  - GitLab: mnemosyne (predicts outages and gates CI pipelines), STYLOMETRY (a forensic guardrail for pipelines), ContribPilot (guides open-source contributors).
  - MongoDB: Epiq (an AI outbreak tracker), KickOff (seven agents move 82,500 World Cup fans to a stadium over live MongoDB data), Sentinel Flood-Watch.
- **What the sponsor said:** Fivetran's write-up of its three winners says "None of the teams set out to build a better chatbot", and that they "all shared one thing: they solved real-world challenges by giving AI agents access to reliable, continuously updated information" ([fivetran winners]).

### Gemini 3 Hackathon

Google DeepMind ran it on Devpost from 17 December 2025 to 9 February 2026. It received more than 4,500 submissions, and winners came out in April 2026 after three delays ([gemini 3 updates]).

- **Grand prize:** Globot, multi-agent supply-chain crisis management with "2M-token compliance analysis" and "satellite imagery risk detection" ([globot]).
- **Second:** Aegis, "an autonomous multi-agent command center that prevents 911 collapse by triaging thousands of distress" calls ([aegis]).
- **Third:** Netra, a vision system for visually impaired people. A Devpost forum thread alleges the third-place entry contained a prompt injection aimed at the judges; no response from the organisers was found ([netra dispute]).
- **Honourable mentions (10)** include OrphaFold (agents bridging Orphanet, UniProt, PubMed and AlphaFold for rare diseases), Logic Lift (recovers business logic from legacy COBOL), PROCSee (autonomously investigates system processes) and BatteryForgeAI (battery defect detection and fleet safety) ([gemini 3 gallery]).

[gemini 3 updates]: https://gemini3.devpost.com/updates
[aegis]: https://devpost.com/software/aegis-autonomous-multi-agent-crisis-command
[netra dispute]: https://gemini3.devpost.com/forum_topics/43667-third-place-was-a-prompt-injection-attack-devpost-and-google-owe-participants-an-answer

### Agentic AI Day 2025

Google Cloud and Hack2skill ran a 30-hour offline final in Bengaluru on 27 July 2025, after 57,000+ participants in 9,100+ teams; 700+ teams were shortlisted ([gurumitra playbook], secondary).

- **First place:** Team Gurumitra (LNMIIT students), "empowering teachers in multi-grade classrooms with AI-driven support" ([gurumitra]).
- **How they say they won:** they ran "a short survey with 48+ teachers", added an "LLM as a Judge" safety check for harmful inputs, and wrote "Yes, we saw fancier, more complex solutions around us. But what helped us win? We stayed true to the problem and kept it tight" ([gurumitra playbook], secondary).
- Not found: a full list of the other winners.

### APAC and Malaysia

- The ADK Hackathon's APAC winner (GreenOps) and the Solution Challenge APAC edition are in [past winners](/docs/research/past-winners.md#global-comparables).
- GDG on Campus UTM's "Build with AI 2026: Project 2030 MyAI Future Hackathon" (Johor Bahru, March to May 2026) lists prizes and a Google office tour for student winners, but its event page names no winners ([utm build with ai]).
- Not found: any Google Cloud agent competition in Malaysia with published winners.

[utm build with ai]: https://gdg.community.dev/events/details/google-gdg-on-campus-universiti-teknologi-malaysia-johor-bahru-malaysia-presents-build-with-ai-2026-hackathon-project-2030-myai-future-hackathon/

## NTT DATA hackathons and contests

Little found. Searched for about 8 minutes: web search for NTT DATA with "hackathon" plus Malaysia, university, students, Gemini Enterprise, Agentspace, agentic, Axet, and Open Innovation Contest; NTT DATA newsroom pages; NTT DATA VDS (Vietnam); and InsurTech Hub Munich. No NTT DATA hackathon in Malaysia, none with an APAC university, and none built on Gemini Enterprise turned up.

- **NTT DATA VDS Hackathon 2025 (Vietnam):** themed on "technological innovation applying AI in the workplace". First prize went to Team "Trẻ", second to "Hiệp Sĩ Quân Doanh", and third jointly to Grok and Friends and Thunderbolt. The post doesn't say what anyone built, and the only judging hint is "practical applicability" ([vds hackathon]).
- **Agentic AI Hackathon @ NTT Data (Munich, 13 November 2025):** a one-day event with InsurTech Hub Munich where teams "build intelligent agents that solve real-world problems" from "a focused case study". No winners were published ([munich hackathon]).
- **NTT DATA Hackathon 2026:** the only trace is a YouTube video by a self-described winner showing "a low-code Generative AI workflow" built with Axet Flow, NTT DATA's own GenAI platform. No official results were found ([axet video], secondary).
- **Older events:** the 2019 Code for Good hackathon in India drew more than 7,000 students from 800 colleges, and Team RedPillBlues won with breast cancer detection ([code for good]). The 2022 healthcare AI hackathon and 13th Open Innovation Contest press releases now return "page not found" on nttdata.com.
- Not found: any NTT DATA statement on why a hackathon entry won. NTT DATA's 2026 corporate focus is in [judging and pitching](/docs/research/judging-and-pitching.md#ntt-data).

[vds hackathon]: https://nttdata-vds.com/blog/hackathon-2025-grand-finale-wraps-up-the-journey-of-ideas-continues/
[munich hackathon]: https://www.insurtech-munich.com/en/event/agentic-ai-hackathon-ntt-data/
[axet video]: https://www.youtube.com/watch?v=Q2EnLgv2Hd0
[code for good]: https://us.nttdata.com/en/news/press-release/2019/may/ntt-data-hosts-code-for-good-hackathon

## Other agent hackathons

### Microsoft Agent Academy Hackathon

This is the best published analogue for a low-code agent platform with first-party and third-party connectors. Builders shipped Copilot Studio agents from 12 May to 2 June 2026, and Microsoft posted the winners on 18 June 2026 with a "concepts on display" list for each one ([agent academy]):

- **Operative track, first: VendorGuard,** "the single highest-scoring entry of the entire hackathon". When a contract PDF arrives by email, a Power Automate flow creates a Dataverse record, extracts the text, posts to Teams and hands off to an orchestrator. Four specialist agents then score the contract against 15 rules in five dimensions, rated Red/Amber/Green. It "takes you from email to report in under two minutes, with the rulebook stored in Dataverse so it can change without touching the agent".
- **Special Ops track, first: SprintForge.** A Scrum Master forwards an email; the agent extracts goals and stories, enriches them through the Microsoft Learn MCP server, and creates the issues through a Jira MCP server. The team reports "up to a ~70% reduction in sprint-prep time", and it was "a unanimous favourite among the primary judges".
- **Cowork Collective track, first: an autonomous IT service desk.** Tickets come in through a SharePoint portal, and a Copilot Studio agent triages them. Any tenant-changing action "pauses for a manager's one-tap approval via a Teams adaptive card" before a narrowly scoped service principal runs it through Microsoft Graph and logs an audit record.
- **Recruit track, first: Performance Development Assistant.** It turns review feedback into a development plan from three SharePoint lists (skills, mentors, materials) and Microsoft Learn, and routes restricted resources through a manager-approval flow. It had the track's "top technical-execution score (9/10)".
- **Others with notable judging notes:** Warehouse Picking Agent (a custom MCP server to Dynamics 365), where "judges saw a strong business case for replacing specialised warehouse-picking devices"; a vehicle-insurance self-service agent that escalates "to a human after two failed identity checks" and asks for "explicit confirmation before any irreversible action"; and FrostByte AI Advisor, triggered on a schedule and by SharePoint events.

### Microsoft AI Agents Hackathon 2025

The hackathon ran online from 8 to 30 April 2025: 18,000+ registrations and 570 submissions, "judged on innovation, impact, usability, solution quality, and category alignment" ([ms agents winners]).

- **Best overall:** RiskWise, which flags supply-chain risks from shipping and trade-disruption data (Azure AI Agent Service, Semantic Kernel, SQL).
- **Best Copilot agent:** WorkWizee, a Teams agent for P1/P2 incident calls that updates Jira, Bitbucket, Confluence and Outlook from natural-language commands, "saving up to 40% of time spent on incident management" (Copilot Studio, Azure Functions).
- **Other category winners:** Apollo (deep research), Bit2Brain, ModelProof (checks one model's answers against another's), TARIFFED! (tariff questions grounded in a SQL copy of the US tariff schedule) and Konveyor (knowledge transfer).
- **Caveat:** the winners page guesses at parts of some builds ("It likely uses Semantic Kernel"), so treat its technical detail as secondary.

### AWS AI Agent Global Hackathon

The hackathon ran from 8 September to 20 October 2025, and winners were revealed at re:Invent in December 2025 ([aws winners]).

- **First:** EcoLafaek, a citizen reporting app plus an autonomous agent (Amazon Bedrock Nova Pro, AgentCore). It classifies waste photos and maps pollution hotspots for authorities facing "over 100 tons of daily uncollected waste in Dili", Timor-Leste.
- **Second:** AegisAgent, which turns manual insurance-claim reviews into "a transparent, defensible coverage decision workflow" using agents for evidence, policy interpretation and compliance reasoning.
- **Third:** Province, which fills in US tax forms through a multi-agent pipeline and claims "100% accuracy on Form 1040".
- **Category winners:** a multi-agent fraud-alert triage system (AgentCore), Oratio (Bedrock), Compliance Guardian (Amazon Q), Drishti AI Navigator (Nova Act) and AgentShell (Strands SDK).

## University and campus-operations agents

### Education winners

- Education is rare among agent-hackathon winners: none of the 18 Rapid Agent winners, the 12 Agent Academy winners, or the 3 AWS top-three winners targets students or a university ([rapid gallery], [agent academy], [aws winners]).
- The exceptions found are Gurumitra (teachers in multi-grade classrooms, [above](#agentic-ai-day-2025)) and the ADK Hackathon's Edu.AI ([past winners](/docs/research/past-winners.md#adk-hackathon-with-google-cloud)).
- Not found: a hackathon-winning agent for admissions, student services, or university IT support.

### University customer stories

These come from Google's customer list (updated 22 April 2026), its Gemini at Work 2026 post (8 October 2026), and analyst coverage. Few publish an outcome figure, and only Stanford gives a time to launch.

- **Admissions (YDUQS, Brazil):** Vertex AI automates screening of cover letters for student admissions, "resulting in a 90% success rate and a 4-second average response time", and has saved "approximately BRL 1.5 million since adoption" ([google use cases]).
- **Student services (NTU Singapore):** a housing chatbot built on Dialogflow CX and Gemini answers student housing queries and "saves the customer service workforce more than 100 hours per month" ([google use cases]).
- **University IT (Stanford):** University IT built the Stanford AI Playground on Gemini Enterprise Agent Platform and GKE "in just two months"; it serves "more than 7,000 active users" ([google use cases]).
- **Administration at scale (Qatar University):** with Gemini Enterprise deployed campus-wide, "thousands of faculty and staff are deploying more than 2,000 custom AI agents to modernize institutional workflows, automate complex administrative operations" ([gemini at work 2026]).
- **Other Gemini Enterprise rollouts without figures:** Laureate Education (nearly 500,000 students, academic and administrative operations), Arden University (30,000+ students and staff) and SUNY ([gemini at work 2026]); UC Riverside, "a unified portal for agent experiences" for 25,000 people ([tambellini rating], secondary).
- **Enrolment (Arizona State University):** a BigQuery propensity model "increased registrations by 52% compared to traditional lead scoring methods" ([google use cases]).
- **Analyst view:** the Tambellini Group's 2026 StarChart rated Gemini Enterprise for Education a "Commander" for AI agents for administrative efficiency. The coverage notes that universities weigh AI for "admissions, enrolment, student retention and research administration" with "governance and auditability" as key requirements ([tambellini rating], secondary).

[gemini at work 2026]: https://cloud.google.com/blog/products/ai-machine-learning/welcome-to-gemini-at-work-2026
[tambellini rating]: https://itbrief.news/story/gemini-enterprise-wins-top-ai-agents-rating-for-universities

## Agents acting on sensor and telemetry data

No winner found has an agent acting on physical campus sensors such as temperature or occupancy. The nearest are agents that act on network telemetry, satellite feeds, and production observability data:

- **Network telemetry (University of Leeds OREO team):** first place at AWS's "Breaking Barriers for Agentic Networks" hackathon at FYUZ25 in Dublin (November 2025). One agent forecasts Open RAN traffic and classifies radio-unit load. A second applies policies "including the dynamic switching of RUs on or off to reduce energy consumption without compromising service quality", built on Bedrock, AgentCore, Lambda, DynamoDB and a dashboard of agent decisions ([leeds oreo]). A second team also claims first place at the same event on its own company site, so the placing is disputed.
- **Satellite remote sensing (Sentinel Flood-Watch, Rapid Agent MongoDB third):** computes vegetation and water indices from Sentinel-2 imagery in Earth Engine for four Accra wetland zones. Scans run on a Cloud Scheduler webhook, and alerts are logged through the MongoDB MCP server, with Model Armor guarding prompts and Arize tracing every call ([sentinel flood-watch]).
- **Hazard feeds (Calamity Agent, Agent Academy Special Ops second):** a custom MCP server chains geocoding, National Weather Service alerts and NASA FIRMS fire detections; it answers questions rather than running unattended ([agent academy]).
- **Production telemetry (Rapid Agent Dynatrace track):** all three winners act on monitoring data. Heimdall "watches your Dynatrace tenant 24/7" and "opens a pull request", and AutoSRE "cannot touch production without your one-tap approval" ([rapid gallery]).
- **IoT data hackathon (GS1 Hong Kong, April 2026):** the student champion, De-Buggers, built a supply-chain system "from predicting risks to automated responses" over container, order and warehouse data with live weather and shipping news; the article doesn't call it an agent ([hk iot hackathon], secondary).

[hk iot hackathon]: https://www.bastillepost.com/global/article/5780127-iot-data-hackathon-2026-winners-announced-mtr-newcomers-score-triple-victory-muhk-team-sweeps-four-awards

## Winner profiles

"Not stated" means the cited sources don't say. Outcome figures are the teams' or organisers' claims, not independent measurements.

| Project                          | Event and place                          | What it does, for whom                                           | Platform and connectors                                              | Outcome stated                        |
| -------------------------------- | ---------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------- |
| [VendorGuard][agent academy]     | Agent Academy 2026, Operative 1st        | Scores incoming vendor contracts; procurement teams              | Copilot Studio, Power Automate, Outlook, Dataverse MCP, Teams        | Email to report in under two minutes  |
| [SprintForge][agent academy]     | Agent Academy 2026, Special Ops 1st      | Emailed notes into Jira sprint plans; Scrum Masters              | Copilot Studio, Microsoft Learn MCP, Jira MCP                        | Up to ~70% less sprint-prep time      |
| [IT service desk][agent academy] | Agent Academy 2026, Cowork 1st           | Triages tickets, approval-gated fixes; SMB IT                    | Copilot Studio, SharePoint, Power Automate, Teams, Microsoft Graph   | Not stated                            |
| [Unravel]                        | Rapid Agent 2026, Fivetran 1st           | Re-scores uncertain DNA variants as evidence changes; clinicians | ADK, Gemini, BigQuery, Fivetran MCP (ClinVar, gnomAD, AlphaMissense) | Not stated; draft-only by design      |
| [TruthKeeper]                    | Rapid Agent 2026, Fivetran 2nd           | Reconciles CRM and billing records; SaaS operations              | ADK, BigQuery, Fivetran MCP                                          | Estimates impact per discrepancy      |
| [Heimdall]                       | Rapid Agent 2026, Dynatrace 3rd          | Diagnoses incidents and opens fix PRs; on-call engineers         | ADK, Cloud Run, Dynatrace MCP, GitHub                                | Not stated                            |
| [Sentinel Flood-Watch]           | Rapid Agent 2026, MongoDB 3rd            | Scheduled wetland encroachment scans; Accra disaster agencies    | ADK, Gemini, Earth Engine, MongoDB MCP, Cloud Scheduler, Model Armor | Not stated                            |
| [Globot]                         | Gemini 3 Hackathon 2026, grand prize     | Replans shipping around crises; supply-chain teams               | Gemini 3 multi-agent                                                 | Not stated                            |
| [Gurumitra]                      | Agentic AI Day 2025, 1st                 | AI support for multi-grade classrooms; teachers                  | Google Cloud (stack not stated)                                      | 48+ teachers surveyed                 |
| [WorkWizee][ms agents winners]   | Microsoft AI Agents 2025, best Copilot   | Runs P1/P2 incident chores from Teams; engineering teams         | Copilot Studio, Jira, Bitbucket, Confluence, Outlook APIs            | Up to 40% less incident-handling time |
| [EcoLafaek][aws winners]         | AWS AI Agent Global 2025, 1st            | Classifies and maps reported waste; Dili authorities             | Bedrock Nova Pro, AgentCore                                          | Not stated                            |
| [AegisAgent][aws winners]        | AWS AI Agent Global 2025, 2nd            | Explainable insurance-claim decisions; claims reviewers          | Bedrock, Kiro                                                        | Not stated                            |
| [OREO][leeds oreo]               | AWS Breaking Barriers networks 2025, 1st | Switches radio units to save energy; network operators           | Bedrock, AgentCore, Lambda, DynamoDB                                 | Not stated                            |

[unravel]: https://devpost.com/software/unravel-7ak8lf
[truthkeeper]: https://devpost.com/software/truthkeeper
[heimdall]: https://devpost.com/software/project-hpfwsu51xila

## Patterns by NTT DATA's judging points

The briefing's five points are in the [brief](/docs/BRIEF.md#judging-and-prizes). Each pattern below lists the evidence first; the strategy reading is marked **Inference**.

### Impact on students, the university, or operations

- Most winners serve a named staff role in an operational workflow: procurement (VendorGuard), Scrum Masters (SprintForge), on-call engineers (Heimdall, AutoSRE), clinicians (Unravel), claims reviewers (AegisAgent), warehouse pickers. Fivetran: "None of the teams set out to build a better chatbot" ([fivetran winners]).
- Winners name the scale of the problem: "over 100 tons of daily uncollected waste in Dili" (EcoLafaek), Ghana's annual flood losses from UNDP figures (Sentinel Flood-Watch), "thousands of distress" calls (Aegis).
- **Inference:** the briefing's own example, an admissions analyst working through thousands of files, matches this operations pattern. An agent for a named APU office, sized with a real volume, fits NTT DATA's frame better than a student chatbot.

### Connectors and MCP

- Winners chain several first-party and third-party systems, and the write-ups list them: VendorGuard (Outlook, Power Automate, Dataverse, Teams, Dataverse MCP), SprintForge (Microsoft Learn MCP, Jira MCP), WorkWizee (Jira, Bitbucket, Confluence, Outlook, Teams), Unravel (three genomics sources piped into BigQuery, plus Fivetran MCP).
- Rapid Agent's technical criterion is literally "the interaction with Google Cloud and Partner services" ([rapid rules]). Microsoft's post lists each winner's platform features as "concepts on display" ([agent academy]).
- Several winners keep business rules in a connected data store rather than the prompt: VendorGuard's 15-rule rulebook in Dataverse, TARIFFED!'s SQL copy of the tariff schedule.
- **Inference:** NTT DATA said it mainly scores 1P and 3P connectors, with MCP as an add-on, so a README section listing every connector and the job it does will probably be read closely. The briefing named Jira, SAP, SharePoint, Supabase, and Workspace as available.

### Problem research

- Gurumitra surveyed 48+ teachers and credits sticking to the problem over "fancier, more complex solutions" ([gurumitra playbook], secondary). Unravel was built by a cancer geneticist ([fivetran winners]).
- Sentinel Flood-Watch cites UNDP loss figures and names the agencies that lack monitoring tools, the Accra Metropolitan Assembly and NADMO ([sentinel flood-watch]).
- **Inference:** real user contact (a survey, an interview with an APU office) and a cited volume figure are the cheapest research evidence, and few teams show either.

### Time to impact

- No winner found states a rollout horizon such as three or six months. Outcome claims are per-task speed or time saved: under two minutes (VendorGuard), ~70% (SprintForge), 40% (WorkWizee).
- Customer stories give the only deployment-time figure: Stanford's AI Playground "in just two months" ([google use cases]). YDUQS and NTU give running outcomes (90% success and 4-second responses; 100 hours a month saved) without a timeline.
- **Inference:** a stated plan, such as live on one intake within three months and measured against a baseline, would set an entry apart because published winners don't do it. Borrow the customer stories' style of metric: hours saved a month, response time, accuracy against a manual check.

### Day-to-day automated workflows

- Winners start from an event or a schedule, not a chat message: an email arriving (VendorGuard, SprintForge), a ticket (the IT service desk), Cloud Scheduler (Sentinel Flood-Watch), scheduled and SharePoint triggers (FrostByte), 24/7 monitoring (Heimdall), continuous reconciliation (TruthKeeper), a daily briefing (How Did I?).
- The same winners gate irreversible actions on a person: one-tap approval (AutoSRE, the IT service desk), per-item approval (Client Kick-off Skill), draft-only output with low-confidence findings withheld (Unravel), corrective actions "for human approval before updating source systems" (TruthKeeper), confirmation before irreversible steps (the insurance agent).
- **Inference:** this is what the presenter's "maximizing" looks like in winning entries: the agent runs on triggers for months, does the routine work alone, and asks a person before anything it can't undo. Show the trigger, the approval step, and an audit log in the demo.

### Standing out in crowded categories

- **Incident response:** all three Dynatrace winners are on-call agents. They differ in what they're allowed to do: AutoSRE queues a fix behind approval, Heimdall opens a pull request, and Karma learns a retired service's hidden contracts ([rapid gallery]).
- **Document review**, the closest category to admissions: VendorGuard won with a concrete rulebook (15 rules, five dimensions, a Red/Amber/Green score) that staff can change without touching the agent. AegisAgent won on "transparent, defensible" decisions. Province won with an accuracy claim on one specific form ([agent academy], [aws winners]).
- **Disaster and crisis:** Aegis, CrisisRoute, Sentinel Flood-Watch, Calamity Agent and EcoLafaek all won. The ones with detail pin themselves to one place and dataset (Accra wetlands, Dili waste reports).
- **Inference:** in a crowded category, the winners' edge is a narrow, inspectable rule set and an explicit limit on what the agent can do alone, not more agents.

## Takeaways for this hackathon

- **Evidence:** no Gemini Enterprise hackathon with published winners was found, and no NTT DATA judging record either. **Inference:** the closest evidence is Microsoft's Copilot Studio hackathon and Google's MCP-partner hackathon, and both rewarded event-triggered, connector-heavy operations agents.
- **Evidence:** winning agents start on an email, a ticket, a schedule or a data change, and pause for human approval before irreversible actions. **Inference:** build the agent to trigger on its own (for example, new application files landing in Drive or SharePoint), show the approval step, and show what it did overnight.
- **Evidence:** winning write-ups name every connected system. **Inference:** a README table of 1P and 3P connectors with what each one does maps straight onto NTT DATA's main technical criterion; add an MCP server only after that.
- **Evidence:** published winners give per-task outcomes but no rollout timeline. **Inference:** a three-month or six-month plan with a baseline (how long the office takes now) answers a judging point most entries will skip.
- **Evidence:** student-facing education agents rarely win agent hackathons, while university customer stories centre on admissions, student services and administration (YDUQS, NTU, Qatar University). **Inference:** an operations agent for a named APU office is the safer fit; see [past winners](/docs/research/past-winners.md#saturated-idea-types) for crowded student-app ideas.
- **Evidence:** sensor-driven agent winners act on network, satellite or monitoring telemetry, not campus IoT. **Inference:** an agent that acts on a live campus feed, such as switching or ticketing based on occupancy or energy readings, would be close to unopposed. See [IoT and network](/docs/research/iot-and-network.md).

## See also

- [Brief](/docs/BRIEF.md) and the [briefing transcript](/docs/sources/briefing-session/transcript.md): the judging outline and the "maximizing" remarks.
- [Past winners](/docs/research/past-winners.md) and [judging and pitching](/docs/research/judging-and-pitching.md): earlier winner profiles, rubrics, and NTT DATA's corporate focus.
- [Google tools](/docs/research/google-tools.md) and [IoT and network](/docs/research/iot-and-network.md): sibling research files.
- [Rapid Agent gallery][rapid gallery], [Agent Academy winners][agent academy] and [Gemini 3 gallery][gemini 3 gallery]: full winner lists.

[rapid rules]: https://rapid-agent.devpost.com/rules
[rapid gallery]: https://rapid-agent.devpost.com/project-gallery
[globot]: https://devpost.com/software/globot-341w9q
[gemini 3 gallery]: https://gemini3.devpost.com/project-gallery
[gurumitra]: https://lnmiit.ac.in/congratulations-to-team-gurumitra-clinched-1st-place-at-the-google-cloud-agentic-ai-day-hackathon-2025/
[gurumitra playbook]: https://medium.com/@himanshusharma14024/what-it-takes-to-win-a-google-agentic-ai-hackathon-that-set-a-world-record-9771f1799922
[agent academy]: https://devblogs.microsoft.com/powerplatform/agent-academy-hackathon-winners/
[ms agents winners]: https://microsoft.github.io/AI_Agents_Hackathon/winners/
[aws winners]: https://aws-agent-hackathon.devpost.com/updates/38140-congratulations-to-the-winners-of-the-aws-ai-agent-global-hackathon
[google use cases]: https://cloud.google.com/transform/101-real-world-generative-ai-use-cases-from-industry-leaders
[leeds oreo]: https://cheddarhub.org/university-of-leeds-oreo-team-wins-1st-place-at-aws-breaking-barriers-for-agentic-networks-hackathon/
[sentinel flood-watch]: https://devpost.com/software/sentinel-flood-watch-agent
[fivetran winners]: https://www.fivetran.com/blog/meet-the-ai-agents-that-won-the-google-cloud-rapid-agent-hackathon

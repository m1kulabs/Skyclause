# Judging and pitching

The APU Cloud Innovation Hackathon 2026 has not released its judging criteria, so this file looks at how comparable events score submissions, what the sponsor and organisers care about, and how to package a repo, deck, and demo for asynchronous review and a live final. Researched on 3 November 2026; anything about what this hackathon's judges will value is labelled as inference.

Contents:

1.  [Comparable rubrics](#comparable-rubrics)
    1.  [Rubric comparison](#rubric-comparison)
    1.  [Common core](#common-core)
    1.  [How scores are combined](#how-scores-are-combined)
1.  [Sponsor and organiser focus](#sponsor-and-organiser-focus)
    1.  [NTT DATA](#ntt-data)
    1.  [Google Cloud](#google-cloud)
    1.  [APU School of Technology](#apu-school-of-technology)
    1.  [NexConnect '26](#nexconnect-26)
1.  [Packaging for asynchronous assessment](#packaging-for-asynchronous-assessment)
    1.  [README for judges](#readme-for-judges)
    1.  [Demo video](#demo-video)
    1.  [Deck that reads without a presenter](#deck-that-reads-without-a-presenter)
    1.  [Keeping the PDF under 10 MB](#keeping-the-pdf-under-10-mb)
1.  [Live final pitch](#live-final-pitch)
    1.  [Structure and timing](#structure-and-timing)
    1.  [Live demo risk and backups](#live-demo-risk-and-backups)
    1.  [Q&A preparation](#qa-preparation)
1.  [Responsible AI, privacy, and impact framing](#responsible-ai-privacy-and-impact-framing)
    1.  [Google's AI Principles and Gemini API terms](#googles-ai-principles-and-gemini-api-terms)
    1.  [Malaysia's PDPA and the 2024 amendment](#malaysias-pdpa-and-the-2024-amendment)
    1.  [SDGs in Solution Challenge judging](#sdgs-in-solution-challenge-judging)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [See also](#see-also)

## Comparable rubrics

The hackathon's website says criteria "will be released soon" and that every prototype is reviewed and scored 11–14 November ([brief](/docs/BRIEF.md)). The rubrics below come from events in the same lineage (Google student programmes, GDG on Campus Malaysia, APU) and from the two big hackathon platforms.

### Rubric comparison

| Event                                                                    | Criteria and weights                                                                                                                                                                                                                                                                                                                                                      | Source                          |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| KitaHack 2023 (GDSC Malaysia), run alongside the 2023 Solution Challenge | Ideathon round: Impact 50, Technology 10 points. Prototype round: Impact 10, Technology 50. Impact: clear problem, chosen SDG and why, three real-user feedback points and the iteration they caused, success metrics, next steps. Technology: architecture and why each Google product, all components built, demo of a working app "not a mockup", scales to more users | [KitaHack 2023]                 |
| Solution Challenge 2026 India (GDG on Campus with Hack2skill), prototype | Technical merit 40% (technical complexity, AI integration, performance and scalability, security and privacy), user experience 10%, alignment with cause 25%, innovation and creativity 25%. Finale: innovation, impact, technical depth, scalability, presentation quality (no weights)                                                                                  | [Solution Challenge 2026 India] |
| KitaHack 2026 (GDG on Campus Malaysia)                                   | Preliminary screening for documentation and format; technical evaluation of depth, code quality, architecture, and use of AI and Google technologies; final round: innovation and impact 20%, presentation 40%, technical 40%                                                                                                                                             | [KitaHack 2026]                 |
| KitaHack 2025                                                            | Not found: the kickoff on 22 February 2025 covered "rules and judging criteria", but the event pages don't list them                                                                                                                                                                                                                                                      | [KitaHack 2025 kickoff]         |
| Devpost, common criteria                                                 | Technological implementation, ease of use, demonstration (video), potential impact, quality of the idea, design; each organiser sets its own criteria and weights                                                                                                                                                                                                         | [Devpost criteria]              |
| Google Cloud AI Accelerate hackathon on Devpost (Nov–Dec 2025)           | Stage one pass/fail on baseline viability (all requirements met, addresses a challenge, uses the required tools). Stage two, equally weighted: technological implementation, design, potential impact, quality of the idea                                                                                                                                                | [AI Accelerate rules]           |
| MLH standard rules                                                       | Technology, design, completion, learning, weighted equally. Explicitly not judged: code quality, pitch quality, idea quality                                                                                                                                                                                                                                              | [MLH rules]                     |
| Gemini API Developer Competition 2024                                    | 13 questions scored 1–5, maximum 65: impact 15 (accessible to everyone, environmental sustainability, improves lives), remarkability 10, creativity 15, usefulness 15 (defined user persona, needs, how well it meets them), execution 10 (software and LLM best practice). Video and code judged; ties rejudged on video impact                                          | [Gemini competition rules]      |
| APU Sustainability Hackathon 2025 and 2026                               | Creativity and originality, technology implementation, significance and practicality, product validation, feasibility, presentation and execution (no weights published)                                                                                                                                                                                                  | [APU 2025], [APU 2026]          |
| GDGoC APU, earlier events                                                | Not found: no published rubric from a previous GDGoC APU event turned up in web or Exa searches                                                                                                                                                                                                                                                                           | —                               |

Notes on the sources:

- Google's own Solution Challenge judging page (`developers.google.com/community/gdsc-solution-challenge/judging`) now redirects to the Google for Developers community home, and the Internet Archive was offline when checked, so the nearest primary source is the KitaHack 2023 page, which pointed teams at "KitaHack and the 2023 Solution Challenge" and asks the Solution Challenge's questions.
- The official Gemini competition rules URL now redirects to Google AI Studio; the rules text is cited from a forum post that reproduces them in full (secondary).

[KitaHack 2023]: https://google-developer-student-club-malaysia.github.io/kitahack2023/
[Solution Challenge 2026 India]: https://hack2skill.com/event/solution-challenge-2026
[KitaHack 2026]: https://kitahack2026.my/
[KitaHack 2025 kickoff]: https://gdg.community.dev/events/details/google-gdg-on-campus-universiti-malaya-kuala-lumpur-malaysia-presents-kitahack-2025-kickoff-session-1/
[Devpost criteria]: https://info.devpost.com/blog/understanding-hackathon-submission-and-judging-criteria
[AI Accelerate rules]: https://ai-partner-catalyst.devpost.com/rules
[MLH rules]: https://github.com/MLH/mlh-policies/blob/main/standard-hackathon-rules.md
[Gemini competition rules]: https://discuss.ai.google.dev/t/do-we-need-to-submit-the-full-code-how-will-judges-verify-partial-code/33566
[APU 2025]: https://www.apu.edu.my/news/shaping-sustainable-future
[APU 2026]: https://www.apu.edu.my/news/apu-sustainability-hackathon-2026-empowers-students-innovate-greener-future

### Common core

Every rubric above scores technical implementation, all but MLH's score problem and impact, and most score all five:

1.  **Problem and impact:** a specific problem, who has it, and evidence the solution helps. Google-lineage rubrics ask for success metrics and real-user feedback ([KitaHack 2023]); APU's own hackathons score "product validation" ([APU 2026]).
1.  **Technical implementation:** depth, architecture, and use of the named tools, with Google rubrics asking which Google product was chosen and why ([KitaHack 2023], [Solution Challenge 2026 India]).
1.  **A working product:** "an actual working application (not a mockup)" ([KitaHack 2023]); MLH's "Does the hack work?" ([MLH rules]).
1.  **Design and user experience** ([Devpost criteria], [MLH rules], [Solution Challenge 2026 India]).
1.  **Originality** ([Devpost criteria], [Gemini competition rules], [APU 2025]).

Feasibility and scalability recur in Google and APU rubrics. Presentation is usually unscored in the written round but heavy in finals: 40% in the KitaHack 2026 final ([KitaHack 2026]). Two rubrics also test whether AI is justified: "could a simpler approach have worked?" ([Solution Challenge 2026 India]) and whether the LLM component follows ML/LLM best practice ([Gemini competition rules]).

### How scores are combined

- On Devpost, each judge rates every criterion 1–5 stars, and there is "no other mechanism for judges to provide feedback" ([Devpost judging]).
- KitaHack 2023 averaged several judges' scores after dropping the highest and lowest ([KitaHack 2023]).
- Comparable events gate on completeness first: the Google Cloud Devpost hackathon's pass/fail stage one ([AI Accelerate rules]) and KitaHack 2026's preliminary screening for "proper documentation and submission format" ([KitaHack 2026]).

[Devpost judging]: https://help.devpost.com/article/103-how-to-judge-an-online-hackathon

## Sponsor and organiser focus

This hackathon is organised by APU School of Technology with GDGoC APU, sponsored by NTT DATA, and lists Google Cloud and NexConnect 2026 as partners ([brief](/docs/BRIEF.md)). No judges had been named by 3 November.

### NTT DATA

- **Gemini Enterprise with Google Cloud (8 June 2026):** NTT DATA expanded its Google Cloud collaboration "to help enterprises move from AI experimentation to scaled deployment of agentic AI solutions built with Gemini Enterprise", set up a Gemini Enterprise practice targeting 5,000 certified experts, and plans to co-innovate up to 500 AI agents. The release stresses "governance, security, compliance and responsible use of AI" ([NTT DATA Gemini release]).
- **Private 5G and edge AI (26 February 2026):** a multi-year Ericsson partnership on private 5G, edge AI, and physical AI, with NTT DATA Edge AI agents running on Ericsson edge platforms, for sectors including energy, transportation, and smart cities ([NTT DATA Ericsson release]).
- **Malaysia (20 October 2026):** an NTT DATA Malaysia blog on the national grid says the company applies "AI, IoT and advanced analytics" to predictive maintenance, uses edge computing to "identify anomalies and trigger workflows without sending raw data elsewhere", and concludes: "The point isn't to put AI, private 5G or IoT everywhere but to identify operational problems where faster, richer information changes the outcome, then build the architecture around those problems" ([NTT DATA Malaysia energy blog]).
- **Malaysia site (3 November 2026):** the home page leads with the "Intelligence to Impact" positioning and generative and agentic AI reports ([NTT DATA Malaysia]).
- **At this hackathon:** the briefing includes Gemini Enterprise training with NTT DATA ([brief](/docs/BRIEF.md)).

Inference: NTT DATA judges are likely to reward a concrete operational problem with a measurable outcome, AI that runs as an agent or workflow rather than a chat box, and visible attention to governance and security.

[NTT DATA Gemini release]: https://www.nttdata.com/en-us/news/2026/ntt-data-expands-collaboration-with-google-cloud
[NTT DATA Ericsson release]: https://www.nttdata.com/en-us/news/2026/ntt-data-and-ericsson-team-up-to-scale-private-5g-and-physical-ai
[NTT DATA Malaysia energy blog]: https://www.nttdata.com/en-my/insights/blog/more-power-more-renewables-more-complexity-malaysias-next-energy-challenge
[NTT DATA Malaysia]: https://www.nttdata.com/en-my

### Google Cloud

- Google Cloud's student page centres on skills and credentials: 200 free Google Skills credits that expire after a year, skill badges, Cloud Certificates, and student communities ([Google Cloud for students]).
- The GDG on Campus Solution Challenge 2026 India asks students to "design, prototype, and launch ideas that create measurable impact for communities", and its technical criterion includes security and privacy ("Is user data handled securely, with consideration for privacy and ethical issues?") ([Solution Challenge 2026 India]).

Inference: a Google Cloud judge will look for a clear reason each Google product is there, and for AI that earns its place.

[Google Cloud for students]: https://cloud.google.com/edu/students

### APU School of Technology

- At the launch of APU's Google for Education Centre of Excellence on 13 February 2026, a senior lecturer for Cloud, Networking & IoT in the School of Technology said APU has "Google as our primary cloud partner" and that its Edge Computing module runs "from Google Coral Edge TPU devices to Vertex AI modelling and analytics dashboards" ([APU GCoE]).
- At the same launch, Cloud Engineering students showed "an AI-powered IoT and Edge computing system" that processes real-time sensor and camera data to optimise energy use, an architecture the article says ensures "scalability, operational efficiency and privacy-conscious automation"; the GDGoC APU president demoed a cloud-hosted app ([APU GCoE]).

Inference: School of Technology judges will know sensor-to-edge-to-Vertex pipelines well, so they will probably notice a weak or faked IoT layer quickly, and value privacy-conscious edge processing.

[APU GCoE]: https://www.apu.edu.my/news/apu-ignites-malaysias-ai-future-launch-google-education-centre-excellence-and-strategic

### NexConnect '26

The final pitching for the top five is at the APU Auditorium during NexConnect '26, and the site lists "NexConnect 2026" as a partner ([brief](/docs/BRIEF.md)). Not found: what NexConnect '26 is. Web and Exa searches for "NexConnect 2026 APU" and "NexConnect '26 Asia Pacific University School of Technology" turned up only unrelated organisations with similar names.

## Packaging for asynchronous assessment

Reviewers get a project title, track, summary, HTTPS repo link, a PDF deck of up to 10 MB, and an optional demo link; final submission locks the project and the PDF ([brief](/docs/BRIEF.md)).

### README for judges

- GitHub says a README should cover what the project does, why it is useful, how to get started, where to get help, and who maintains it, and that README content beyond 500 KiB is truncated ([GitHub READMEs]).
- Google Cloud's Devpost rules require a repo containing "all necessary source code, assets, and instructions required for the project to be functional", a hosted URL "for judging and testing", and a description of features, technologies, "any other data sources used", and learnings ([AI Accelerate rules]).
- MLH recommends that teams credit AI tools in "a detailed readme" to make clear "what they made vs what they are using", and that projects not be a reskin of an existing AI tool; its sample rules say to list frameworks and remove API keys before sharing ([MLH organiser rules]). MLH's standard rules require teams to be "honest and transparent about the AI code tools they used" ([MLH rules]).
- The Solution Challenge 2023 questions map well to README sections: architecture and component responsibilities, which products and why, one hard technical challenge and how it was solved, and real-user feedback ([KitaHack 2023]).

Inference, a README order that answers those questions: one-line problem and track; demo link and screenshots; architecture diagram (device, network, cloud, AI); a table of what is real versus stubbed or simulated; run instructions; data sources; AI and tool use; team.

[GitHub READMEs]: https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-readmes
[MLH organiser rules]: https://guide.mlh.com/general-information/judging-and-submissions/rules-for-your-hackathon

### Demo video

Length limits in comparable events:

- MLH digital events: 2 minutes or less ([MLH rules]).
- Devpost: "most are under three minutes long" ([Devpost video tips]).
- Gemini API Developer Competition: 30 seconds to 3 minutes; only the first 3 minutes judged ([Gemini competition rules]).
- Google Cloud Devpost hackathon: at most 3 minutes, only the first 3 evaluated, must show the project working ([AI Accelerate rules]).
- Solution Challenge 2026 India final: up to 3 minutes ([Solution Challenge 2026 India]).

Structure and production advice from Devpost:

- Say what the app does, and how it fits the hackathon, in the first few seconds; prefer a narrated screencast to a marketing video; edit out mistakes; write and rehearse a script ([Devpost video help]).
- The demo video is "one of the first things that judges will look at"; judges review projects back to back, so open with an overview; split the time into intro, idea, components, demo, close; show the product running on real input ([Devpost video tips]).

Hosting:

- Devpost expects videos on YouTube or Vimeo ([Devpost submission]). It warns to check privacy settings and to upload early because processing can take hours; a participant tip it published adds marking YouTube videos "Not for Kids" so judges can view them ([Devpost video tips], [Devpost video help]).
- YouTube unlisted videos "can be seen and shared by anyone with the link" and don't appear in search ([YouTube privacy]).

[Devpost video tips]: https://info.devpost.com/blog/6-tips-for-making-a-hackathon-demo-video
[Devpost video help]: https://help.devpost.com/article/84-video-making-best-practices
[Devpost submission]: https://help.devpost.com/article/126-creating-a-submission
[YouTube privacy]: https://support.google.com/youtube/answer/157177?hl=en

### Deck that reads without a presenter

- Guy Kawasaki's 10/20/30 rule: ten slides, twenty minutes, no font smaller than thirty points ([Kawasaki 10/20/30]).
- Y Combinator's demo day guide orders a pitch as introduction, problem, product and customer, opportunity, traction, team, conclusion, and advises one main point per slide, large fonts, and important text at the top ([YC demo day guide]). Kevin Hale's YC deck guide asks for slides that are legible, simple, and obvious: "Show it to a stranger and ask them to tell you what it means" ([YC deck design]).
- The Solution Challenge 2026 India asks for a deck "detailing your solution and impact", and a final deck covering "goals, features, technical implementation, and real-world impact" ([Solution Challenge 2026 India]).

Inference: that advice is written for decks shown on stage. A deck read alone on a laptop can carry a full sentence per slide as the headline, but should keep one idea per slide, name the scoring criterion it answers, and link the repo and the live app on the first and last slides.

[Kawasaki 10/20/30]: https://guykawasaki.com/the_102030_rule/
[YC demo day guide]: https://www.ycombinator.com/blog/guide-to-demo-day-pitches
[YC deck design]: https://www.ycombinator.com/library/4T-how-to-design-a-better-pitch-deck

### Keeping the PDF under 10 MB

- In PowerPoint, **Compress Pictures** reduces image size and dimensions; Microsoft 365's default picture resolution is 220 ppi ([Microsoft compress pictures]).
- Ghostscript's `-dPDFSETTINGS` presets resample an existing PDF: `/screen` is low resolution, `/ebook` medium; the docs warn that presets alter the output and can lower quality ([Ghostscript PDF settings]).

  ```bash
  gs -sDEVICE=pdfwrite -dPDFSETTINGS=/ebook -dNOPAUSE -dBATCH -sOutputFile=deck-small.pdf deck.pdf
  ```

Inference: link the live app instead of embedding media, and check the compressed PDF's screenshots are still readable before the final submission locks it.

[Microsoft compress pictures]: https://support.microsoft.com/en-us/office/reduce-the-file-size-of-your-images-in-microsoft-office-8db7211c-d958-457c-babd-194109eb9535
[Ghostscript PDF settings]: https://ghostscript.readthedocs.io/en/latest/VectorDevices.html

## Live final pitch

The format, timing, and judges for the 17 November final are unannounced ([brief](/docs/BRIEF.md)).

### Structure and timing

- Devpost: set the scene in a few sentences, demo the working project and show it resolving the problem, then "sell the dream" in a sentence or two ([Devpost live demo]).
- Paul Graham (YC): explain what you're doing without preamble, spend no more than a tenth of the time on the problem, and when demoing show how the product solves the problem rather than "a catalog of features"; his Demo Day slot was ten minutes. He has since marked the demo advice obsolete for YC, where slots became too short for demos ([Paul Graham]).
- YC demo day guide: build around 3–4 memorable points by asking "What are we building and for whom? Why hasn't this been done before? Why is it hard to do what we are doing? Why is this an opportunity not to be missed?"; have one person present, without switching; speak slowly; practise ([YC demo day guide]).
- KitaHack 2026's final weights presentation at 40%, including "engagement with the judging panel" ([KitaHack 2026]).

### Live demo risk and backups

- Paul Graham: "assume that the network connection will mysteriously die 30 seconds into your presentation, and come prepared with a copy of the server software running on your laptop" ([Paul Graham]).
- YC: "demos seldom work in modern demo day presentations" ([YC demo day guide]).
- Devpost: skip mundane flows such as creating accounts, and copy any needed text to the clipboard ([Devpost live demo]).

Inference: for a Cloud + IoT + network project, the backup is a second live path, such as a phone hotspot and a second device, with the device brought on stage only if the venue network has been tested. Recorded demo videos are ruled out ([context](/docs/CONTEXT.md#decisions-so-far)).

[Devpost live demo]: https://info.devpost.com/blog/how-to-present-a-successful-hackathon-demo
[Paul Graham]: https://paulgraham.com/investors.html

### Q&A preparation

- YC lists "Exaggerating the truth" among the most common pitch errors and calls exaggerations "fatal errors" ([YC demo day guide]).
- MLH expects teams to answer judges' questions honestly about the AI tools they used ([MLH rules]).
- Questions the rubrics above suggest judges will ask: how it scales, what is real versus simulated, why each Google product, how user data is protected, what real users said, and what comes next ([KitaHack 2023], [Solution Challenge 2026 India]).

## Responsible AI, privacy, and impact framing

### Google's AI Principles and Gemini API terms

- Google's AI Principles have three parts: bold innovation, responsible development and deployment, and collaborative progress. The second includes "appropriate human oversight", "rigorous design, testing, monitoring, and safeguards to mitigate unintended or harmful outcomes and avoid unfair bias", and "Promoting privacy and security" ([Google AI Principles]).
- Google's Gemini API safety guidance has four steps: understand the app's safety risks, adjust to mitigate them, test for safety, and gather user feedback and monitor use. Mitigations it lists include restricted input methods such as drop-down prompts, blocking unsafe inputs and filtering outputs, per-user rate limits, guarding against prompt injection, and choosing narrower, lower-risk tasks with human review ([Gemini safety guidance]).
- The Gemini API terms (effective 23 March 2026) say users must be 18 or older and must not use the API in an app "directed towards or is likely to be accessed by individuals under the age of 18". On unpaid services such as Google AI Studio and the free quota, Google uses submitted content to improve its products, human reviewers may read it, and the terms say: "Do not submit sensitive, confidential, or personal information to the Unpaid Services." Paid-tier prompts are not used to improve products ([Gemini API terms]).

[Google AI Principles]: https://ai.google/principles/
[Gemini safety guidance]: https://ai.google.dev/gemini-api/docs/safety-guidance
[Gemini API terms]: https://ai.google.dev/gemini-api/terms

### Malaysia's PDPA and the 2024 amendment

- **Scope:** the Personal Data Protection Act 2010 (Act 709) applies to processing personal data "in respect of commercial transactions" ([Act 709]).
- **The seven principles:** General (consent), Notice and Choice, Disclosure, Security, Retention (keep data no longer than necessary, then delete it), Data Integrity, and Access ([Act 709]).
- **The 2024 amendment (Act A1727):** received Royal Assent on 9 October 2024 and was published in the Gazette on 17 October 2024 ([Act A1727]). It:
  1.  Renames "data user" to "data controller".
  1.  Adds biometric data, defined as "any personal data resulting from technical processing" of physical, physiological, or behavioural traits, to sensitive personal data.
  1.  Makes data processors comply with the Security Principle.
  1.  Raises the penalty for breaching the principles from RM300,000 or two years to RM1 million or three years.
  1.  Requires data protection officers.
  1.  Requires breach notification: to the Commissioner "as soon as practicable", and to data subjects "without unnecessary delay" where there is significant harm.
  1.  Adds a right to data portability.
  1.  Removes the ministerial whitelist for cross-border transfers.
- **Commencement and guidelines (secondary):** DLA Piper reports that the breach notification and DPO requirements took effect on 1 June 2025. The Commissioner's guidelines set 72 hours to notify the Commissioner and seven days after that to notify data subjects, and require a DPO above thresholds such as personal data of more than 20,000 data subjects ([DLA Piper]).

Inference: a one-week prototype is unlikely to be a commercial transaction itself, but a campus product run by APU would process student data, so judges may ask how it would comply. Collecting as little personal data as possible, avoiding face or other biometric data, and showing a consent notice and retention rule are cheap answers.

[Act 709]: https://www.pdp.gov.my/wp-content/uploads/2026/10/Akta-709-cetakan-semula-2026-BI.pdf
[Act A1727]: https://www.pdp.gov.my/wp-content/uploads/2024/11/Act-A1727.pdf
[DLA Piper]: https://privacymatters.dlapiper.com/2025/03/malaysia-guidelines-issued-on-data-breach-notification-and-data-protection-officer-appointment/

### SDGs in Solution Challenge judging

- The 2023 Solution Challenge asked teams which UN goals "AND target(s)" they chose and what inspired them, and scored whether teams "explain clearly which (Selected SDG) they chose for their solution and why" ([KitaHack 2023]).
- KitaHack 2026's "Innovation & Impact" criterion (20%) scores "potential impact on addressing SDG-related challenges" ([KitaHack 2026]); the Solution Challenge 2026 India gives "Alignment With Cause" 25% ([Solution Challenge 2026 India]).
- APU's 2026 Sustainability Hackathon listed each winner's SDG focus, such as SDG 13 for a smart energy tracker ([APU 2026]).
- UN targets close to this hackathon's tracks: 4.3, "ensure equal access for all women and men to affordable and quality technical, vocational and tertiary education, including university" ([SDG 4]); 7.3, "double the global rate of improvement in energy efficiency" ([SDG 7]); 11.6, reduce cities' environmental impact, "paying special attention to air quality and municipal and other waste management" ([SDG 11]).

This hackathon's brief does not mention the SDGs ([brief](/docs/BRIEF.md)).

[SDG 4]: https://sdgs.un.org/goals/goal4
[SDG 7]: https://sdgs.un.org/goals/goal7
[SDG 11]: https://sdgs.un.org/goals/goal11

## Takeaways for this hackathon

- **Evidence:** every comparable rubric scores technical implementation, all but MLH's score problem/impact, and most also score a working product, design, and originality. **Inference:** give the deck and README headings named after those five so a judge scoring 1–5 per criterion can find the evidence fast.
- **Evidence:** comparable events gate on completeness first, and Google Cloud's Devpost rules want a repo with everything needed to run it. **Inference:** a missing run instruction or a private repo could cost more than any feature, so check access from a logged-out browser before 10 November.
- **Evidence:** Google-lineage rubrics reward a working app over a mockup, and School of Technology staff teach the Coral-to-Vertex AI edge pipeline. **Inference:** a short "real vs stubbed" table in the README and deck protects credibility on the IoT and network layers.
- **Evidence:** NTT DATA's 2026 messaging is Gemini Enterprise agents, private 5G and edge AI for sectors including smart cities, and "operational problems where faster, richer information changes the outcome". **Inference:** frame the project as one campus operational problem with a before/after metric, and show the AI acting, not only chatting.
- **Evidence:** the demo link is optional, but comparable events treat a ≤3-minute video as one of the first things judges see. **Inference:** a demo link is worth submitting. The user ruled out recorded demo videos on 3 November 2026, so the link should be the live hosted app ([context](/docs/CONTEXT.md#decisions-so-far)).
- **Evidence:** finals elsewhere weight presentation heavily (40% at KitaHack 2026), and YC advises one presenter and lots of practice. **Inference:** pick the strongest speaker and rehearse 3-, 5-, and 10-minute versions, since the format is unannounced.
- **Evidence:** the Gemini API free tier lets Google use and human-review inputs and says not to submit personal information, and PDPA 2024 treats biometric data as sensitive. **Inference:** keep classmates' personal data out of free-tier calls, avoid face recognition, and say so on a privacy slide.
- **Evidence:** MLH and YC treat dishonesty about tools or results as disqualifying or fatal. **Inference:** list AI coding tools and any simulated parts in the README.
- **Evidence:** Google student rubrics score SDG alignment; this hackathon's brief doesn't mention it. **Inference:** one line naming a target such as 7.3 or 4.3 is cheap insurance, not a centrepiece.

## See also

- [Hackathon brief](/docs/BRIEF.md): dates, submission fields, and open questions.
- [Past winners](/docs/research/past-winners.md): what won comparable events.
- [Google tools](/docs/research/google-tools.md): Gemini, Gemini Enterprise, and Google Cloud options.
- [IoT and network](/docs/research/iot-and-network.md): getting a real device and network signal in a week.
- [Public data sources](/docs/research/public-data-sources.md): real datasets for each track.

# APU public documents

Which real, public APU documents could ground a Gemini Enterprise agent under the repo's real-data rule, and what public evidence shows which systems APU runs, so a team can pick connectors that mirror APU's real operations. Every URL below got a real request on 3 November 2026 (21:52–22:15 MYT); downloads are kept outside the repo. Researched on 3 November 2026.

Contents:

1.  [How these were checked](#how-these-were-checked)
1.  [APU Knowledge Base on Confluence](#apu-knowledge-base-on-confluence)
1.  [Smart Campus & Student Experience](#smart-campus--student-experience)
1.  [Intelligent Automation & Digital Transformation](#intelligent-automation--digital-transformation)
1.  [Data-Driven Research & Intelligent Decision Making](#data-driven-research--intelligent-decision-making)
1.  [Material that is not public](#material-that-is-not-public)
1.  [Terms of use and robots.txt](#terms-of-use-and-robotstxt)
1.  [Systems APU runs](#systems-apu-runs)
1.  [How each source reaches an agent](#how-each-source-reaches-an-agent)
1.  [Takeaways for this hackathon](#takeaways-for-this-hackathon)
1.  [See also](#see-also)

## How these were checked

- **Login:** every document in the track tables opened with a plain `curl` request and no cookies or credentials. Exceptions are listed under [Material that is not public](#material-that-is-not-public).
- **HTML pages:** `www.apu.edu.my` runs Drupal 10. Each page weighs 300–670 KB, mostly shared navigation, and shows no last-updated date. The `Last-Modified` header is the cache time (today), so it is not a content date.
- **PDFs:** hosted on `publicwebsite-media.apu.edu.my` (Amazon S3). "Uploaded" is the file's `Last-Modified` header; any date printed in the document is given separately. All PDFs below have a text layer (`pdftotext` worked); the scholarship grid extracts only partly.
- **Sitemap quirk:** `new.apu.edu.my/sitemap.xml` now lists 339 URLs under the host `training.apiit.edu.my`, a CNAME of `apu.edu.my`. The same paths work on `www.apu.edu.my`, which is what the tables cite.
- The existing [public data sources](/docs/research/public-data-sources.md#apus-own-public-information) catalogue covers APU's lack of an API, its ROR, OpenAlex and Wikidata IDs, and the APSpace source code; this file doesn't repeat them.

## APU Knowledge Base on Confluence

The biggest public source is not on the main website. [`kb.apu.edu.my`][kb_home] redirects to APU's Confluence Cloud site `apiit.atlassian.net`, where the home page calls it "the one-stop university wide information and document hub on academic and non-academic activities" and says to log in "to view limited access articles". Confluence's REST API answered without credentials and listed 28 spaces; I counted the pages visible to an anonymous visitor in 21 of them, 1,189 in total.

| Space                                  | Public pages | Newest edit | What it covers                                                           |
| -------------------------------------- | -----------: | ----------- | ------------------------------------------------------------------------ |
| [IT Helpdesk (ITSM)][kb_itsm]          |          725 | 3 Nov 2026  | APKey, Microsoft 365, OneDrive, Teams, Wi-Fi, labs, tickets, policies    |
| [Programme Documentation (PD)][kb_pd]  |          135 | 9 Jun 2026  | Index of programme handbooks; the handbooks themselves are restricted    |
| [Academic Administration (AA)][kb_aa]  |          103 | 2 Oct 2026  | Exam dockets, EC claims, referrals, deferment, transcripts, the handbook |
| [Library (LIB)][kb_lib]                |           65 | 11 Feb 2026 | Hours, Koha catalogue, e-databases, borrowing                            |
| [Graduation (GRAD)][kb_grad]           |           48 | 24 Feb 2026 | Registration, invitation letters, certificates                           |
| [Accommodation (AC)][kb_ac]            |           29 | 17 Sep 2026 | Residence fees, booking, check-out, rules                                |
| [Logistics & Operations (LNO)][kb_lno] |           29 | 28 Oct 2026 | APCard parking, prepaid smart meters                                     |
| [Visa and Immigration (VISA)][kb_visa] |           19 | 3 Aug 2026  | Student pass, overstay, passport renewal, EMGS notices                   |
| [Bursary (BUR)][kb_bur]                |            8 | 15 May 2026 | Paying fees online, Flywire, refund policies                             |

- Bodies are readable: for example the library-hours page returned "Monday – Friday: 8:30 a.m. – 7:00 p.m." (edited 10 May 2024), and ITSM's [ICT Regulations][kb_ict] (edited 2 January 2025) is APU's acceptable-use rule set, covering monitoring, hardware care, and misuse.
- ITSM also publishes the [Password and Authentication Policy][kb_pwd] (3 January 2025), [Policy: Microsoft 365 Storage][kb_m365] (6 August 2025), [SharePoint & Microsoft Teams Site Provisioning Policy][kb_spo] (effective 1 January 2025), BYOD and USB policies, and "Policy: AI-Driven Security Policies for APU's Digital Ecosystem" (1 April 2026).
- Pages are short Q&A articles ("How to open a ticket on Virtual Help Centre?", "I would like to defer my semester/intake?"), which suit retrieval well. Many were last edited in 2020–2023, so an agent should show each answer's edit date.

[kb_home]: https://apiit.atlassian.net/wiki/spaces/KB/overview
[kb_itsm]: https://apiit.atlassian.net/wiki/spaces/ITSM/overview
[kb_pd]: https://apiit.atlassian.net/wiki/spaces/PD/overview
[kb_aa]: https://apiit.atlassian.net/wiki/spaces/AA/overview
[kb_lib]: https://apiit.atlassian.net/wiki/spaces/LIB/overview
[kb_grad]: https://apiit.atlassian.net/wiki/spaces/GRAD/overview
[kb_ac]: https://apiit.atlassian.net/wiki/spaces/AC/overview
[kb_lno]: https://apiit.atlassian.net/wiki/spaces/LNO/overview
[kb_visa]: https://apiit.atlassian.net/wiki/spaces/VISA/overview
[kb_bur]: https://apiit.atlassian.net/wiki/spaces/BUR/overview
[kb_ict]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2215379058
[kb_pwd]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2476572694
[kb_m365]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2812936216
[kb_spo]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/3096641634

## Smart Campus & Student Experience

| Document                                          | Format, size       | Dated                                  | What an agent could answer or do                                                            |
| ------------------------------------------------- | ------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------- |
| [Campus Connect shuttle schedule][shuttle]        | PDF, 5 pp, 1.1 MB  | Effective 22 Oct 2026; uploaded 23 Oct | Next weekday departure, LRT Bukit Jalil ↔ APU and each residence route                      |
| [Shuttle services page][shuttle_page]             | HTML               | Not shown                              | Who may board; monthly passes RM70–RM140 by route; Student ID rule                          |
| [Intake calendar][intake]                         | HTML               | Not shown                              | Intake dates by level and programme, through 27 Aug 2027                                    |
| [Level 1 Orientation Guide, Nov 2026][orient]     | PDF, 17 pp, 2.4 MB | Uploaded 27 Oct 2026                   | First-week setup: APKey, APSpace, Office 365, Teams, Moodle, fees due 16 Nov 2026, contacts |
| [APU Student Handbook][handbook]                  | PDF, 36 pp, 448 KB | Version 8.0, 1 Jul 2023                | Attendance, library rules, ICT rules, fees, deferment, withdrawal                           |
| [Guide for new APU students][newguide]            | HTML               | Not shown                              | Campus and residence addresses, getting around Kuala Lumpur                                 |
| [Campus facilities][facilities]                   | HTML               | Not shown                              | Facility list (labs, library, Google Center of Excellence, sports), mostly a gallery        |
| [Library website][library]                        | HTML (WordPress)   | Not shown                              | Opening hours Mon–Fri 8.30 a.m.–7.00 p.m., Sat 9.00 a.m.–1.00 p.m.; e-resources             |
| [Library catalogue (Koha OPAC)][opac]             | HTML               | Live                                   | Search holdings; link a student to a book's record                                          |
| [Health support services][health]                 | HTML               | Not shown                              | On-campus Oceana Clinic services, EMGS medical screening                                    |
| [Insurance for international students][insurance] | HTML               | Not shown                              | Cover details; links the [MiCare panel GP list][micare] (PDF, 81 pp, uploaded 31 Jul 2026)  |
| [APU e-Counselling][ecounsel]                     | HTML               | Not shown                              | Counsellor hours 10 a.m.–7 p.m. and WhatsApp channels                                       |

- The handbook is attached to the KB's [Student Handbook][kb_handbook] page with an APIIT version and two engineering supplements; the PDF's title metadata reads "PROPOSED" and its footer "Version 8.0 - 20230701", so it may lag current rules.
- The orientation guide prints the default first-login password pattern for new students. **Inference:** leave that page out of any agent's data store.
- The e-Counselling page lists counsellors by name and phone. **Inference:** under PDPA, point the agent at the page rather than storing the numbers.

[shuttle]: https://publicwebsite-media.apu.edu.my/assets/2026-10/2026Oct22_APU-SHUTTLE-SERVICES.pdf
[shuttle_page]: https://www.apu.edu.my/shuttle-services-campus-connect
[intake]: https://www.apu.edu.my/intake-calendar
[orient]: https://publicwebsite-media.apu.edu.my/assets/2026-10/2026Nov_Level%201%20Orientation%20Guide.pdf
[handbook]: https://apiit.atlassian.net/wiki/download/attachments/1199570953/APU%20Student%20Handbook-Jul%202023.pdf
[kb_handbook]: https://apiit.atlassian.net/wiki/spaces/AA/pages/1199570953
[newguide]: https://www.apu.edu.my/guide-new-apu-students
[facilities]: https://www.apu.edu.my/campus-facilities
[library]: https://library.apu.edu.my/
[opac]: https://opac.apu.edu.my/
[health]: https://www.apu.edu.my/health-support-services
[insurance]: https://www.apu.edu.my/insurance-information-apu-international-students
[micare]: https://publicwebsite-media.apu.edu.my/assets/2026-07/MiCare%20panel%20GP%20list%20(Aso)%20for%20Jun%2026%20(1).pdf
[ecounsel]: https://www.apu.edu.my/apu-e-counselling

## Intelligent Automation & Digital Transformation

These suit NTT DATA's admissions, scholarship, and IT-support examples.

| Document                                                  | Format, size           | Dated                          | What an agent could answer or do                                                            |
| --------------------------------------------------------- | ---------------------- | ------------------------------ | ------------------------------------------------------------------------------------------- |
| [Undergraduate application form][app_ug]                  | PDF form, 2 pp, 229 KB | Uploaded 23 Jun 2025           | "Part I: Important checklist" of required attachments; check a file against it              |
| [Course pages][course_cs] (138 in the sitemap)            | HTML                   | Not shown                      | Entry requirements, English scores, intakes, yearly fees per course                         |
| [Entry qualifications for international students][entryq] | PDF, 27 pp, 566 KB     | Dec 2025; uploaded 5 Jan 2026  | Map a foreign qualification to SPM or STPM equivalence                                      |
| [International application procedures][intlapp]           | HTML                   | Not shown                      | Five-stage international admission process                                                  |
| [English requirements][english]                           | HTML                   | Not shown                      | Minimum IELTS, TOEFL, PTE, MUET by level                                                    |
| [Scholarships & Merit Awards, Aug 2026][schol]            | PDF, 12 pp, 1.2 MB     | Uploaded 15 Aug 2026           | Discount tiers by SPM, UEC, A-Level, STPM and other results; CGPA 2.50 renewal rule         |
| [Scholarships & financial aid hub][scholhub]              | HTML                   | Not shown                      | Links to Malaysian, international, postgraduate, SPM, UEC, A-Level, IGCSE, external schemes |
| [PTPTN guide, Aug 2026][ptptn]                            | PDF, 8 pp, 4.6 MB      | Uploaded 5 Aug 2026            | Loan eligibility (GPA 2.00), income bands, disbursement into fees                           |
| [Fees & refund policy][refund]                            | HTML                   | Not shown                      | Refund windows (more than 14 days, 50% charge), RM200 transfer fee, payment channels        |
| [Privacy notice (PDPA)][privacy]                          | HTML                   | Not shown                      | What personal data APU collects, why, and who it is disclosed to                            |
| [ICT Regulations][kb_ict] and ITSM policies               | HTML (Confluence)      | 2025–2026                      | Acceptable-use, password, storage, and site-provisioning answers for IT support             |
| [Digital learning quick reference][dlguide]               | PDF, 3 pp, 253 KB      | 17 Mar 2020; uploaded Apr 2025 | Moodle, Teams, APSpace attendance steps; helpdesk contacts (dated)                          |

- Example course page: [BSc (Hons) Computer Science][course_cs] lists 3 years, intakes 24 Nov 2026, 25 Mar 2027 and 6 Jul 2027, and RM104,600 total for Malaysians (RM33,800, RM34,800, RM36,000 by year).
- A postgraduate application form is linked from [Download eBrochures][ebro] beside the undergraduate one.

[app_ug]: https://publicwebsite-media.apu.edu.my/assets/2025-06/e2025%20May%20APU%20Application%20Form_UG-fill%5B4%5D.pdf
[course_cs]: https://www.apu.edu.my/course/bsc-hons-in-computer-science
[entryq]: https://publicwebsite-media.apu.edu.my/assets/2026-01/The%20List%20of%20Entry%20Qualifications%20for%20International%20Student%20-%20Dec%202025.pdf
[intlapp]: https://www.apu.edu.my/international-students-application-procedures
[english]: https://www.apu.edu.my/english-requirements
[schol]: https://publicwebsite-media.apu.edu.my/assets/2026-08/Scholarships&MeritAwards_Aug2026.pdf
[scholhub]: https://www.apu.edu.my/scholarships-financial-aids
[ptptn]: https://publicwebsite-media.apu.edu.my/assets/2026-08/e2026Aug_PTPTN%20Guide-A4-8pp.pdf
[refund]: https://www.apu.edu.my/fees-refund-policy
[dlguide]: https://publicwebsite-media.apu.edu.my/assets/2025-04/quick_reference_guide_for_students_digital_learning_17032020.pdf
[ebro]: https://www.apu.edu.my/download-eBrochures

## Data-Driven Research & Intelligent Decision Making

APU's own documents are thin for this track; the stronger research sources are external (see [public data sources](/docs/research/public-data-sources.md#data-driven-research--intelligent-decision-making)).

| Document                                 | Format, size       | Dated                | What an agent could answer or do                                    |
| ---------------------------------------- | ------------------ | -------------------- | ------------------------------------------------------------------- |
| [Course pages][course_cs], all 138       | HTML               | Not shown            | One real table of fees, durations and intakes to compare programmes |
| [Intake calendar][intake]                | HTML               | Not shown            | Intake counts per level and month for planning                      |
| [Postgraduate brochure, Oct 2026][pgbro] | PDF, 49 pp, 5.9 MB | Uploaded 22 Oct 2026 | Postgraduate programme catalogue                                    |
| [Computing brochure, Jul 2026][compbro]  | PDF, 39 pp, 5.7 MB | Uploaded 3 Aug 2026  | Computing programme catalogue                                       |
| [Library catalogue (Koha OPAC)][opac]    | HTML               | Live                 | Holdings by subject, to show what the library already stocks        |

**Inference:** a crawl of the 138 course pages into BigQuery is the one APU-specific dataset here, and it is a single snapshot, not a time series.

[pgbro]: https://publicwebsite-media.apu.edu.my/assets/2026-10/e2026oct_pg_brochure.pdf
[compbro]: https://publicwebsite-media.apu.edu.my/assets/2026-08/e2026July_Computing.pdf

## Material that is not public

- **Academic regulations and policies:** the KB's Rules & Regulations and Policies & Procedures spaces each show only a welcome page to anonymous visitors.
- **Programme handbooks:** the PD index is public, but a linked handbook page returned `404` without login.
- **Fee schedule as one document:** none found; fees appear only per course page.
- **Academic calendar (semester and exam dates):** not found; only the intake calendar is public.
- **Theses and final-year projects (APres), APSpace, Moodle, Virtual Help Centre tickets:** need an APKey. I didn't log in. I sent only unauthenticated requests to the root URLs of APSpace, `sso.apu.edu.my`, CAS, and the Jira portal to read HTTP status and server headers.

## Terms of use and robots.txt

- **Terms:** APU's [Terms of Use][terms] cover APU, APIIT and related entities and show no date. They say the website's text, images and other contents "are protected by copyrights, trademarks and other forms of proprietary rights" and that "Modification of any of the Contents or use of the Contents for any other purpose will be a violation of copyright". Graphics, photographs, video, audio, software and images "may not be reproduced, published, distributed, copied, modified or appropriated or exploited in any manner without written permission of APU". Clause 6 says "You must secure permission from APU prior to hyper-linking to, or use of this Website or any of the Contents". Malaysian law governs.
- **robots.txt:** identical on `apu.edu.my`, `www.apu.edu.my` and `new.apu.edu.my` ([robots.txt][robots]): Drupal's default, `User-agent: *` with disallows only for `/admin/`, `/search/`, `/user/*` login paths, `/core/`, `/profiles/` and README files. No `Crawl-delay` and no `Sitemap` line.
- **Confluence KB:** I found no separate terms on the KB pages; APU's Terms of Use name "this Website" only.
- **Privacy:** the [Privacy Notice][privacy] states compliance with the Personal Data Protection Act 2010.
- **Inference:** robots.txt doesn't block a website-crawl data store, but the Terms of Use reserve copyright and ask for permission before "use of this Website or any of the Contents". Because the hackathon is run by APU's School of Technology, the cleanest path is to ask the organisers in `#help-desk` for written permission to index the public pages and PDFs for a private prototype, keep the data store private, and cite the source URL in every answer. This is a reading of the terms, not legal advice.

[terms]: https://www.apu.edu.my/terms-of-use
[robots]: https://www.apu.edu.my/robots.txt
[privacy]: https://www.apu.edu.my/privacy-policy

## Systems APU runs

From public pages, DNS and HTTP headers only.

| System                  | What APU runs                                                            | Public evidence                                                                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Email                   | Microsoft 365 (Exchange Online) for staff and students                   | MX `apu.edu.my` → `apu-edu-my.mail.protection.outlook.com`; `mail.apu.edu.my` → `mail-apu-edu-my.mail.protection.outlook.com`; autodiscover → `autodiscover.outlook.com`; SPF `spf.protection.outlook.com` |
| Files and collaboration | Microsoft Teams, OneDrive, SharePoint                                    | [Orientation guide][orient]; [M365 storage policy][kb_m365]: students 10 GB mail and 10 GB OneDrive, staff 50 GB and 200 GB; [site provisioning policy][kb_spo]                                            |
| Identity                | APKey (`TP` number `@mail.apu.edu.my`), Microsoft sign-in, plus CAS      | Storage policy: users "log in to APSpace via Microsoft Single Sign-On"; KB "What is Central Authentication Service?"; `cas.apiit.edu.my` answers on Tomcat                                                 |
| LMS                     | Moodle at `lms2.apiit.edu.my`                                            | `lms.apu.edu.my` redirects there (`303`); [digital learning guide][dlguide]; [intake calendar][intake]; handbook §5.2                                                                                      |
| Student portal          | APSpace: timetable, QR attendance, results, fee statement, bus tracking  | [Orientation guide][orient]; served from Amazon S3 and CloudFront                                                                                                                                          |
| Helpdesk                | "Virtual Help Centre" on Jira Service Management (`apiit.atlassian.net`) | KB "Create ticket from Outlook" uses the "Jira Cloud add-in on Outlook"; Atlassian TXT verification and SPF include                                                                                        |
| Knowledge base          | Confluence Cloud                                                         | `kb.apu.edu.my` → `apiit.atlassian.net/wiki`                                                                                                                                                               |
| Library                 | Koha catalogue; WordPress site; EBSCO and EZproxy for e-resources        | `opac.apu.edu.my` meta generator "Koha"; `library.apu.edu.my` generator WordPress 6.8 with EBSCO and EZproxy links                                                                                         |
| Website and DNS         | Drupal 10 on Apache; DNS on AWS Route 53; media on Amazon S3             | `x-generator: Drupal 10`; `awsdns` name servers; `server: AmazonS3` on the media host                                                                                                                      |
| Payments                | FPX online payment via APSpace, Flywire, JomPAY                          | [Fees & refund policy][refund]; [orientation guide][orient]                                                                                                                                                |
| ERP or finance          | Not found                                                                | SAP appears only as teaching software: ITSM has SAP GUI 7.50 install guides, and the [careers page][careers] lists ERP-SAP as a lecturing specialisation                                                   |

- **Google:** `apu.edu.my` carries three `google-site-verification` TXT records and a `google-gws-recovery-domain-verification` record, and the campus has a "Google Center of Excellence". No MX points to Google, and a KB article explains syncing the Office 365 calendar to Google Calendar. **Inference:** Google is not APU's email or file platform.
- Other TXT records verify TeamViewer SSO, Apple, Autodesk and the mailers Brevo, Mailjet and Enginemailer.
- A job-posting search turned up no ERP or finance system; the careers page's SAP and AutoCount mentions are requirements for accounting lecturers.

[careers]: https://www.apu.edu.my/careers

## How each source reaches an agent

All of this section is **Inference**; connector features and limits are covered elsewhere.

| Source                                                                  | Route into Gemini Enterprise                                                                                                                        | Supports                                       |
| ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Course, intake, scholarship, refund, shuttle pages                      | Website-crawl data store limited to `www.apu.edu.my` paths such as `/course/*`                                                                      | Admissions, scholarship, study planning        |
| Shuttle, scholarship, PTPTN, application-form, entry-qualification PDFs | Fetch into a team Google Drive folder (Drive connector) or a Cloud Storage data store                                                               | Scholarship eligibility, admissions checks     |
| ITSM, AA, LIB, VISA, GRAD KB pages                                      | A Confluence connector needs admin rights on APU's site, so fetch public pages by REST into Drive or Cloud Storage with the source URL in each file | IT support, student services Q&A               |
| Virtual Help Centre (Jira Service Management)                           | A free Jira Cloud site the team owns, with the Jira connector creating real tickets                                                                 | IT and HR support                              |
| Microsoft 365 (Outlook, SharePoint, OneDrive, Teams)                    | SharePoint or OneDrive connector on a site the team controls, holding the public PDFs                                                               | Every idea; mirrors where APU staff keep files |
| 138 course pages as a table                                             | Load into BigQuery as a structured data store                                                                                                       | Programme and fee comparisons (research track) |

- Pairing a 1P source (Drive or website crawl) with 3P connectors that match APU's real stack (SharePoint or OneDrive and Jira) speaks directly to the judges' connector criterion.
- Under the real-data rule, the fetch job that fills Drive or BigQuery should fail loudly when APU's server errors and store each file's source URL and fetch time.

## Takeaways for this hackathon

- **Evidence:** the public Confluence KB holds 1,189 anonymous-readable pages, 725 of them IT helpdesk articles edited as recently as today. **Inference:** it is the best real knowledge base for an IT-support or student-services agent.
- **Evidence:** the application form's checklist, the MQA-based entry-qualification list, and 138 course pages with entry requirements are all public. **Inference:** an admissions agent that checks an applicant's file against the checklist and the course's entry rules is fully groundable.
- **Evidence:** the August 2026 scholarship grid, the PTPTN guide and the refund policy are public. **Inference:** a scholarship-eligibility agent is also groundable, but the grid needs re-keying because its PDF text extracts only partly.
- **Evidence:** APU runs Microsoft 365, Jira Service Management and Confluence, not Google Workspace. **Inference:** SharePoint, OneDrive and Jira connectors mirror APU's real operations better than Gmail or Google Drive alone.
- **Evidence:** academic regulations, programme handbooks and the academic calendar are login-gated. **Inference:** avoid promising answers that depend on them.

## See also

- [Hackathon brief](/docs/BRIEF.md)
- [Public data sources](/docs/research/public-data-sources.md): live public APIs and datasets by track
- [Google tools](/docs/research/google-tools.md): Cloud and AI products, free tiers, BigQuery sandbox
- [Judging and pitching](/docs/research/judging-and-pitching.md): packaging, privacy, and attribution in the deck
- [Project conventions](/docs/references/project-conventions.md): the real-data rule

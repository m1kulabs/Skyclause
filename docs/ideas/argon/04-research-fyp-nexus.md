# Research & FYP Nexus

Research & FYP Nexus is an event-triggered Gemini Enterprise workflow for the School of Technology's final year project (FYP) committee. When a student's draft title and abstract lands in a monitored folder, it ranks APU lecturers by their recent OpenAlex publications on the topic, flags overlap or outdated scope against OpenAlex, arXiv, and Crossref, checks that the needed software is free to APU students, and drafts a review ticket for the matched supervisor. It ranks fourth at 86.5 / 100 in the Data-Driven Research & Intelligent Decision Making track ([ranking](00-ranking.md)).

Contents:

1.  [Problem in final year projects](#problem-in-final-year-projects)
2.  [How Research & FYP Nexus works](#how-research--fyp-nexus-works)
    1.  [OpenAlex data and proposal triage](#openalex-data-and-proposal-triage)
    2.  [Research & FYP Nexus connectors](#research--fyp-nexus-connectors)
3.  [Research & FYP Nexus validation and rollout](#research--fyp-nexus-validation-and-rollout)
4.  [Research & FYP Nexus evidence limits](#research--fyp-nexus-evidence-limits)
5.  [See also](#see-also)

## Problem in final year projects

- **Finding a title and supervisor is manual:** a student near the end of an internship still has no title, and "My mentor also said he doesn't know what general IT requirements are for FYP". The advice: "try contacting any lecturers or researchers in your faculty that are undergoing research, they'd typically give some part of their research as FYP title" ([FYP struggles thread]).
- **Stakes are high:** the FYP is "a requirement under MQA" for a bachelor's degree, and external marking can stretch results from finals in March to a ceremony in November ([FYP mandatory thread]). In one commenter's FYP module the Turnitin limit "was 20%" ([screwed FYP thread]).
- **Courses lag industry:** a Software Engineering student says "the syllabus like no update", and a diploma intern found the internship slides were "literally from 2024" ([do not come thread]).
- **No search tool:** students can't easily see what APU lecturers published recently. APU's KB does have a [Final Year Project space][KB FYP space] for the process itself.

[FYP struggles thread]: https://www.reddit.com/r/malaysiauni/comments/1v6s3e6/
[FYP mandatory thread]: https://www.reddit.com/r/malaysiauni/comments/1ib4taf/
[screwed FYP thread]: https://www.reddit.com/r/malaysiauni/comments/1m7drgn/
[do not come thread]: https://www.reddit.com/r/malaysiauni/comments/1wt49ge/
[KB FYP space]: https://apiit.atlassian.net/wiki/spaces/FYP

## How Research & FYP Nexus works

### OpenAlex data and proposal triage

OpenAlex's filter for APU's ROR ID `03c52a632` returned 3,712 works on 3 November 2026, with topic groupings and authors, under CC0 ([public data sources]). A weekly job loads APU's works and global topic trends into BigQuery, or into a Sheet on the no-card path. When a draft lands in the monitored Drive or SharePoint folder, the workflow:

1.  Ranks the top three APU lecturers who published on the topic recently.
2.  Checks recent OpenAlex, arXiv, and Crossref literature for overlapping or dated scope, before the student commits a semester.
3.  Checks APSoftware, APU's free software list, which includes SPSS, SolidWorks, SmartPLS, NVivo, SQL Server, Visual Studio, MATLAB, and NetSim ([KB APSoftware], [KB NetSim]).

[public data sources]: /docs/research/public-data-sources.md
[KB APSoftware]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/993492993
[KB NetSim]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/2346156347

### Research & FYP Nexus connectors

- **Google Drive, Sheets, and BigQuery:** Drive and Sheets are GA; BigQuery federated query is preview ([Gemini Enterprise data]). They hold the OpenAlex table, the `FYP_Scope_Rubric` rulebook, and evaluation logs.
- **Jira Cloud and SharePoint (GA):** create an FYP proposal review issue for the matched supervisor, and upload the generated literature baseline and method brief.
- **GitHub (GA):** after the FYP coordinator approves, create a starter repository file or trigger an Actions workflow.
- **Google Calendar and Gmail (GA):** propose a first supervision slot and point the student to iConsult, APU's lecturer consultation booking ([KB iConsult]).
- **Custom MCP on Cloud Run (preview):** `apu-openalex-mcp` queries OpenAlex, Crossref, and Semantic Scholar on demand and passes any API error straight through.

[Gemini Enterprise data]: /docs/research/gemini-enterprise-data.md
[KB iConsult]: https://apiit.atlassian.net/wiki/spaces/ITSM/pages/219086947

## Research & FYP Nexus validation and rollout

- **Research:** interview 6 Year 3 computing students in their FYP and 2 FYP supervisors on 5–6 November.
- **Evaluation set:** 50 real APU papers from OpenAlex with authors masked. Feed each abstract through the workflow and report Top-1 and Top-3 recall for naming the real APU author or topic group.
- **Months 1–3, from the 24 November 2026 intake:** pilot with the School of Technology FYP committee for incoming Year 3 cohorts.
- **Months 4–6, from the 25 March 2027 intake:** extend to other schools and add a curriculum drift report comparing OpenAlex topic growth with module syllabi.

## Research & FYP Nexus evidence limits

- **Weak theme fit:** there's no live sensor or network signal, and OpenAlex updates are not real time, hence C4 at 11 / 15.
- **Coverage gaps:** lecturers with few indexed papers will be under-ranked, and APU's supervisor allocation rules aren't public.

## See also

- [Argon idea ranking](00-ranking.md)
- [Public data sources](/docs/research/public-data-sources.md) on OpenAlex
- [APU's ROR record](https://ror.org/03c52a632)

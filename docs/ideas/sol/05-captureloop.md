# CaptureLoop

Find the missing figure, page or explanation in a student's genuine shared note packet, and follow a precise recapture request through to a usable replacement. **Rank 5, 59/100** in the [internal ranking](00-ranking.md); exploratory only, with unresolved demand, image-access and theme-strength gates.

Contents:

1. [User and evidence gap](#user-and-evidence-gap)
1. [What might be different](#what-might-be-different)
1. [Daily workflow and architecture](#daily-workflow-and-architecture)
1. [Remote MVP and demonstration](#remote-mvp-and-demonstration)
1. [Validation and kill criteria](#validation-and-kill-criteria)
1. [Build, impact and risks](#build-impact-and-risks)

## User and evidence gap

**User/owner:** a student voluntarily sharing their own handwritten notes with a study partner. Job: “Tell me exactly what is missing while I still have the original, so my partner can use the packet without another chain of requests.” Choose **Intelligent Automation & Digital Transformation**, focused on the student's document-sharing workflow.

No direct demand evidence for this precise job was found in this research. It is an independent ideation hypothesis, not a lesson from an interviewed student. The [social report](/docs/research/everyday.md#advance-meeting-notices-do-not-solve-participation-or-useful-preparation) describes group-work preparation problems, but does **not** establish missing-note captures. That weak connection must not be inflated into validation.

Use only genuine team-authored notes and an actual recipient task, with consent to publish the safe material required by the repo's data rules. No APU slides, protected course handbooks, assignments owned by others, grades or lecturer assistance are assumed. If the team lacks a real packet-sharing event, stop rather than manufacture one.

## What might be different

Ordinary scanning/OCR plus a recipient's glance is the baseline. This proposal makes no claim to invent scanning, OCR, page ordering, crop detection or accessible note-taking. Before building, inspect the actual scan/note app the participants already use.

The possible gap is **cross-reference closure**: a note refers to a figure or earlier derivation not present in the share packet; a recipient identifies the missing evidence; the owner receives one precise request; the replacement is linked and the recipient verifies usability. The agent must cite a page/region and explain uncertainty rather than invent a formula or reconstruct missing content.

Deterministic checks own page IDs, manifest completeness and delivery. Gemini would own contextual references and concise correction requests. If the context can be resolved by page numbering or a checklist alone, this is a poor use of AI.

## Daily workflow and architecture

1. The owner declares the real packet and intended recipient task, photographs their own pages and checks consent/publication suitability.
1. Phone camera captures are uploaded with page ID, capture time, checksum and acknowledgement. Lost uploads remain pending; they do not become “missing author content.” A checksum proves byte consistency, not readability or authenticity.
1. **Access gate:** prove the actual Enterprise tenant can inspect the real image/PDF content through the chosen supported path. Drive file actions alone do not establish vision/OCR capability. Do not invent an image connector or silently replace the core with a separate chatbot.
1. If the gate passes, the workflow reads the packet manifest and actual accessible content. It drafts a precise, evidence-linked request. The owner approves any task/message write and either recaptures, explains the reference, or rejects the suggestion.
1. The recipient checks the replacement against the actual task and explicitly closes the request. The original remains versioned; generated guesses never substitute for missing notes.

| Layer/connector           | Intended job                                             | What remains unverified                                                                        |
| ------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Phone camera              | Real original-page capture at home                       | Actual packet and willing recipient exist                                                      |
| HTTPS ingest and manifest | Acknowledge which page/version arrived                   | Camera upload is a thin network/IoT contribution unless it changes a timely recapture decision |
| Drive/Sheets, first party | Manifest, versions and approved status updates           | Supported account plus actual image/PDF inspection in Enterprise                               |
| Enterprise workflow       | Contextual reference check and correction follow-through | Cannot claim reliable handwritten mathematics or automatic accessibility certification         |

No Pi, third-party connector, APU system or automatic external message is required. Additional connectors need an actual user workflow before being added. Current [platform research](/docs/research/gemini-enterprise.md#platform-constraints-and-design-consequences) supports file actions, not the untested image-understanding path. Until that path is proven, this architecture is a conditional design and should not win selection.

## Remote MVP and demonstration

MVP: one genuine packet, one real recipient task, one observed gap and one corrected capture. Exclude full-course ingestion, exam answers, automatic derivation, note marketplaces and fabricated illegible pages.

Capture at home while the author has the original. Show an actual missing reference/crop only if one occurs in the real sharing task; otherwise show no issue found and record the negative result. Demonstrate the distinction between an interrupted upload, an absent page and content the model cannot read. End with a recipient checking the actual replacement. A manual invocation is labelled manual; any claimed recurrence needs separate real run history.

## Validation and kill criteria

First inspect a participant's last genuine sharing task using their current scan app and recipient feedback. Measure time to a usable packet, follow-up requests and false correction requests. Do not substitute OCR accuracy for recipient usefulness.

**Planned go thresholds:** two real sharing events expose repeated cross-reference gaps; a supported Enterprise image path works; at least five genuine correction opportunities can be assessed without staging errors; the candidate reduces follow-up time by 25% compared with the scan/checklist baseline; no fabricated content enters the packet; the recipient returns voluntarily.

**Kill:** no direct task evidence by 6 November; existing scan app/checklist resolves the observed gaps; tenant image inspection fails; false suggestions waste more time; public-data constraints cannot be met; or the device/network layer does not materially affect the correction. This is a documented alternative to reject if those gates fail, not a disguised build commitment.

## Build, impact and risks

Estimate **20–30 combined builder-hours after the image-access gate**: 6–8 for capture/versioning, 6–10 for content/reference loop, 4–6 for actual sharing trials, 4–6 for evidence/access. Do not spend that effort before proving demand and capability.

| Date        | Student owner             | Conditional impact and measure                                                       |
| ----------- | ------------------------- | ------------------------------------------------------------------------------------ |
| 6 Nov 2026  | Note author and recipient | Genuine packet gap and working tenant image inspection; otherwise stop               |
| 10 Nov 2026 | Workflow owner            | One verified recapture loop with source references and honest unreadable states      |
| 5 Feb 2027  | Student maintainer        | Five willing sharing pairs; record false requests and time to usable packet          |
| 5 May 2027  | Student maintainer        | Continue only if recurring use and saved follow-up exceed capture and licence burden |

Risks: no direct demand evidence, mature scan tools, handwriting/formula errors, publication rights, weak recurring operation, thin theme fit and unsupported tenant capability. The original author and recipient decide what is complete; an agent cannot certify the educational correctness of their notes. The [submission and finals gates](00-ranking.md#build-and-submission-plan) apply in full.

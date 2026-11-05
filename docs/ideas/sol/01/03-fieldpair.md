# FieldPair

Catch incompatible phone-sensor captures before a remote student team merges them, then organize the specific recollection while the experiment is still available. **Rank 3, 68/100** in the [internal ranking](00-ranking.md); research hold because protocol-error coordination is plausible but demand and incremental AI benefit remain weak.

Contents:

1. [User and evidence](#user-and-evidence)
1. [Difference from existing collection tools](#difference-from-existing-collection-tools)
1. [Daily workflow and architecture](#daily-workflow-and-architecture)
1. [Remote MVP and demonstration](#remote-mvp-and-demonstration)
1. [Validation and kill criteria](#validation-and-kill-criteria)
1. [Build, impact and risks](#build-impact-and-risks)

## User and evidence

**User/owner:** the student coordinating a small distributed sensor experiment, where teammates capture real readings at their own homes. Job: “Before I compare these runs, tell me which capture conditions differ from our agreed protocol and what evidence or recollection is needed.” Choose **Data-Driven Research & Intelligent Decision Making**.

A [home magnetometer experiment](https://www.reddit.com/r/AskPhysics/comments/mgblbj/) produced an unexpected relationship; the poster eventually reported that increasing distance fixed the setup issue. That is evidence of experimental setup/interpretation difficulty, not a unit-conversion bug or proof that an agent would have caught it. A [phyphox discussion](https://www.reddit.com/r/codyslab/comments/xhn85m/) includes a request for simultaneous sensor outputs and uncertainty about accuracy. Both are old transfer evidence, with no verified APU demand. See the [bounded source notes](/docs/research/everyday.md#phone-sensor-experiment-threads).

More recent [firsthand phyphox forum reports](https://phyphox.org/forums/showthread.php?pid=4887&tid=2356), June–July 2026, describe actual sampling-rate differences and an experiment loading differently across phones. Existing support resolved the case. This sharpens the capture-manifest design, but the user's student status is unknown and it does not validate a new coordination product; the research score remains low.

No lecturer, approved lab, campus visit or external environmental probe is needed. Use phone accelerometer recordings from safe ordinary motion or a stationary observation, selected only if there is an actual student experiment to coordinate. Do not stage a fictitious research project or drop a phone to create a dramatic event.

## Difference from existing collection tools

phyphox captures, plots and exports phone data. KoboToolbox and ODK provide validation/audit functions; QField synchronizes offline fieldwork; FizziQ already offers phone experiments and uncertainty activities. [Incumbent notes](/docs/research/competition.md#incumbents-checked-against-official-documentation).

The narrower hypothesis is **cross-run protocol compatibility and corrective closure**: the protocol changed, one member used a different sensor mode, a required declaration is absent, or a run arrived incompletely. Rules detect exact mismatches. Gemini reconciles a changing written protocol with those facts, explains the minimum correction, and coordinates the owner. It must never reject a surprising result because it differs from a textbook expectation.

The baseline is **phyphox + a versioned protocol + schema validation + shared checklist**. If that prevents the same mistakes more cheaply, use it. Offline uploads, automatic plots and “AI insights” are not sufficient differentiation.

## Daily workflow and architecture

1. The team writes a real protocol: experiment/version ID, required sensor/mode, units, intended duration, placement declarations and limits. A student approves it; the model cannot silently change scientific acceptance conditions.
1. Each phone captures actual measurements and a manifest. Sensor support is checked first. Device-reported sampling timestamps are evidence; orientation/placement that cannot be sensed reliably remain declarations. Preserve original observations unchanged.
1. The upload includes run ID, capture timestamps, expected row count and sequence. A complete acknowledgement separates a received run from an upload still pending. A backlog is historical, not live.
1. Enterprise directly reads manifests, protocol and unresolved recollection tasks. Deterministic rules identify absent fields, inconsistent units, wrong protocol IDs or incomplete delivery. The workflow prepares a specific correction, distinguishing a protocol mismatch, measurement uncertainty, scientific anomaly and transport failure.
1. The student approves a Jira task if recollection is actually needed. A replacement capture links to the original; it does not overwrite it. The coordinator accepts/rejects with a reason and the actual protocol, retaining valid unexpected observations.

| Layer/connector           | Necessary role                                                   | Boundary                                                      |
| ------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------- |
| Phones                    | Real motion/sensor captures                                      | Cross-device accuracy or calibration is not assumed           |
| HTTPS ingest → Sheet      | Acknowledged manifests and current upload state                  | Validate row/sequence completeness; never fill missing values |
| Drive/Sheets, first party | Current manifest ranges and versioned protocol                   | Direct actions, supported Workspace domain                    |
| Jira Cloud, third party   | Real recollection tasks assigned to student collectors           | Reviewed mutations; duplicate key includes run and reason     |
| Enterprise workflow       | Contextual protocol reconciliation and correction follow-through | Human owns scientific interpretation                          |

Cloud joins separately collected runs; network integrity determines what can be compared; phones provide the actual phenomena. A Pi is optional and unnecessary for the MVP. No clock-synchronization precision is promised: independent clocks do not establish simultaneous events. If paired timing is required, quantify offset/uncertainty or exclude that comparison. [Platform and measurement limits](/docs/research/gemini-enterprise.md).

## Remote MVP and demonstration

MVP: one real experiment, two phones, one protocol, one observed compatibility problem and one correction. Start with exported manifest summaries plus real capture files; do not build a scientific instrument suite. Collect only nonpersonal observations that the team can safely publish with provenance, consistent with the repo's data rules.

Show two actual captures and their declared conditions. If a genuine difference exists, explain it and have the responsible member perform the required correction. If all runs comply, show the no-action decision; do not label a valid reading as bad to create a task. A real connection interruption can prove incomplete-upload handling separately from scientific quality.

Display capture, receipt and analysis times; identify old versus current runs. Let a reviewer trigger the same reconciliation on real team records. No lecture data, student grades, room tracking or institution-owned datasets are required.

## Validation and kill criteria

Recruit one willing remote group with an existing experiment. Observe its current capture/merge process first. Record real compatibility failures, time to a usable replacement and wrongly rejected valid runs. Preserve the original protocol and have the student coordinator label the outcomes; disagreement with the agent is not automatically a human error.

**Planned go thresholds:** at least two recurring cross-run problems survive ordinary form/schema constraints; a minimum of ten real captures across two devices; no rejection based solely on an unexpected physical value; at least 30% lower correction time than the baseline; coordinator chooses to use it again. Report denominators and each false rejection rather than an unsupported “accuracy” percentage.

**Kill:** no genuine experiment by 6 November; existing tools prevent all observed errors; the data cannot be made safely public; device support fails; or every useful instruction is a fixed validator message. The novelty is an unproven correction workflow, not better physics.

## Build, impact and risks

Estimate **22–30 combined builder-hours** after access: 8–10 for capture/manifest integrity, 6–8 for protocol/workflow, 4–6 for real comparisons, 4–6 for evidence and reviewer access. This is riskier than the top two because device compatibility and scientific definitions must be settled early.

| Date        | Student owner          | Conditional impact and measure                                                                 |
| ----------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| 6 Nov 2026  | Experiment coordinator | Real protocol, two supported phones and observed merge/correction baseline                     |
| 10 Nov 2026 | Workflow owner         | One traceable correction loop with unmodified original data                                    |
| 5 Feb 2027  | Student maintainer     | Two willing research/project groups; count avoided invalid merges and false rejections         |
| 5 May 2027  | Student maintainer     | Continue only for protocols where recurring coordination benefit exceeds validation/setup cost |

Risks: little demand evidence, existing tools, calibration uncertainty, clock offsets, false scientific authority, data publication constraints and licence overhead. No clinical, structural-safety or environmental-compliance inference is proposed. The [submission and finals gates](00-ranking.md#build-and-submission-plan) apply in full.

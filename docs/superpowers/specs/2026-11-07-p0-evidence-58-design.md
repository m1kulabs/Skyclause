# Evidence packs for the P0 pilot

Design proposal for [#58](https://github.com/m1kulabs/Skyclause/issues/58), against the shared contract in [#47](https://github.com/m1kulabs/Skyclause/issues/47). The user approved doing this next after preserving APIMS history, followed by the APIMS and MET feeders. This document covers #58; it does not claim approval of implementation details before review.

## Intent

Turn each new eligible inbox message into one durable evidence row before the Gemini Enterprise email workflow reads it. Code parses the request, selects stored evidence and calculates rain totals. The model receives a prepared pack and performs no arithmetic. Replies to requesters remain behind #65's approval workflow.

The existing JPS dev workbook already contains the real 2 November series. #58's live acceptance can run there once an actual teammate sends the request and an actual approver is configured.

## Approach

Recommended: a pure TypeScript parser and pack builder, an orchestration layer with explicit ports, and thin Apps Script adapters. This follows the existing JPS, snapshot and clause modules and permits deterministic tests without sending mail.

A single script mixing Gmail, calculation and sheet writes would make privacy and failure recovery harder to verify. Asking the agent to assemble or calculate packs would contradict #58. The pure-core approach is the sensible fit for the existing contract.

Use the Advanced Gmail v1 service with the existing `gmail.modify` and `gmail.send` scopes. Its message-level API supplies `INBOX` labels, pagination and `internalDate`, the Gmail acceptance time for normal SMTP mail. Enable the service as a manifest dependency without adding OAuth scopes. Default Apps Script Cloud projects enable the corresponding API with the service; a standard Cloud project may need its owner to enable Gmail API. Any resulting owner prerequisite is recorded on #48.

Primary references: [message fields](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages), [message listing and scopes](https://developers.google.com/workspace/gmail/api/reference/rest/v1/users.messages/list), [advanced-service enablement](https://developers.google.com/apps-script/guides/services/advanced).

## Modules and boundaries

- `evidence.ts`: request parsing, public row projections, pack assembly and the orchestration ports. Split parsing/assembly into adjacent modules only if their size warrants it.
- `gas.ts`: Gmail MIME decoding and message paging, schema-position sheet access, private notification recovery state and Gmail draft/send operations.
- `main.ts`: parameterless manual/trigger entry point, using the existing script lock.
- `registry.ts`: one every-minute entry, installed only in the stamped pilot by `setup()`. Dev remains manual.
- `pilot/workflows/evidence-reply.md`: document the finalized pack fields for #65. Keep its operational build record pending.

The pure parser receives a subject, a first unquoted body line and an explicit receipt instant. It returns a discriminated request: `evidence`, `call`, `unsubscribe` or `unparseable`, with MYT span instants when applicable. It performs no I/O and reads no clock.

The pack builder receives that parsed request, project slug and explicit public data projections. Its return is a JSON-safe pack. Sender addresses, names, original request text and window titles never enter this builder.

The orchestrator receives message/store/notification ports. Private sender and duty-approver addresses are available only to the eligibility, unsubscribe and notification paths. Tests can replace the external ports while exercising the real parser, projections and builder.

## Parsing decisions

- Match the complete supported request grammar, case-insensitively, on the subject or first nonempty body line before quoted/forwarded history. Prefer text/plain MIME content. A bounded HTML-to-text conversion handles HTML-only messages without evaluating markup or scripts.
- Recognize `evidence for D Mmm HH:MM–HH:MM`, including an ASCII hyphen; `call for today`, `tomorrow` or `D Mmm`; and `unsubscribe`.
- An unsubscribe in either eligible location takes precedence. Otherwise a valid subject takes precedence over the first body line. This prevents an unsubscribe reply from becoming a repeat request merely because its old subject still matches.
- Resolve year, today and tomorrow from the Gmail receipt instant in MYT, not the poll's wall clock. Validate calendar dates and time fields rather than allowing JavaScript date rollover.
- Evidence spans stay on the named day; reject a reversed range. An equal start/end is an empty `(start, end]` reading range. Allow `24:00` only as an end boundary. A call covers local midnight through the following local midnight.
- Malformed or unrelated requests become `unparseable` with only the required header. They never become commands or model instructions.

These precedence and boundary choices are builder recommendations for approval, rather than requirements attributed to the user.

## Pack content and privacy

Preserve #58's sections: `header`, `readings`, `warnings`, `ledger` and `frames`. A call adds public windows, their available `now` rows, the newest forecast for the requested day and its glossary pairs. Compute display dates/times in code so #65 need not derive them from ISO timestamps.

- Readings contain only the fixed JPS gauge, bound APIMS stations and configured camera metrics. Keep the prescribed `[observed_at, value, revision]` triples, unit and source ID. Restrict visible rows to `(start, end]`.
- The gauge has a separate total at each stamp. Read enough preceding data for its 60-minute warm-up. Sum the highest revision of each five-minute observation in `(T - 60 minutes, T]`. A missing required stamp makes that total unavailable, not zero. Keep genuine zero measurements.
- Warnings use the established KL/in-force rules and preserve published text fields verbatim. Deduplicate known keys by their latest published revision. With no matching record, use exactly `No warning record for this window`.
- Select ledger entries linked to overlapping windows or with a crossing time in the requested span, then join their grades. Explicitly allow-list public IDs, kinds, modes, times and grade results. Never spread whole ledger rows, copy arbitrary `body` JSON, or expose approver names, recipient fields, free-text explanations or private URLs. Any retained nested body fields require a per-kind allow-list.
- Windows are projected from A–I and rebuilt field by field. Column J is never read. Subscriber rows are available only to the private unsubscribe adapter, not to pack construction. Rota addresses remain private notification routing data.
- Frames contain only file IDs and capture times from the requested interval. With none, use exactly `No frames held for this window`.
- Forecast and glossary data use their documented public columns. Missing records stay absent; never substitute an older live value or manufacture source history.
- Reject unsafe private fields during construction instead of trying to redact an already-serialized arbitrary object. Source-provided public text remains data and is never executed.
- Serialize the complete pack and enforce the 50,000-character cell bound conservatively using JavaScript string length. Oversized packs become kind `unparseable`, status `parsed`, and exactly `{"error":"pack too large"}`. Never truncate.

## Inbox coverage and idempotency

Use a private activation/cursor property, following the existing private clause-editor state pattern. On the first run, establish the activation receipt boundary. Do not import the owner's old inbox. The live procedure arms this boundary before asking the teammate to send the test message.

List individual INBOX messages in a frozen receipt-time interval, using an opaque page token and bounded pages. Keep the interval fixed while draining it so continuing arrivals cannot starve older requests. Commit page progress only after every message in that page is durably handled. Use a small overlap at time boundaries and deduplicate by Gmail message ID. An API/cursor failure surfaces an error and does not advance the cursor or silently discard a page.

Check message-level INBOX status and actual receipt time. Skip the owner's primary address, SENT-labelled self-mail, mailer-daemon messages and IDs already in `evidence`. Do not add broad sender filters that would skip unrelated messages which #58 requires to classify as unparseable. Do not mark messages read, archive or delete them.

New evidence rows populate A–G only, with the remaining columns initially blank. Existing rows, including #65's statuses and times, are never overwritten. Under the script lock, a retry first checks the persisted request ID.

Unsubscribe updates only matching sender addresses whose `unsubscribed_at` is blank, then records the evidence row. Use the message receipt time for a reproducible stamp. A retry or second unsubscribe leaves the original stamp intact. No unsubscribe reply is sent.

## Approver notification and failure handling

For a parsed evidence/call request, prepare private durable notification intent before committing the evidence row. Send only after the evidence row exists. This lets a later run recover the notification if the append succeeded but the invocation failed.

Fix `routing_at` to the first processing attempt's actual time and persist it with the private intent. Resolve the real approver covering that instant using the existing rota/time helper. If routing is missing, later retries consult that same instant so the owner can repair the original rota slot. Freeze the actual destination when a draft is created; later retries must not silently route the request to a different shift. Validate the destination and refuse to send to the requester. Missing or unsuitable configuration leaves an explicit pending notification and owner-visible error; do not invent a recipient or silently fall back to the requester.

Create/send a plain-text Gmail draft containing only the controlled request ID, kind, span and workbook reference. Retain its identity in private recovery state. Record the returned Gmail message ID in `notifications`, with kind `evidence_request` and ref equal to the request ID. Remove private pending state only after the log is durable.

Gmail sending and Sheets logging are separate external operations. Tests must cover each failure boundary. The handler itself provides a runnable reconciliation path: before retrying a pending send, inspect the original draft and search provider Sent records using an exact controlled per-request marker, then verify the frozen recipient and controlled subject/body marker. One verified Sent match supplies the real message ID and permits logging without another send. If the original unsent draft still exists, reuse that draft rather than creating a replacement. Zero or multiple Sent matches after a missing draft leave the intent pending with an explicit error for owner investigation. Later invocations can reconcile once the provider exposes a unique result; owner intervention is needed only for ambiguity that persists. There is no unchecked mark-as-sent operation and no blind replacement send.

Tests include a send that succeeds but loses its response, a notification append that persists then throws, recovery from a unique Sent match, a missing/deleted draft with no Sent match, multiple candidate Sent matches, and a retry crossing a rota shift. Do not claim an email was delivered when no provider message ID is known.

## Verification and delivery

Implement test-first after design approval. Cover grammar/quoting/MYT boundaries, malformed dates, warm-up totals and missing intervals, source revisions, all pack kinds, latest warning selection, nested privacy leakage, the exact size boundary, repeated messages, repeated unsubscribe, page failures and notification retry ordering. Assert that the requester-send capability does not exist on the orchestration port.

On the real JPS fixture, `evidence for 2 Nov 14:00–16:30` contains 30 visible gauge readings and a 39.0 mm trailing total at 15:00, with the exact absent-warning and absent-frame lines. Use test doubles only inside tests.

Run lint, typecheck, pilot tests and repository tests, then independent review and the applicable committed-ref local Linux CI jobs. Use a dedicated #58 branch and PR. Close #58 only after its merged code and permitted live dev evidence exist.

For the live check, configure actual project slug and approver routing, arm the inbox poller, then have a teammate send the exact request from their own account. Run the handler manually and verify kind/span/status, pack length, the warnings line, its notification message ID and repeat-run idempotency. Do not fabricate the teammate message, a person, consent or a rota assignment. Request the missing human action only when the runnable implementation is ready.

Shared-pilot provisioning remains #48; GE reply/approval/send remains #65. The pilot observation follow-up #380 remains open and is not satisfied by this dev check.

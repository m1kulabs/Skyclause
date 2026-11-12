# Member window lifecycle implementation plan

Original approved issue139 Task4, member core only. Use subagent-driven-development with one scoped implementer and independent review. Guest-specific acceptance remains open with180/181/182; this plan does not claim whole139 completion.

**Goal:** real recurring declaration and occurrence/series edit/cancel for uncapped ordinary-organisation member/API-key/OAuth/CLI callers, using existing helpers and accepted storage.

**Spec:** docs/superpowers/specs/2026-11-13-window-lifecycle-design.md and originalTask4 in docs/superpowers/plans/2026-11-13-window-lifecycle.md. The exact seam mapping at /Users/jeremywoon/.codex/artifacts/skyclause-p1-core-20261109/submission-20261112/139-task4-seams.md supersedes stale helper names and argument order.

Contents:

1. [Global constraints](#global-constraints)
1. [Task 1: Implement member lifecycle](#task-1-implement-member-lifecycle)

## Global constraints

- Existing1db8 branchfeat/windows-lifecycle-20261113 atf3cc0387, integratedmain e1e7f66c, accepted149parser/111storage/canonicalevent contract;287focusedintegrationtests8files and SDKbuild pass. Originalmain untouched. No source777 policy or frontend edits.
- Every shell/subprocess beginsrtk. Heavychecks through approvedART/submission-20261112/run-check.py, pinnedNode22.22/Bun1.4.4/PG56440/sharedlock/maxWorkers4/default5000ms. No VM/image/auth/config/productionmigration change.
- SQL onlypackages/db. Preserve all applied migrations; existing0050 is ownedstorage and mustnotrewrite. Add DB-owned orchestration/queries using existingnullabledefinitions and fields, no newDDLwithoutparentruling.
- First refactor exactexistingAPIhelpers/types into internalsharedmodule as a separate normal commit with no behaviorchange; retain list/create public signatures, UIcodes/projection andsourceexports.
- Real newbehavior contracts/services mustuseactual(ctx,input,access) order and strictOps schemas. No second list/create path or idempotency engine. Sharedvalidator machinecodes mustbe structural, not parsed fromhumanmessages; preserve currentwebcodes.
- Completefeed/seriesparentlocks before membership discovery/recheck; plan/validateall desiredrows, thenprelockcompleteexistingID+newparentset before firstmutation/event. NoSQLinAPI. Reuse realwriteWindowChange events/ledger rather thanduplicate them.
- Member core remains fail-closed forguest/token/reviewer/link-boundOAuth/Commons/unattendedguest cohorts. No typedapplyGuestWindowPolicy/guestContext/checkGuestTitle exists; do notinventruntimeports ordefaultsuccess. RealbudgetGate nowexists foruncappednormalorgs via781; genericBudgetGateinjectiontestsareallowed, but cannotcountasguestreadiness. Parent keepsoriginal139guestcheckboxopen.
- Patch applies explicitlyprovidedfieldstofuturemembers, includingoverrides of thosefields; preserve startedhistory and cancellationtombstones. Nativeoccurrence identity staysoriginalseriesdate; rulechanges reconcilemembership (cancelremovedfutureidentities, createnewdates) rather than silentlyreuseunrelatedIDs. Keeporiginalanchor/countfor extension; ifexplicitseriesdateshiftneeded settleunambiguousrelative-date policy andrecordit.
- Importedrecurrence changes are422/source-owned. Manualedit ofimportedwindow emitsordinarywindowevent withoutsourcecalendarrevision; source identityunchanged, localoverrideintentexplicit. Importedwhole-series manualfielddefaults musthavea typedstoredshape forTask5; reportit beforehandoff.
- No broad Error-to409 catch; distinguishknownstatefailures fromSQL/programming failures. LegacyNULLdefinition cannotinventanchor; seriesoperation409. No-op sameeffectivevalues emitsnothing, and mustnotfliplocalOverride. EmptyPATCH422; title-onlypastannotationallowed, pasttimechangesnotallowed.
- Sourcecalendar representativeevent contractalreadyaccepted; no newAPIpubliccalendarproducerhere. Preserve pseudonymousaudit and guest+sentguard. Callerprincipals/provenanceimmutable, neverbody-owned.
- Parent owns finalwhole139 graph/integratedsuite/Linux/wholebranchreview andissueclosure. Agent focusedAPI/contract/DBexistingregressions + types/lint/OpenAPI + normalhooks, noGCP/GH/push/agents.

### Task 1: Implement member lifecycle

**Files:** existingAPI windows service/routes plus newinternalshared/series/lifecycle modules; DB windows orchestration/queries; contractsapi/v1/windows.ts; generatedAPIopenapi; meaningfulAPI/DB/contract tests. Update onlyrelevant139design/plan statements that are stale, in own docscommit.

**Interfaces:** infer WindowBody, UpdateWindowBody, WindowView andWindowScope from Operations. createWindowSeries(ctx,{projectId,body},access), updateWindow(ctx,{id,scope,patch},access), cancelWindow(ctx,{id,scope},access). SharedopenProject/declarer/windowView reuseactual implementations per seamreport. ReturnearliestmaterializedWindowView forseriesPOST; entirelyskipped422. Seriesedit/cancel returnsselectedID withcurrentcalls evenifpastunchangedorremoved/cancelled; documentthis.

- [ ] Baseline existingwindowsAPI/pure/storage tests already287GREEN; useTDD newscopedtests beforebehaviorcode. Refactorhelperbaselinecheck andnormalcommit separately.
- [ ] Teststrictspoof/unknownroot/nestedfields, preciseinstants/zone/allWIN8boundaries/independentUIcodes, exactly11count-skip rows, allskippederror, member/APIkey/OAuth/MCP/CLIreplay throughrealexistingidempotencymiddleware.
- [ ] Test directservice+route scopes, Viewer403beforetargetlookup, foreign/hidden404, resource-scopedOAuth, unsupportedcohortsremainingdenied; no fictionalguestpolicy readiness.
- [ ] Test occurrencevseries futureedits includingexplicitoverrides, recurrencechange stable identities, inactiveparents/legacydefinition/conflict errors, explicitpastoccurrencecancel retainingtimes/calls/onecurrentledgerwithdrawal, whole-seriespastpreservation, tombstones andmeaningfulno-ops.
- [ ] Implement strictcontracts/declared409and422, canonicalvalidatoradapter andDB-owned native definition/series orchestration. Lock/recheckmembership underparents, validatecompleteplan beforewrites, then completebatchprelock andrealmutations. Preserve singlecreateanalytics withrecurring=truewhereappropriate.
- [ ] Run newfocusedAPI+contract+DBtests and existingwindowregressions; generate/checkOpenAPI; API/DB/roottypesasappropriate, rootlint andnormalhooks. RecordeveryRED/GREEN/deviation/cost inreport, exactcandidate=commitclean. Do notrunfullsuite/Linux/graph orclaim139complete.

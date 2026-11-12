# Calendar feed integration implementation plan

Approved issue139 Task5, member core. Use subagent-driven-development with one implementer and independent review; parent owns Task6/final integration. Full guest readiness and139closure remain open.

**Goal:** guarded URL registration, immediate file import, private status reads and atomic identity-preserving reconciliation using the accepted bounded parser and storage.

**Spec:** original139Task5/design plus exact /Users/jeremywoon/.codex/artifacts/skyclause-p1-core-20261109/submission-20261112/139-task5-seams.md. Sourcecurrent45d47acf includes accepted149parser/111storage/member357/canonicalcalendarcontracts. Actual(ctx,input,access) order supersedes old speculative interfaces.

Contents:

1. [Global constraints](#global-constraints)
1. [Task 1: Implement guarded feed reconciliation](#task-1-implement-guarded-feed-reconciliation)

## Global constraints

- Existing1db8 branchfeat/windows-lifecycle-20261113; originalmain untouched. Every shell/subprocessrtk. Heavychecks approvedrun-check.py pinsNode22.22/Bun1.4.4/PG56440/sharedlock/maxWorkers4/default5000ms. No VM/image/config/deps/cloud/GH/push/graph changes.
- SQL onlypackages/db. Existing0050 fields suffice; neverrewriteappliedmigrations oraddDDLwithoutparentruling. Worker mayimport API throughallowedexistinglayer; addnarrowAPI ./windows exportforfutureTask6orchestration, no newpackage.
- Preserveactualfeedlist/cursor andauthhelperbehavior. NewgetIcsFeed/fullstatusstrictschemas derivewiretypes fromOperations; no handwrittenwirecopies. Addoptionalkind(defaultclass) andpending/ready/error/removed/attempt/error/skipped fields asdesigned, no normalizeddocument/provenance/claimsecret inviews.
- Metadata/status remainreadablethroughcanonicalproject.view/resource checks; rawURL/filename/UID diagnostics onlytoadmittedordinarymember withscopedwindow.declare andcredentialscope. RedactURLtoNULL, omitfilename, sanitizeUID/recurrence/detailforotherauthorizedreaders. SecretcalendarcapabilityURLmustnotleakthroughlogs/errors/outbox. StoreonlyIDsinprovenance, nevercredentials or stalepermission snapshots. Normalizeuserinfoasactualguarddoes; nocredentialedfetch workaround.
- URLcreateauthorizesandassertPublicUrl HTTPS/DNSinsideexistingrequest/idempotencyTx, inserts201pending nextRefreshAt=now withnullrefreshedAt/attempt/document andZEROHTTP/windows. Filecreate5MiBUTF8, parse/resolve/applyinthisTx, readyonlyafteractualsuccess, noHTTP. Existingmiddleware replaysoriginal201response; get/listlaterstate.
- Useactualconfig/net AssertPublicUrl andSafeFetch. HTTPSrequired,follow3redirects,10s,5MiB; only200changed/304unchanged. ETagpreferredelseLastModified.304reusesconfirmedauthoritativeDoc, notemptycalendar; missingDocerror. FailedHTTP/network/unsafe/parserdoesZERODESCTRUCTIVEDIFF andno cached-successfallback. Allerrorcodes/detailsfixedsanitized; preserveactualstoredsuccessvalidators/document onerror.
- Parserwhitelist/UIDrecurrenceframes/limitsremainauthoritative; noalternateengine/unboundediteration/globalTZregistration. UID/recurrence arecase-sensitiveopaquestrings; UUIDmetadataonlycanonicalizeslowercase. Skipped/protectedidentitiescannotbeinterpretedasdisappearance. MalformedwholeDocappliesnothing. Cancelonlyeligibleupcomingsource-managedrowswithinconfirmedreconciliationcoverage, preservehistory/manualoverrides/manualtombstones/stoppedseries; outside-horizonabsencealoneisnotdeletionproof.
- DBmutateIcsFeedlocksfeed,rechecksactive/claim,allseriesbeforemembership,thencompleteexistingwindow/newparentsetbeforeanymutation/event. Extendsharedparentbookkeepingratherthanadhoclocks/fakerowstoacquirelocks. Plan/validatecompleteboundedchangeset first,allocateallnewIDs+oneUUIDv7revisionbeforewrites;20kdistinctchangedIDsmax,no truncation.
- Imported ruleversion1 referencesUIDinauthoritativefeeddocument. Definitionexactshape{version:1,source:ics,manualDefaults:{title?,kind?,tz?,localStart?,localEnd?,endDayOffset?,dateOffsetDays?}} frommemberTask4. Applymanualdefaultsonceincurrentlocalframe; sourceidentitiesstable. Source-drivenabsence/cancelmustnotmarkseriesasmanuallystopped; manualcancelledseriesstaysinactive.
- Extendexistingrestore-source withoptionalvalidatedfinalfieldpatch ifneeded, preservingguard/origin/override checks andONEfinalwindowupdatedevent. No restore+update doubleevent. Canonicalordinaryeventsforeachactualchangedrow; smallestchangedIDalonefullsortedsetcalendar metadata,peersrevision-only. Noopemitsnothing, cannotchoosea nooprepresentative. No directrequestRunhere.
- Softdeletefencesclaimandcancelsupcomingmanagedrowsusingrealprimitive,retaincalls/history/ledger. LegacyNULLidentity/document/provenance cannotinventsource/actor forunattendedmutation; returnvisibleunavailable/error untilgenuinelyreconciled. Explicitauthorizeddeleteusesrealknownfeedmembership, not guessedUID.
- DBclaim/applyinterfacesforTask6typedandbounded; no unboundedpreclaim ofworkthatcannotbeattempted. ClaimlastAttemptAt meansactualclaimtime,nextRefreshAt+1h,lateclaimresults/deletedfeedsignored. Noworkerregistry/schedulerchangeinTask5; HTTPmustlaterbeoutsideTx thenfreshsame-tenantapply.
- Membermutationsfailclosedguest/token/reviewer/link-boundOAuth/Commons untilreal180/181/182; allownedWhiteAvocad0, notsomeoneelse'sblockedwork. Reuseactualpositive-roleMemberhelpersandgenuineBudgetGatewhereappropriate. No fictionalguestpolicy/runtimefallback. Source777D45/Scheduler/freshnessthresholddecisionindependent, nochangeshere.
- Parentownsfull139graph/fullsuite/Linux/finalreview/issueclosure. Agentfocusedtests/types/lint/OpenAPI+normalhooks; nofullbroadrepeatwithoutnewfailure. Frontendownerkymil4; do noteditUI, reportexactpendingURLcopysitesforparentissue.

### Task 1: Implement guarded feed reconciliation

**Files:** contractsapi/v1/ics-feeds.ts/shared response,APIics-feeds services/routes, windows/fetch-ics.ts +privateparse/applyhelpers,DBics/windowsrepository/orchestration/types,exports,APIpackage ./windows export,focusedAPI/DB/net/contracttests,generatedOpenAPI. Preserveparser/publicmemberAPIsunlessnarrowcanonicalinterfacefixrequiredandreported.

**Interfaces:** exacttypedproposal in139-task5-seams.md. Implementget/list/create/delete; fetchCalendar(url,validators,realCalendarTransport); typedclaimDueIcsFeeds/mutateIcsFeed/applyresult forTask6. NoAPI SQL. Publishexactfinalinterfaces/report fornextworkerimplementer.

- [ ] MeaningfulTDDURL201pendingandnoHTTP, samekeyreplay, fileimmediateimport/noHTTP,defaultkind,strictURLxorfile/unknownfields,sizeUTF8,Viewerdenial/foreign404/readprojection andunsafeURLpreflightproblem.
- [ ] NettestsactualguardwithisolatedDNS/HTTP forprivate/loopback/linklocal/metadataredirects,HTTPS/3redirects/10s/5MiB,ETagprecedence/304/noDoc/non200/errors. No productionnetwork/dummyrows.
- [ ] DB/APIreconciliationtests:stableUID/windowIDendtimeedit,duplicate/invaliddoczerochanges,skipsprotected,sourcecancel/disappearance/EXDATE,manualoverrides/tombstones/startedhistory/stoppedparent,onefinalrestored-event,claimfencing/delete/late/outoforder,sameTxrollbackandnoops.
- [ ] Immutablecompletecalendarrevision/representative/peerdata and20kcap; realmulti-parent/membershiplocking andactualchangedsetbeforeevents. Realledgerforrequiredsentcallwithdrawal withnoPII.
- [ ] FocusedAPI/DB/contracts/netregressionsincludingacceptedmember/parsers,generate/checkOpenAPI,types/rootlint(normalforcebuildonlyonstaledtsfact),normalhookcommits. ReporteveryRED/GREEN/commandexit/log,decisionscosts,exactcandidate=commitsclean,skippedguest/live/finalgates.

export interface ExpandedOperation {
  method: 'get' | 'post' | 'put' | 'patch' | 'delete'
  path: string
  surface: 'v1' | 'api'
  operationId: string
  owner: string
  statement: string
  idempotent: boolean
  stream?: true
  crossOrg: boolean
  note?: string
}

export const OPERATIONS: readonly ExpandedOperation[] = [
  // Identity
  {
    method: 'get',
    path: '/v1/me',
    surface: 'v1',
    operationId: 'getMe',
    owner: 'e-cli-core',
    statement: 'any',
    idempotent: false,
    crossOrg: false
  },
  // Projects
  {
    method: 'get',
    path: '/v1/projects',
    surface: 'v1',
    operationId: 'listProjects',
    owner: 'b-projects-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}',
    surface: 'v1',
    operationId: 'getProject',
    owner: 'b-projects-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  // Source bindings and packs
  {
    method: 'get',
    path: '/v1/catalogue/sources',
    surface: 'v1',
    operationId: 'listCatalogueSources',
    owner: 'b-source-binding',
    statement: 'project.view',
    idempotent: false,
    crossOrg: false
  },
  {
    method: 'post',
    path: '/v1/projects/{id}/sources',
    surface: 'v1',
    operationId: 'bindSource',
    owner: 'b-source-binding',
    statement: 'sources.manage',
    idempotent: true,
    crossOrg: true,
    note: 'Bind with POST on the collection; unbind with DELETE on the source item.'
  },
  {
    method: 'delete',
    path: '/v1/projects/{id}/sources/{sourceId}',
    surface: 'v1',
    operationId: 'unbindSource',
    owner: 'b-source-binding',
    statement: 'sources.manage',
    idempotent: false,
    crossOrg: true,
    note: 'Bind with POST on the collection; unbind with DELETE on the source item.'
  },
  {
    method: 'patch',
    path: '/v1/projects/{id}/packs/{pack}',
    surface: 'v1',
    operationId: 'updateProjectPack',
    owner: 'b-source-binding',
    statement: 'sources.manage',
    idempotent: false,
    crossOrg: true
  },
  // Devices and ingestion
  {
    method: 'post',
    path: '/v1/projects/{id}/devices',
    surface: 'v1',
    operationId: 'createDevice',
    owner: 'b-device-ingest',
    statement: 'sources.manage',
    idempotent: true,
    crossOrg: true
  },
  {
    method: 'post',
    path: '/v1/sources/{id}/rotate-token',
    surface: 'v1',
    operationId: 'rotateDeviceToken',
    owner: 'b-device-ingest',
    statement: 'sources.manage',
    idempotent: true,
    crossOrg: true,
    note: 'Rotation creates a replacement credential, so it requires Idempotency-Key.'
  },
  {
    method: 'post',
    path: '/v1/ingest/{sourceId}',
    surface: 'v1',
    operationId: 'ingestReadings',
    owner: 'b-device-ingest',
    statement: 'device',
    idempotent: true,
    crossOrg: true
  },
  // Signals
  {
    method: 'get',
    path: '/v1/projects/{id}/sources',
    surface: 'v1',
    operationId: 'listProjectSources',
    owner: 'b-signals-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/indicators',
    surface: 'v1',
    operationId: 'getProjectIndicators',
    owner: 'b-signals-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/verdicts',
    surface: 'v1',
    operationId: 'getProjectVerdicts',
    owner: 'b-signals-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/strip',
    surface: 'v1',
    operationId: 'getProjectStrip',
    owner: 'b-signals-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/days',
    surface: 'v1',
    operationId: 'listProjectDays',
    owner: 'b-signals-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/readings/stream',
    surface: 'v1',
    operationId: 'streamReadings',
    owner: 'b-signals-api',
    statement: 'project.view',
    idempotent: false,
    stream: true,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/sources/{id}/readings',
    surface: 'v1',
    operationId: 'listSourceReadings',
    owner: 'b-signals-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/sources/{id}/polls',
    surface: 'v1',
    operationId: 'listSourcePolls',
    owner: 'b-signals-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  // Clause sheets and drafts
  {
    method: 'get',
    path: '/v1/projects/{id}/clause-sheets',
    surface: 'v1',
    operationId: 'listClauseSheets',
    owner: 'b-clause-sheets-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/clause-sheets/{id}/versions',
    surface: 'v1',
    operationId: 'listClauseSheetVersions',
    owner: 'b-clause-sheets-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/clause-sheets/{id}/versions/{n}',
    surface: 'v1',
    operationId: 'getClauseSheetVersion',
    owner: 'b-clause-sheets-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/clause-sheets/{id}/diff',
    surface: 'v1',
    operationId: 'getClauseSheetDiff',
    owner: 'b-clause-sheets-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'post',
    path: '/v1/clause-sheets/{id}/evaluate',
    surface: 'v1',
    operationId: 'evaluateClauseSheet',
    owner: 'b-clause-sheets-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true,
    note: 'Evaluate is a sheet-level computation, as in TRD API resources; it creates no resource.'
  },
  {
    method: 'get',
    path: '/v1/clause-sheets/{id}/drafts',
    surface: 'v1',
    operationId: 'listClauseSheetDrafts',
    owner: 'b-clause-sheets-api',
    statement: 'clause_draft.edit',
    idempotent: false,
    crossOrg: true,
    note: 'Drafts use collection GET/POST and item GET/DELETE; every save creates a new draft (CLS-7, SET-7).'
  },
  {
    method: 'post',
    path: '/v1/clause-sheets/{id}/drafts',
    surface: 'v1',
    operationId: 'createClauseSheetDraft',
    owner: 'b-clause-sheets-api',
    statement: 'clause_draft.edit',
    idempotent: true,
    crossOrg: true,
    note: 'Drafts use collection GET/POST and item GET/DELETE; every save creates a new draft (CLS-7, SET-7).'
  },
  {
    method: 'get',
    path: '/v1/clause-sheets/{id}/drafts/{draftId}',
    surface: 'v1',
    operationId: 'getClauseSheetDraft',
    owner: 'b-clause-sheets-api',
    statement: 'clause_draft.edit',
    idempotent: false,
    crossOrg: true,
    note: 'Drafts use collection GET/POST and item GET/DELETE; every save creates a new draft (CLS-7, SET-7).'
  },
  {
    method: 'delete',
    path: '/v1/clause-sheets/{id}/drafts/{draftId}',
    surface: 'v1',
    operationId: 'deleteClauseSheetDraft',
    owner: 'b-clause-sheets-api',
    statement: 'clause_draft.edit',
    idempotent: false,
    crossOrg: true,
    note: 'Drafts use collection GET/POST and item GET/DELETE; every save creates a new draft (CLS-7, SET-7).'
  },
  // Replays
  {
    method: 'post',
    path: '/v1/clause-sheets/{id}/replay',
    surface: 'v1',
    operationId: 'createReplay',
    owner: 'b-replay',
    statement: 'project.view',
    idempotent: true,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/replays/{id}',
    surface: 'v1',
    operationId: 'getReplay',
    owner: 'b-replay',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  // Windows and imported calendars
  {
    method: 'get',
    path: '/v1/projects/{id}/windows',
    surface: 'v1',
    operationId: 'listWindows',
    owner: 'b-windows-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'post',
    path: '/v1/projects/{id}/windows',
    surface: 'v1',
    operationId: 'createWindow',
    owner: 'b-windows-api',
    statement: 'window.declare',
    idempotent: true,
    crossOrg: true
  },
  {
    method: 'patch',
    path: '/v1/windows/{id}',
    surface: 'v1',
    operationId: 'updateWindow',
    owner: 'b-windows-api',
    statement: 'window.declare',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'delete',
    path: '/v1/windows/{id}',
    surface: 'v1',
    operationId: 'cancelWindow',
    owner: 'b-windows-api',
    statement: 'window.declare',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/ics-feeds',
    surface: 'v1',
    operationId: 'listIcsFeeds',
    owner: 'b-windows-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true,
    note: 'ICS feeds use collection GET/POST and item DELETE for listing, importing and disconnecting (WIN-4).'
  },
  {
    method: 'post',
    path: '/v1/projects/{id}/ics-feeds',
    surface: 'v1',
    operationId: 'createIcsFeed',
    owner: 'b-windows-api',
    statement: 'window.declare',
    idempotent: true,
    crossOrg: true,
    note: 'ICS feeds use collection GET/POST and item DELETE for listing, importing and disconnecting (WIN-4).'
  },
  {
    method: 'delete',
    path: '/v1/ics-feeds/{id}',
    surface: 'v1',
    operationId: 'deleteIcsFeed',
    owner: 'b-windows-api',
    statement: 'window.declare',
    idempotent: false,
    crossOrg: true,
    note: 'ICS feeds use collection GET/POST and item DELETE for listing, importing and disconnecting (WIN-4).'
  },
  // Guest window reports
  {
    method: 'post',
    path: '/v1/windows/{id}/reports',
    surface: 'v1',
    operationId: 'createWindowReport',
    owner: 'd-guest-lifecycle',
    statement: 'guest',
    idempotent: true,
    crossOrg: true
  },
  // Listings and nights
  {
    method: 'get',
    path: '/v1/projects/{id}/listings',
    surface: 'v1',
    operationId: 'listProjectListings',
    owner: 'b-listings',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'post',
    path: '/v1/projects/{id}/listings',
    surface: 'v1',
    operationId: 'proposeListing',
    owner: 'b-listings',
    statement: 'listing.propose',
    idempotent: true,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/nights',
    surface: 'v1',
    operationId: 'listNights',
    owner: 'b-forecast',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/nights/{id}',
    surface: 'v1',
    operationId: 'getNight',
    owner: 'b-forecast',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  // Runs
  {
    method: 'get',
    path: '/v1/projects/{id}/runs',
    surface: 'v1',
    operationId: 'listRuns',
    owner: 'c-run-orchestrator',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'post',
    path: '/v1/projects/{id}/runs',
    surface: 'v1',
    operationId: 'createRun',
    owner: 'c-run-orchestrator',
    statement: 'run.request',
    idempotent: true,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/runs/{id}',
    surface: 'v1',
    operationId: 'getRun',
    owner: 'c-run-orchestrator',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  // Bundles and calls
  {
    method: 'get',
    path: '/v1/projects/{id}/bundles',
    surface: 'v1',
    operationId: 'listProjectBundles',
    owner: 'c-bundle-lifecycle',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/bundles/stream',
    surface: 'v1',
    operationId: 'streamBundles',
    owner: 'c-bundle-lifecycle',
    statement: 'project.view',
    idempotent: false,
    stream: true,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/calls',
    surface: 'v1',
    operationId: 'listProjectCalls',
    owner: 'c-bundle-lifecycle',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/bundles/{id}',
    surface: 'v1',
    operationId: 'getBundle',
    owner: 'c-bundle-lifecycle',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/calls/{id}',
    surface: 'v1',
    operationId: 'getCall',
    owner: 'c-bundle-lifecycle',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/calls/{id}/explanation',
    surface: 'v1',
    operationId: 'getCallExplanation',
    owner: 'c-bundle-lifecycle',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  // Ledger and pilot archive
  {
    method: 'get',
    path: '/v1/projects/{id}/ledger',
    surface: 'v1',
    operationId: 'listLedgerEntries',
    owner: 'c-ledger-chain',
    statement: 'ledger.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/ledger/export',
    surface: 'v1',
    operationId: 'exportLedger',
    owner: 'c-ledger-chain',
    statement: 'ledger.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/ledger/verify',
    surface: 'v1',
    operationId: 'verifyLedger',
    owner: 'c-ledger-chain',
    statement: 'ledger.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/pilot-archive',
    surface: 'v1',
    operationId: 'getPilotArchive',
    owner: 'c-ledger-chain',
    statement: 'ledger.view',
    idempotent: false,
    crossOrg: true
  },
  // Grades and review items
  {
    method: 'get',
    path: '/v1/projects/{id}/grades',
    surface: 'v1',
    operationId: 'listGrades',
    owner: 'c-grades',
    statement: 'ledger.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/review-items',
    surface: 'v1',
    operationId: 'listReviewItems',
    owner: 'c-grades',
    statement: 'ledger.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'patch',
    path: '/v1/review-items/{id}',
    surface: 'v1',
    operationId: 'updateReviewItem',
    owner: 'c-grades',
    statement: 'bundle.approve',
    idempotent: false,
    crossOrg: true
  },
  // Analysis
  {
    method: 'get',
    path: '/v1/projects/{id}/analysis',
    surface: 'v1',
    operationId: 'getProjectAnalysis',
    owner: 'c-analysis-api',
    statement: 'ledger.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/analysis',
    surface: 'v1',
    operationId: 'getOrganisationAnalysis',
    owner: 'c-analysis-api',
    statement: 'ledger.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'post',
    path: '/v1/projects/{id}/analysis/what-if',
    surface: 'v1',
    operationId: 'evaluateWhatIf',
    owner: 'c-analysis-api',
    statement: 'ledger.view',
    idempotent: false,
    crossOrg: true,
    note: 'What-if returns a computed replay directly; no stored replay resource is specified.'
  },
  // Evidence requests
  {
    method: 'get',
    path: '/v1/projects/{id}/evidence-requests',
    surface: 'v1',
    operationId: 'listEvidenceRequests',
    owner: 'c-evidence',
    statement: 'evidence.request',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'post',
    path: '/v1/projects/{id}/evidence-requests',
    surface: 'v1',
    operationId: 'createEvidenceRequest',
    owner: 'c-evidence',
    statement: 'evidence.request',
    idempotent: true,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/evidence-requests/{id}',
    surface: 'v1',
    operationId: 'getEvidenceRequest',
    owner: 'c-evidence',
    statement: 'evidence.request',
    idempotent: false,
    crossOrg: true
  },
  // Subscribers
  {
    method: 'get',
    path: '/v1/projects/{id}/subscribers',
    surface: 'v1',
    operationId: 'listSubscribers',
    owner: 'c-subscribers',
    statement: 'channels.manage',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'post',
    path: '/v1/projects/{id}/subscribers',
    surface: 'v1',
    operationId: 'createSubscriber',
    owner: 'c-subscribers',
    statement: 'channels.manage',
    idempotent: true,
    crossOrg: true
  },
  {
    method: 'post',
    path: '/v1/projects/{id}/subscribe-link',
    surface: 'v1',
    operationId: 'createSubscribeLink',
    owner: 'c-subscribers',
    statement: 'channels.manage',
    idempotent: true,
    crossOrg: true
  },
  {
    method: 'delete',
    path: '/v1/subscribers/{id}',
    surface: 'v1',
    operationId: 'deleteSubscriber',
    owner: 'c-subscribers',
    statement: 'channels.manage',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/subscriber-counts',
    surface: 'v1',
    operationId: 'getSubscriberCounts',
    owner: 'c-subscribers',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  // Channels
  {
    method: 'get',
    path: '/v1/projects/{id}/channels',
    surface: 'v1',
    operationId: 'listChannels',
    owner: 'c-notice-templates',
    statement: 'channels.manage',
    idempotent: false,
    crossOrg: true,
    note: 'Channels use GET for saved settings and previews, and PATCH for a named channel.'
  },
  {
    method: 'get',
    path: '/v1/projects/{id}/channels/preview',
    surface: 'v1',
    operationId: 'previewChannels',
    owner: 'c-notice-templates',
    statement: 'channels.manage',
    idempotent: false,
    crossOrg: true,
    note: 'Channels use GET for saved settings and previews, and PATCH for a named channel.'
  },
  {
    method: 'patch',
    path: '/v1/projects/{id}/channels/{channel}',
    surface: 'v1',
    operationId: 'updateChannel',
    owner: 'c-notice-templates',
    statement: 'channels.manage',
    idempotent: false,
    crossOrg: true,
    note: 'Channels use GET for saved settings and previews, and PATCH for a named channel.'
  },
  // Webhooks
  {
    method: 'get',
    path: '/v1/webhooks',
    surface: 'v1',
    operationId: 'listWebhooks',
    owner: 'e-webhooks',
    statement: 'integrations.manage',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'post',
    path: '/v1/webhooks',
    surface: 'v1',
    operationId: 'createWebhook',
    owner: 'e-webhooks',
    statement: 'integrations.manage',
    idempotent: true,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/webhooks/{id}',
    surface: 'v1',
    operationId: 'getWebhook',
    owner: 'e-webhooks',
    statement: 'integrations.manage',
    idempotent: false,
    crossOrg: true,
    note: 'The webhook item supports GET, PATCH and DELETE for saved endpoint management.'
  },
  {
    method: 'patch',
    path: '/v1/webhooks/{id}',
    surface: 'v1',
    operationId: 'updateWebhook',
    owner: 'e-webhooks',
    statement: 'integrations.manage',
    idempotent: false,
    crossOrg: true,
    note: 'The webhook item supports GET, PATCH and DELETE for saved endpoint management.'
  },
  {
    method: 'delete',
    path: '/v1/webhooks/{id}',
    surface: 'v1',
    operationId: 'deleteWebhook',
    owner: 'e-webhooks',
    statement: 'integrations.manage',
    idempotent: false,
    crossOrg: true,
    note: 'The webhook item supports GET, PATCH and DELETE for saved endpoint management.'
  },
  {
    method: 'post',
    path: '/v1/webhooks/{id}/verify',
    surface: 'v1',
    operationId: 'verifyWebhook',
    owner: 'e-webhooks',
    statement: 'integrations.manage',
    idempotent: false,
    crossOrg: true,
    note: 'Verification is a POST challenge action on an existing webhook (D38).'
  },
  {
    method: 'post',
    path: '/v1/webhooks/{id}/redeliver',
    surface: 'v1',
    operationId: 'redeliverWebhook',
    owner: 'e-webhooks',
    statement: 'integrations.manage',
    idempotent: false,
    crossOrg: true,
    note: 'Redelivery retries the newest matching delivery (D38), rather than creating an event.'
  },
  {
    method: 'get',
    path: '/v1/webhooks/{id}/deliveries',
    surface: 'v1',
    operationId: 'listWebhookDeliveries',
    owner: 'e-webhooks',
    statement: 'integrations.manage',
    idempotent: false,
    crossOrg: true
  },
  // Organisation reads and events
  {
    method: 'get',
    path: '/v1/dashboard',
    surface: 'v1',
    operationId: 'getDashboard',
    owner: 'd-org-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/bundles',
    surface: 'v1',
    operationId: 'listOrganisationBundles',
    owner: 'd-org-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/listings',
    surface: 'v1',
    operationId: 'listOrganisationListings',
    owner: 'd-org-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/search',
    surface: 'v1',
    operationId: 'searchOrganisation',
    owner: 'd-org-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/events/stream',
    surface: 'v1',
    operationId: 'streamOrganisationEvents',
    owner: 'd-org-api',
    statement: 'project.view',
    idempotent: false,
    stream: true,
    crossOrg: true
  },
  // Commons budgets
  {
    method: 'get',
    path: '/v1/commons/budget',
    surface: 'v1',
    operationId: 'getCommonsBudget',
    owner: 'd-guest-rules',
    statement: 'guest',
    idempotent: false,
    crossOrg: true
  },
  // Usage and clause sandbox
  {
    method: 'get',
    path: '/v1/usage',
    surface: 'v1',
    operationId: 'getUsage',
    owner: 'e-byok-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'post',
    path: '/v1/sandbox/evaluate',
    surface: 'v1',
    operationId: 'evaluateSandbox',
    owner: 'e-console-api',
    statement: 'project.view',
    idempotent: false,
    crossOrg: true
  },
  // Public project and service reads
  {
    method: 'get',
    path: '/v1/public/{org}/{project}/status',
    surface: 'v1',
    operationId: 'getPublicProjectStatus',
    owner: 'd-public-api',
    statement: 'public',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/public/{org}/{project}/calls',
    surface: 'v1',
    operationId: 'listPublicProjectCalls',
    owner: 'd-public-api',
    statement: 'public',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/public/{org}/{project}/ledger',
    surface: 'v1',
    operationId: 'listPublicLedgerEntries',
    owner: 'd-public-api',
    statement: 'public',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/public/{org}/{project}/grades',
    surface: 'v1',
    operationId: 'listPublicGrades',
    owner: 'd-public-api',
    statement: 'public',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/public/{org}/{project}/calendar-entries',
    surface: 'v1',
    operationId: 'listPublicCalendarEntries',
    owner: 'd-public-api',
    statement: 'public',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/public/calls/{callId}',
    surface: 'v1',
    operationId: 'getPublicCall',
    owner: 'd-public-api',
    statement: 'public',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/public/windows/{id}',
    surface: 'v1',
    operationId: 'getPublicWindow',
    owner: 'd-public-api',
    statement: 'public',
    idempotent: false,
    crossOrg: true
  },
  {
    method: 'get',
    path: '/v1/public/status',
    surface: 'v1',
    operationId: 'getPublicServiceStatus',
    owner: 'd-public-api',
    statement: 'public',
    idempotent: false,
    crossOrg: false
  },
  {
    method: 'get',
    path: '/v1/public/{org}/{project}/stream',
    surface: 'v1',
    operationId: 'streamPublicProjectState',
    owner: 'd-org-api',
    statement: 'public',
    idempotent: false,
    stream: true,
    crossOrg: true
  },
  {
    method: 'post',
    path: '/v1/public/{org}/{project}/evaluate',
    surface: 'v1',
    operationId: 'evaluatePublicProject',
    owner: 'd-commons',
    statement: 'public',
    idempotent: false,
    crossOrg: true
  },
  // Organisations and memberships
  {
    method: 'post',
    path: '/api/orgs',
    surface: 'api',
    operationId: 'createOrganisation',
    owner: 'a-org-projects',
    statement: 'session',
    idempotent: true,
    crossOrg: false,
    note: 'Use session for organisation creation and membership discovery; D36 lets anyone create an organisation.'
  },
  {
    method: 'get',
    path: '/api/me/memberships',
    surface: 'api',
    operationId: 'listMyMemberships',
    owner: 'a-org-projects',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Use session for organisation creation and membership discovery; D36 lets anyone create an organisation.'
  },
  {
    method: 'patch',
    path: '/api/orgs/{org}',
    surface: 'api',
    operationId: 'updateOrganisation',
    owner: 'a-org-projects',
    statement: 'org.manage',
    idempotent: false,
    crossOrg: false
  },
  // Account preferences and security
  {
    method: 'get',
    path: '/api/me/preferences',
    surface: 'api',
    operationId: 'getMyPreferences',
    owner: 'a-account-settings',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Preferences use GET to load and PATCH to edit.'
  },
  {
    method: 'patch',
    path: '/api/me/preferences',
    surface: 'api',
    operationId: 'updateMyPreferences',
    owner: 'a-account-settings',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Preferences use GET to load and PATCH to edit.'
  },
  {
    method: 'patch',
    path: '/api/me/security',
    surface: 'api',
    operationId: 'updateMySecurity',
    owner: 'a-account-settings',
    statement: 'session',
    idempotent: false,
    crossOrg: false
  },
  // Members and invitations
  {
    method: 'get',
    path: '/api/orgs/{org}/members',
    surface: 'api',
    operationId: 'listMembers',
    owner: 'a-members-api',
    statement: 'members.manage',
    idempotent: false,
    crossOrg: false,
    note: 'Members use collection GET and item PATCH/DELETE for role changes and removal (ORG-3).'
  },
  {
    method: 'patch',
    path: '/api/orgs/{org}/members/{id}',
    surface: 'api',
    operationId: 'updateMember',
    owner: 'a-members-api',
    statement: 'members.manage',
    idempotent: false,
    crossOrg: false,
    note: 'Members use collection GET and item PATCH/DELETE for role changes and removal (ORG-3).'
  },
  {
    method: 'delete',
    path: '/api/orgs/{org}/members/{id}',
    surface: 'api',
    operationId: 'removeMember',
    owner: 'a-members-api',
    statement: 'members.manage',
    idempotent: false,
    crossOrg: false,
    note: 'Members use collection GET and item PATCH/DELETE for role changes and removal (ORG-3).'
  },
  {
    method: 'get',
    path: '/api/orgs/{org}/invitations',
    surface: 'api',
    operationId: 'listInvitations',
    owner: 'a-members-api',
    statement: 'members.manage',
    idempotent: false,
    crossOrg: false,
    note: 'Invitations use collection GET/POST, item DELETE and POST resend (ORG-2).'
  },
  {
    method: 'post',
    path: '/api/orgs/{org}/invitations',
    surface: 'api',
    operationId: 'createInvitation',
    owner: 'a-members-api',
    statement: 'members.manage',
    idempotent: true,
    crossOrg: false,
    note: 'Invitations use collection GET/POST, item DELETE and POST resend (ORG-2).'
  },
  {
    method: 'delete',
    path: '/api/orgs/{org}/invitations/{id}',
    surface: 'api',
    operationId: 'revokeInvitation',
    owner: 'a-members-api',
    statement: 'members.manage',
    idempotent: false,
    crossOrg: false,
    note: 'Invitations use collection GET/POST, item DELETE and POST resend (ORG-2).'
  },
  {
    method: 'post',
    path: '/api/orgs/{org}/invitations/{id}/resend',
    surface: 'api',
    operationId: 'resendInvitation',
    owner: 'a-members-api',
    statement: 'members.manage',
    idempotent: false,
    crossOrg: false,
    note: 'Invitations use collection GET/POST, item DELETE and POST resend (ORG-2).'
  },
  {
    method: 'post',
    path: '/api/invite/{token}',
    surface: 'api',
    operationId: 'acceptInvitation',
    owner: 'a-members-api',
    statement: 'token',
    idempotent: false,
    crossOrg: false,
    note: 'Token acceptance uses POST at the IA invite path; the accepting session need not already be a member.'
  },
  {
    method: 'get',
    path: '/api/invite/{token}',
    surface: 'api',
    operationId: 'inspectMemberToken',
    owner: 'a-members-api',
    statement: 'token',
    idempotent: false,
    crossOrg: false,
    note: 'The invite page can inspect token kind and state before the accepting person signs in.'
  },
  // Ownership transfers
  {
    method: 'post',
    path: '/api/orgs/{org}/ownership-transfers',
    surface: 'api',
    operationId: 'createOwnershipTransfer',
    owner: 'a-members-api',
    statement: 'members.manage',
    idempotent: true,
    crossOrg: false,
    note: 'POST creates the pending transfer; acceptance is a separate token action (ORG-3).'
  },
  {
    method: 'delete',
    path: '/api/orgs/{org}/ownership-transfers/{id}',
    surface: 'api',
    operationId: 'cancelOwnershipTransfer',
    owner: 'a-members-api',
    statement: 'members.manage',
    idempotent: false,
    crossOrg: false,
    note: 'Only the Owner may cancel the organisation’s pending transfer.'
  },
  {
    method: 'post',
    path: '/api/ownership-transfers/{token}/accept',
    surface: 'api',
    operationId: 'acceptOwnershipTransfer',
    owner: 'a-members-api',
    statement: 'token',
    idempotent: false,
    crossOrg: false,
    note: 'Use POST /ownership-transfers/{token}/accept for the unspecified token accept; bind it to the accepting session.'
  },
  // Rota and shifts
  {
    method: 'get',
    path: '/api/orgs/{org}/rota',
    surface: 'api',
    operationId: 'getRota',
    owner: 'a-members-api',
    statement: 'rota.manage',
    idempotent: false,
    crossOrg: false,
    note: 'Rota GET includes shifts and templates; PATCH edits settings; shift POST/PATCH/DELETE manages individual shifts (ORG-4).'
  },
  {
    method: 'patch',
    path: '/api/orgs/{org}/rota',
    surface: 'api',
    operationId: 'updateRota',
    owner: 'a-members-api',
    statement: 'rota.manage',
    idempotent: false,
    crossOrg: false,
    note: 'Rota GET includes shifts and templates; PATCH edits settings; shift POST/PATCH/DELETE manages individual shifts (ORG-4).'
  },
  {
    method: 'put',
    path: '/api/orgs/{org}/rota/shifts',
    surface: 'api',
    operationId: 'replaceRotaShifts',
    owner: 'a-members-api',
    statement: 'rota.manage',
    idempotent: true,
    crossOrg: false,
    note: 'Replace shifts and code-defined templates for the organisation or one project scope.'
  },
  {
    method: 'post',
    path: '/api/orgs/{org}/rota/shifts',
    surface: 'api',
    operationId: 'createRotaShift',
    owner: 'a-members-api',
    statement: 'rota.manage',
    idempotent: true,
    crossOrg: false,
    note: 'Rota GET includes shifts and templates; PATCH edits settings; shift POST/PATCH/DELETE manages individual shifts (ORG-4).'
  },
  {
    method: 'patch',
    path: '/api/orgs/{org}/rota/shifts/{id}',
    surface: 'api',
    operationId: 'updateRotaShift',
    owner: 'a-members-api',
    statement: 'rota.manage',
    idempotent: false,
    crossOrg: false,
    note: 'Rota GET includes shifts and templates; PATCH edits settings; shift POST/PATCH/DELETE manages individual shifts (ORG-4).'
  },
  {
    method: 'delete',
    path: '/api/orgs/{org}/rota/shifts/{id}',
    surface: 'api',
    operationId: 'deleteRotaShift',
    owner: 'a-members-api',
    statement: 'rota.manage',
    idempotent: false,
    crossOrg: false,
    note: 'Rota GET includes shifts and templates; PATCH edits settings; shift POST/PATCH/DELETE manages individual shifts (ORG-4).'
  },
  // Audit log
  {
    method: 'get',
    path: '/api/orgs/{org}/audit',
    surface: 'api',
    operationId: 'listAuditEntries',
    owner: 'a-audit-log',
    statement: 'audit.view',
    idempotent: false,
    crossOrg: false
  },
  {
    method: 'get',
    path: '/api/orgs/{org}/audit/export',
    surface: 'api',
    operationId: 'exportAuditLog',
    owner: 'a-audit-log',
    statement: 'audit.view',
    idempotent: false,
    crossOrg: false
  },
  // API keys
  {
    method: 'get',
    path: '/api/orgs/{org}/api-keys',
    surface: 'api',
    operationId: 'listOrganisationApiKeys',
    owner: 'a-api-keys',
    statement: 'api_key.create',
    idempotent: false,
    crossOrg: false,
    note: 'API keys use collection GET/POST and item DELETE for listing, creation and immediate revocation (SET-6).'
  },
  {
    method: 'post',
    path: '/api/orgs/{org}/api-keys',
    surface: 'api',
    operationId: 'createOrganisationApiKey',
    owner: 'a-api-keys',
    statement: 'api_key.create',
    idempotent: true,
    crossOrg: false,
    note: 'API keys use collection GET/POST and item DELETE for listing, creation and immediate revocation (SET-6).'
  },
  {
    method: 'delete',
    path: '/api/orgs/{org}/api-keys/{id}',
    surface: 'api',
    operationId: 'revokeOrganisationApiKey',
    owner: 'a-api-keys',
    statement: 'api_key.create',
    idempotent: false,
    crossOrg: false,
    note: 'API keys use collection GET/POST and item DELETE for listing, creation and immediate revocation (SET-6).'
  },
  {
    method: 'get',
    path: '/api/me/api-keys',
    surface: 'api',
    operationId: 'listMyApiKeys',
    owner: 'a-api-keys',
    statement: 'api_key.create',
    idempotent: false,
    crossOrg: false,
    note: 'API keys use collection GET/POST and item DELETE for listing, creation and immediate revocation (SET-6).'
  },
  {
    method: 'post',
    path: '/api/me/api-keys',
    surface: 'api',
    operationId: 'createMyApiKey',
    owner: 'a-api-keys',
    statement: 'api_key.create',
    idempotent: true,
    crossOrg: false,
    note: 'API keys use collection GET/POST and item DELETE for listing, creation and immediate revocation (SET-6).'
  },
  {
    method: 'delete',
    path: '/api/me/api-keys/{id}',
    surface: 'api',
    operationId: 'revokeMyApiKey',
    owner: 'a-api-keys',
    statement: 'api_key.create',
    idempotent: false,
    crossOrg: false,
    note: 'API keys use collection GET/POST and item DELETE for listing, creation and immediate revocation (SET-6).'
  },
  // AI keys and model settings
  {
    method: 'get',
    path: '/api/orgs/{org}/ai-keys',
    surface: 'api',
    operationId: 'listOrganisationAiKeys',
    owner: 'e-byok-api',
    statement: 'ai_keys.manage',
    idempotent: false,
    crossOrg: false,
    note: 'AI keys use collection GET/POST, item DELETE, POST test and GET usage; saved secrets remain write-only (SET-5).'
  },
  {
    method: 'post',
    path: '/api/orgs/{org}/ai-keys',
    surface: 'api',
    operationId: 'createOrganisationAiKey',
    owner: 'e-byok-api',
    statement: 'ai_keys.manage',
    idempotent: true,
    crossOrg: false,
    note: 'AI keys use collection GET/POST, item DELETE, POST test and GET usage; saved secrets remain write-only (SET-5).'
  },
  {
    method: 'patch',
    path: '/api/orgs/{org}/ai-keys/{id}',
    surface: 'api',
    operationId: 'updateOrganisationAiKey',
    owner: 'e-byok-api',
    statement: 'ai_keys.manage',
    idempotent: false,
    crossOrg: false,
    note: 'AI keys use collection GET/POST, item PATCH/DELETE, POST test and GET usage; saved secrets remain write-only (SET-5).'
  },
  {
    method: 'delete',
    path: '/api/orgs/{org}/ai-keys/{id}',
    surface: 'api',
    operationId: 'deleteOrganisationAiKey',
    owner: 'e-byok-api',
    statement: 'ai_keys.manage',
    idempotent: false,
    crossOrg: false,
    note: 'AI keys use collection GET/POST, item DELETE, POST test and GET usage; saved secrets remain write-only (SET-5).'
  },
  {
    method: 'post',
    path: '/api/orgs/{org}/ai-keys/{id}/test',
    surface: 'api',
    operationId: 'testOrganisationAiKey',
    owner: 'e-byok-api',
    statement: 'ai_keys.manage',
    idempotent: false,
    crossOrg: false,
    note: 'AI keys use collection GET/POST, item DELETE, POST test and GET usage; saved secrets remain write-only (SET-5).'
  },
  {
    method: 'get',
    path: '/api/orgs/{org}/ai-keys/usage',
    surface: 'api',
    operationId: 'getOrganisationAiKeyUsage',
    owner: 'e-byok-api',
    statement: 'ai_keys.manage',
    idempotent: false,
    crossOrg: false,
    note: 'AI keys use collection GET/POST, item DELETE, POST test and GET usage; saved secrets remain write-only (SET-5).'
  },
  {
    method: 'get',
    path: '/api/orgs/{org}/settings/ai',
    surface: 'api',
    operationId: 'getOrganisationAiSettings',
    owner: 'e-byok-api',
    statement: 'ai_keys.manage',
    idempotent: false,
    crossOrg: false,
    note: 'AI settings use GET to load and PATCH to edit the model configuration.'
  },
  {
    method: 'patch',
    path: '/api/orgs/{org}/settings/ai',
    surface: 'api',
    operationId: 'updateOrganisationAiSettings',
    owner: 'e-byok-api',
    statement: 'ai_keys.manage',
    idempotent: false,
    crossOrg: false,
    note: 'AI settings use GET to load and PATCH to edit the model configuration.'
  },
  {
    method: 'get',
    path: '/api/me/ai-keys',
    surface: 'api',
    operationId: 'listMyAiKeys',
    owner: 'e-byok-api',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Personal AI keys mirror the organisation key methods; session also requires non-guest membership and allow_member_ai_keys.'
  },
  {
    method: 'post',
    path: '/api/me/ai-keys',
    surface: 'api',
    operationId: 'createMyAiKey',
    owner: 'e-byok-api',
    statement: 'session',
    idempotent: true,
    crossOrg: false,
    note: 'Personal AI keys mirror the organisation key methods; session also requires non-guest membership and allow_member_ai_keys.'
  },
  {
    method: 'delete',
    path: '/api/me/ai-keys/{id}',
    surface: 'api',
    operationId: 'deleteMyAiKey',
    owner: 'e-byok-api',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Personal AI keys mirror the organisation key methods; session also requires non-guest membership and allow_member_ai_keys.'
  },
  {
    method: 'post',
    path: '/api/me/ai-keys/{id}/test',
    surface: 'api',
    operationId: 'testMyAiKey',
    owner: 'e-byok-api',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Personal AI keys mirror the organisation key methods; session also requires non-guest membership and allow_member_ai_keys.'
  },
  {
    method: 'get',
    path: '/api/me/ai-keys/usage',
    surface: 'api',
    operationId: 'getMyAiKeyUsage',
    owner: 'e-byok-api',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Personal AI keys mirror the organisation key methods; session also requires non-guest membership and allow_member_ai_keys.'
  },
  // Data exports and deletion
  {
    method: 'get',
    path: '/api/orgs/{org}/exports',
    surface: 'api',
    operationId: 'listOrganisationExports',
    owner: 'a-data-rights',
    statement: 'org.export',
    idempotent: false,
    crossOrg: false,
    note: 'Exports use collection GET for status/history and POST to request an export; downloads use GET (AUD-3).'
  },
  {
    method: 'post',
    path: '/api/orgs/{org}/exports',
    surface: 'api',
    operationId: 'createOrganisationExport',
    owner: 'a-data-rights',
    statement: 'org.export',
    idempotent: true,
    crossOrg: false,
    note: 'Exports use collection GET for status/history and POST to request an export; downloads use GET (AUD-3).'
  },
  {
    method: 'get',
    path: '/api/orgs/{org}/deletion',
    surface: 'api',
    operationId: 'getOrganisationDeletion',
    owner: 'a-data-rights',
    statement: 'org.delete',
    idempotent: false,
    crossOrg: false,
    note: 'Organisation deletion uses GET for grace status, POST to start grace and DELETE to cancel the pending deletion (AUD-4).'
  },
  {
    method: 'post',
    path: '/api/orgs/{org}/deletion',
    surface: 'api',
    operationId: 'requestOrganisationDeletion',
    owner: 'a-data-rights',
    statement: 'org.delete',
    idempotent: false,
    crossOrg: false,
    note: 'Organisation deletion uses GET for grace status, POST to start grace and DELETE to cancel the pending deletion (AUD-4).'
  },
  {
    method: 'delete',
    path: '/api/orgs/{org}/deletion',
    surface: 'api',
    operationId: 'cancelOrganisationDeletion',
    owner: 'a-data-rights',
    statement: 'org.delete',
    idempotent: false,
    crossOrg: false,
    note: 'Organisation deletion uses GET for grace status, POST to start grace and DELETE to cancel the pending deletion (AUD-4).'
  },
  {
    method: 'get',
    path: '/api/me/exports',
    surface: 'api',
    operationId: 'listMyExports',
    owner: 'a-data-rights',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Exports use collection GET for status/history and POST to request an export; downloads use GET (AUD-3).'
  },
  {
    method: 'post',
    path: '/api/me/exports',
    surface: 'api',
    operationId: 'createMyExport',
    owner: 'a-data-rights',
    statement: 'session',
    idempotent: true,
    crossOrg: false,
    note: 'Exports use collection GET for status/history and POST to request an export; downloads use GET (AUD-3).'
  },
  {
    method: 'post',
    path: '/api/me/deletion',
    surface: 'api',
    operationId: 'deleteMyAccount',
    owner: 'a-data-rights',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Account deletion uses POST on the named deletion action; AUD-4 gives only organisations a grace period.'
  },
  {
    method: 'get',
    path: '/api/exports/{id}/download',
    surface: 'api',
    operationId: 'downloadExport',
    owner: 'a-data-rights',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Exports use collection GET for status/history and POST to request an export; downloads use GET (AUD-3).'
  },
  // Onboarding
  {
    method: 'get',
    path: '/api/orgs/{org}/onboarding',
    surface: 'api',
    operationId: 'getOnboarding',
    owner: 'b-create-project-ui',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'GET reads onboarding progress and tracks first-seen completed steps (ORG-6).'
  },
  {
    method: 'post',
    path: '/api/orgs/{org}/onboarding/{step}/skip',
    surface: 'api',
    operationId: 'skipOnboardingStep',
    owner: 'b-create-project-ui',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'POST skips a named step (ORG-6).'
  },
  {
    method: 'delete',
    path: '/api/orgs/{org}/onboarding/{step}/skip',
    surface: 'api',
    operationId: 'resumeOnboardingStep',
    owner: 'b-create-project-ui',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'DELETE resumes a skipped step (ORG-6).'
  },
  // Project administration
  {
    method: 'post',
    path: '/api/orgs/{org}/projects',
    surface: 'api',
    operationId: 'createProject',
    owner: 'b-projects-api',
    statement: 'project.manage',
    idempotent: true,
    crossOrg: false
  },
  {
    method: 'patch',
    path: '/api/projects/{id}',
    surface: 'api',
    operationId: 'updateProject',
    owner: 'b-projects-api',
    statement: 'project.manage',
    idempotent: false,
    crossOrg: false,
    note: 'project.manage is the base statement; changing public also requires public_pages.edit, as specified in the row.'
  },
  {
    method: 'post',
    path: '/api/projects/{id}/archive',
    surface: 'api',
    operationId: 'archiveProject',
    owner: 'b-projects-api',
    statement: 'project.manage',
    idempotent: false,
    crossOrg: false
  },
  {
    method: 'post',
    path: '/api/projects/{id}/restore',
    surface: 'api',
    operationId: 'restoreProject',
    owner: 'b-projects-api',
    statement: 'project.manage',
    idempotent: false,
    crossOrg: false
  },
  // Device probation
  {
    method: 'put',
    path: '/api/sources/{id}/probation',
    surface: 'api',
    operationId: 'setSourceProbation',
    owner: 'b-device-ingest',
    statement: 'sources.manage',
    idempotent: false,
    crossOrg: false
  },
  {
    method: 'get',
    path: '/api/sources/{id}/probation/next',
    surface: 'api',
    operationId: 'getNextProbationFrame',
    owner: 'b-device-ingest',
    statement: 'labeller',
    idempotent: false,
    crossOrg: false,
    note: 'Use GET next and POST labels; named labellers maps to the labeller statement.'
  },
  {
    method: 'post',
    path: '/api/sources/{id}/probation/labels',
    surface: 'api',
    operationId: 'createProbationLabel',
    owner: 'b-device-ingest',
    statement: 'labeller',
    idempotent: true,
    crossOrg: false,
    note: 'Use GET next and POST labels; named labellers maps to the labeller statement.'
  },
  // Clause publishing
  {
    method: 'get',
    path: '/api/clause-sheets/{id}/publish-preview',
    surface: 'api',
    operationId: 'getClauseSheetPublishPreview',
    owner: 'b-clause-sheets-api',
    statement: 'clause_sheet.publish',
    idempotent: false,
    crossOrg: false
  },
  {
    method: 'post',
    path: '/api/clause-sheets/{id}/publish',
    surface: 'api',
    operationId: 'publishClauseSheet',
    owner: 'b-clause-sheets-api',
    statement: 'clause_sheet.publish',
    idempotent: true,
    crossOrg: false,
    note: 'Publishing creates an immutable numbered version (CLS-7), so it requires Idempotency-Key.'
  },
  // Share links
  {
    method: 'get',
    path: '/api/projects/{id}/share-links',
    surface: 'api',
    operationId: 'listShareLinks',
    owner: 'b-share-links',
    statement: 'share_link.create',
    idempotent: false,
    crossOrg: false,
    note: 'Share links use collection GET/POST and POST on the named revoke action (PRJ-5).'
  },
  {
    method: 'post',
    path: '/api/projects/{id}/share-links',
    surface: 'api',
    operationId: 'createShareLink',
    owner: 'b-share-links',
    statement: 'share_link.create',
    idempotent: true,
    crossOrg: false,
    note: 'Share links use collection GET/POST and POST on the named revoke action (PRJ-5).'
  },
  {
    method: 'post',
    path: '/api/share-links/{id}/revoke',
    surface: 'api',
    operationId: 'revokeShareLink',
    owner: 'b-share-links',
    statement: 'share_link.create',
    idempotent: false,
    crossOrg: false,
    note: 'Share links use collection GET/POST and POST on the named revoke action (PRJ-5).'
  },
  {
    method: 'post',
    path: '/api/share/{token}',
    surface: 'api',
    operationId: 'openShareLink',
    owner: 'b-share-links',
    statement: 'token',
    idempotent: false,
    crossOrg: false
  },
  // Listing decisions and call navigation
  {
    method: 'post',
    path: '/api/listings/{id}/decide',
    surface: 'api',
    operationId: 'decideListing',
    owner: 'b-listings',
    statement: 'listing.decide',
    idempotent: false,
    crossOrg: false
  },
  {
    method: 'get',
    path: '/api/calls/{id}/open',
    surface: 'api',
    operationId: 'openCall',
    owner: 'c-call-page-ui',
    statement: 'session',
    idempotent: false,
    crossOrg: false
  },
  // Bundle and evidence approvals
  {
    method: 'post',
    path: '/api/bundles/{id}/approve',
    surface: 'api',
    operationId: 'approveBundle',
    owner: 'c-approval-api',
    statement: 'bundle.approve',
    idempotent: false,
    crossOrg: false
  },
  {
    method: 'post',
    path: '/api/evidence-requests/{id}/approve',
    surface: 'api',
    operationId: 'approveEvidenceRequest',
    owner: 'c-evidence',
    statement: 'bundle.approve',
    idempotent: false,
    crossOrg: false
  },
  // Push subscriptions
  {
    method: 'get',
    path: '/api/push-subscriptions',
    surface: 'api',
    operationId: 'listPushSubscriptions',
    owner: 'c-approver-alerts',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Push subscriptions use collection GET/POST and item DELETE; the VAPID public key uses GET.'
  },
  {
    method: 'post',
    path: '/api/push-subscriptions',
    surface: 'api',
    operationId: 'createPushSubscription',
    owner: 'c-approver-alerts',
    statement: 'session',
    idempotent: true,
    crossOrg: false,
    note: 'Push subscriptions use collection GET/POST and item DELETE; the VAPID public key uses GET.'
  },
  {
    method: 'delete',
    path: '/api/push-subscriptions/{id}',
    surface: 'api',
    operationId: 'deletePushSubscription',
    owner: 'c-approver-alerts',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Push subscriptions use collection GET/POST and item DELETE; the VAPID public key uses GET.'
  },
  {
    method: 'get',
    path: '/api/push/vapid-public-key',
    surface: 'api',
    operationId: 'getVapidPublicKey',
    owner: 'c-approver-alerts',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Push subscriptions use collection GET/POST and item DELETE; the VAPID public key uses GET.'
  },
  // Notifications
  {
    method: 'get',
    path: '/api/notifications',
    surface: 'api',
    operationId: 'listNotifications',
    owner: 'c-notifications',
    statement: 'session',
    idempotent: false,
    crossOrg: false
  },
  {
    method: 'get',
    path: '/api/notifications/stream',
    surface: 'api',
    operationId: 'streamNotifications',
    owner: 'c-notifications',
    statement: 'session',
    idempotent: false,
    stream: true,
    crossOrg: false
  },
  {
    method: 'post',
    path: '/api/notifications/{id}/read',
    surface: 'api',
    operationId: 'markNotificationRead',
    owner: 'c-notifications',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Use POST for the named read action; notification preferences use GET/PATCH.'
  },
  {
    method: 'get',
    path: '/api/me/notification-preferences',
    surface: 'api',
    operationId: 'getMyNotificationPreferences',
    owner: 'c-notifications',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Use POST for the named read action; notification preferences use GET/PATCH.'
  },
  {
    method: 'patch',
    path: '/api/me/notification-preferences',
    surface: 'api',
    operationId: 'updateMyNotificationPreferences',
    owner: 'c-notifications',
    statement: 'session',
    idempotent: false,
    crossOrg: false,
    note: 'Use POST for the named read action; notification preferences use GET/PATCH.'
  },
  // Subscriber token actions
  {
    method: 'get',
    path: '/api/subscribe/{token}',
    surface: 'api',
    operationId: 'getSubscription',
    owner: 'c-subscribers',
    statement: 'token',
    idempotent: false,
    crossOrg: false,
    note: 'The token root uses GET for preferences, POST to join and PATCH to edit; confirm/unsubscribe are POST actions (NTC-8, NTC-14, D25).'
  },
  {
    method: 'post',
    path: '/api/subscribe/{token}',
    surface: 'api',
    operationId: 'createSubscription',
    owner: 'c-subscribers',
    statement: 'token',
    idempotent: true,
    crossOrg: false,
    note: 'The token root uses GET for preferences, POST to join and PATCH to edit; confirm/unsubscribe are POST actions (NTC-8, NTC-14, D25).'
  },
  {
    method: 'patch',
    path: '/api/subscribe/{token}',
    surface: 'api',
    operationId: 'updateSubscription',
    owner: 'c-subscribers',
    statement: 'token',
    idempotent: false,
    crossOrg: false,
    note: 'The token root uses GET for preferences, POST to join and PATCH to edit; confirm/unsubscribe are POST actions (NTC-8, NTC-14, D25).'
  },
  {
    method: 'post',
    path: '/api/subscribe/{token}/confirm',
    surface: 'api',
    operationId: 'confirmSubscription',
    owner: 'c-subscribers',
    statement: 'token',
    idempotent: false,
    crossOrg: false,
    note: 'The token root uses GET for preferences, POST to join and PATCH to edit; confirm/unsubscribe are POST actions (NTC-8, NTC-14, D25).'
  },
  {
    method: 'post',
    path: '/api/subscribe/{token}/unsubscribe',
    surface: 'api',
    operationId: 'unsubscribeSubscription',
    owner: 'c-subscribers',
    statement: 'token',
    idempotent: false,
    crossOrg: false,
    note: 'The token root uses GET for preferences, POST to join and PATCH to edit; confirm/unsubscribe are POST actions (NTC-8, NTC-14, D25).'
  },
  {
    method: 'post',
    path: '/api/subscribe/{token}/reply',
    surface: 'api',
    operationId: 'createSubscriberReply',
    owner: 'c-recipient-replies',
    statement: 'token',
    idempotent: true,
    crossOrg: false,
    note: 'Reply and feedback use POST on the subscribe token; each records a response (CAL-17, ANL-7, D25).'
  },
  {
    method: 'post',
    path: '/api/subscribe/{token}/feedback',
    surface: 'api',
    operationId: 'createSubscriberFeedback',
    owner: 'c-recipient-replies',
    statement: 'token',
    idempotent: true,
    crossOrg: false,
    note: 'Reply and feedback use POST on the subscribe token; each records a response (CAL-17, ANL-7, D25).'
  },
  {
    method: 'get',
    path: '/api/subscribe/{token}/data',
    surface: 'api',
    operationId: 'getSubscriberData',
    owner: 'a-subscriber-rights',
    statement: 'token',
    idempotent: false,
    crossOrg: false,
    note: 'Subscriber data uses GET/PATCH/DELETE for access, correction and erasure; GET export returns the data directly (AUD-6).'
  },
  {
    method: 'patch',
    path: '/api/subscribe/{token}/data',
    surface: 'api',
    operationId: 'updateSubscriberData',
    owner: 'a-subscriber-rights',
    statement: 'token',
    idempotent: false,
    crossOrg: false,
    note: 'Subscriber data uses GET/PATCH/DELETE for access, correction and erasure; GET export returns the data directly (AUD-6).'
  },
  {
    method: 'delete',
    path: '/api/subscribe/{token}/data',
    surface: 'api',
    operationId: 'eraseSubscriberData',
    owner: 'a-subscriber-rights',
    statement: 'token',
    idempotent: false,
    crossOrg: false,
    note: 'Subscriber data uses GET/PATCH/DELETE for access, correction and erasure; GET export returns the data directly (AUD-6).'
  },
  {
    method: 'get',
    path: '/api/subscribe/{token}/data/export',
    surface: 'api',
    operationId: 'exportSubscriberData',
    owner: 'a-subscriber-rights',
    statement: 'token',
    idempotent: false,
    crossOrg: false,
    note: 'Subscriber data uses GET/PATCH/DELETE for access, correction and erasure; GET export returns the data directly (AUD-6).'
  },
  // Guest entry and developer tokens
  {
    method: 'post',
    path: '/api/guest',
    surface: 'api',
    operationId: 'createGuest',
    owner: 'd-guest-entry',
    statement: 'public',
    idempotent: true,
    crossOrg: false,
    note: 'Turnstile is a bot check, not a statement; guest entry uses public before the anonymous session exists.'
  },
  {
    method: 'post',
    path: '/api/developers/guest-token',
    surface: 'api',
    operationId: 'createDeveloperGuestToken',
    owner: 'e-console-api',
    statement: 'guest',
    idempotent: true,
    crossOrg: false
  },
  // Staff moderation
  {
    method: 'get',
    path: '/api/admin/moderation/reports',
    surface: 'api',
    operationId: 'listModerationReports',
    owner: 'd-guest-lifecycle',
    statement: 'staff',
    idempotent: false,
    crossOrg: false,
    note: 'Expand moderation/* to GET reports, POST windows/{id}/decide (restore/remove), and POST blocks (device/IP), covering GST-9.'
  },
  {
    method: 'post',
    path: '/api/admin/moderation/windows/{id}/decide',
    surface: 'api',
    operationId: 'decideModerationWindow',
    owner: 'd-guest-lifecycle',
    statement: 'staff',
    idempotent: false,
    crossOrg: false,
    note: 'Expand moderation/* to GET reports, POST windows/{id}/decide (restore/remove), and POST blocks (device/IP), covering GST-9.'
  },
  {
    method: 'post',
    path: '/api/admin/moderation/blocks',
    surface: 'api',
    operationId: 'createModerationBlock',
    owner: 'd-guest-lifecycle',
    statement: 'staff',
    idempotent: true,
    crossOrg: false,
    note: 'Expand moderation/* to GET reports, POST windows/{id}/decide (restore/remove), and POST blocks (device/IP), covering GST-9.'
  },
  // Staff incidents
  {
    method: 'get',
    path: '/api/admin/incidents',
    surface: 'api',
    operationId: 'listIncidents',
    owner: 'd-public-api',
    statement: 'staff',
    idempotent: false,
    crossOrg: false,
    note: 'Expand incidents/* to collection GET/POST and item PATCH; PATCH records updates or resolution (PUB-6).'
  },
  {
    method: 'post',
    path: '/api/admin/incidents',
    surface: 'api',
    operationId: 'createIncident',
    owner: 'd-public-api',
    statement: 'staff',
    idempotent: true,
    crossOrg: false,
    note: 'Expand incidents/* to collection GET/POST and item PATCH; PATCH records updates or resolution (PUB-6).'
  },
  {
    method: 'patch',
    path: '/api/admin/incidents/{id}',
    surface: 'api',
    operationId: 'updateIncident',
    owner: 'd-public-api',
    statement: 'staff',
    idempotent: false,
    crossOrg: false,
    note: 'Expand incidents/* to collection GET/POST and item PATCH; PATCH records updates or resolution (PUB-6).'
  },
  // OAuth clients and grants
  {
    method: 'get',
    path: '/api/orgs/{org}/oauth-clients',
    surface: 'api',
    operationId: 'listOauthClients',
    owner: 'e-mcp-auth',
    statement: 'integrations.manage',
    idempotent: false,
    crossOrg: false,
    note: 'OAuth clients use collection GET/POST and item DELETE; grants use GET and item DELETE because consent creates grants under auth/* (D37).'
  },
  {
    method: 'post',
    path: '/api/orgs/{org}/oauth-clients',
    surface: 'api',
    operationId: 'createOauthClient',
    owner: 'e-mcp-auth',
    statement: 'integrations.manage',
    idempotent: true,
    crossOrg: false,
    note: 'OAuth clients use collection GET/POST and item DELETE; grants use GET and item DELETE because consent creates grants under auth/* (D37).'
  },
  {
    method: 'delete',
    path: '/api/orgs/{org}/oauth-clients/{id}',
    surface: 'api',
    operationId: 'deleteOauthClient',
    owner: 'e-mcp-auth',
    statement: 'integrations.manage',
    idempotent: false,
    crossOrg: false,
    note: 'OAuth clients use collection GET/POST and item DELETE; grants use GET and item DELETE because consent creates grants under auth/* (D37).'
  },
  {
    method: 'get',
    path: '/api/orgs/{org}/oauth-grants',
    surface: 'api',
    operationId: 'listOauthGrants',
    owner: 'e-mcp-auth',
    statement: 'integrations.manage',
    idempotent: false,
    crossOrg: false,
    note: 'OAuth clients use collection GET/POST and item DELETE; grants use GET and item DELETE because consent creates grants under auth/* (D37).'
  },
  {
    method: 'delete',
    path: '/api/orgs/{org}/oauth-grants/{id}',
    surface: 'api',
    operationId: 'revokeOauthGrant',
    owner: 'e-mcp-auth',
    statement: 'integrations.manage',
    idempotent: false,
    crossOrg: false,
    note: 'OAuth clients use collection GET/POST and item DELETE; grants use GET and item DELETE because consent creates grants under auth/* (D37).'
  },
  // AI connection information
  {
    method: 'get',
    path: '/api/connect/config',
    surface: 'api',
    operationId: 'getConnectConfig',
    owner: 'e-connect-api',
    statement: 'session',
    idempotent: false,
    crossOrg: false
  },
  {
    method: 'get',
    path: '/api/connect/verifications',
    surface: 'api',
    operationId: 'listConnectVerifications',
    owner: 'e-connect-api',
    statement: 'session',
    idempotent: false,
    crossOrg: false
  },
  {
    method: 'get',
    path: '/api/connect/activity',
    surface: 'api',
    operationId: 'listConnectActivity',
    owner: 'e-connect-api',
    statement: 'session',
    idempotent: false,
    crossOrg: false
  }
]

import document from './openapi.json' with { type: 'json' }
import schema_getProjectAnalysis from './schemas/getProjectAnalysis.json' with { type: 'json' }
import schema_getOrganisationAnalysis from './schemas/getOrganisationAnalysis.json' with { type: 'json' }
import schema_evaluateWhatIf from './schemas/evaluateWhatIf.json' with { type: 'json' }
import schema_listProjectBundles from './schemas/listProjectBundles.json' with { type: 'json' }
import schema_streamBundles from './schemas/streamBundles.json' with { type: 'json' }
import schema_getBundle from './schemas/getBundle.json' with { type: 'json' }
import schema_listOrganisationBundles from './schemas/listOrganisationBundles.json' with { type: 'json' }
import schema_listProjectCalls from './schemas/listProjectCalls.json' with { type: 'json' }
import schema_getCall from './schemas/getCall.json' with { type: 'json' }
import schema_getCallExplanation from './schemas/getCallExplanation.json' with { type: 'json' }
import schema_listCatalogueSources from './schemas/listCatalogueSources.json' with { type: 'json' }
import schema_listChannels from './schemas/listChannels.json' with { type: 'json' }
import schema_previewChannels from './schemas/previewChannels.json' with { type: 'json' }
import schema_updateChannel from './schemas/updateChannel.json' with { type: 'json' }
import schema_listClauseSheets from './schemas/listClauseSheets.json' with { type: 'json' }
import schema_listClauseSheetVersions from './schemas/listClauseSheetVersions.json' with { type: 'json' }
import schema_getClauseSheetVersion from './schemas/getClauseSheetVersion.json' with { type: 'json' }
import schema_getClauseSheetDiff from './schemas/getClauseSheetDiff.json' with { type: 'json' }
import schema_evaluateClauseSheet from './schemas/evaluateClauseSheet.json' with { type: 'json' }
import schema_listClauseSheetDrafts from './schemas/listClauseSheetDrafts.json' with { type: 'json' }
import schema_createClauseSheetDraft from './schemas/createClauseSheetDraft.json' with { type: 'json' }
import schema_getClauseSheetDraft from './schemas/getClauseSheetDraft.json' with { type: 'json' }
import schema_deleteClauseSheetDraft from './schemas/deleteClauseSheetDraft.json' with { type: 'json' }
import schema_createReplay from './schemas/createReplay.json' with { type: 'json' }
import schema_getCommonsBudget from './schemas/getCommonsBudget.json' with { type: 'json' }
import schema_getDashboard from './schemas/getDashboard.json' with { type: 'json' }
import schema_listProjectDays from './schemas/listProjectDays.json' with { type: 'json' }
import schema_createDevice from './schemas/createDevice.json' with { type: 'json' }
import schema_streamOrganisationEvents from './schemas/streamOrganisationEvents.json' with { type: 'json' }
import schema_listEvidenceRequests from './schemas/listEvidenceRequests.json' with { type: 'json' }
import schema_createEvidenceRequest from './schemas/createEvidenceRequest.json' with { type: 'json' }
import schema_getEvidenceRequest from './schemas/getEvidenceRequest.json' with { type: 'json' }
import schema_listGrades from './schemas/listGrades.json' with { type: 'json' }
import schema_listIcsFeeds from './schemas/listIcsFeeds.json' with { type: 'json' }
import schema_createIcsFeed from './schemas/createIcsFeed.json' with { type: 'json' }
import schema_getIcsFeed from './schemas/getIcsFeed.json' with { type: 'json' }
import schema_deleteIcsFeed from './schemas/deleteIcsFeed.json' with { type: 'json' }
import schema_getProjectIndicators from './schemas/getProjectIndicators.json' with { type: 'json' }
import schema_ingestReadings from './schemas/ingestReadings.json' with { type: 'json' }
import schema_listLedgerEntries from './schemas/listLedgerEntries.json' with { type: 'json' }
import schema_exportLedger from './schemas/exportLedger.json' with { type: 'json' }
import schema_verifyLedger from './schemas/verifyLedger.json' with { type: 'json' }
import schema_listProjectListings from './schemas/listProjectListings.json' with { type: 'json' }
import schema_proposeListing from './schemas/proposeListing.json' with { type: 'json' }
import schema_listOrganisationListings from './schemas/listOrganisationListings.json' with { type: 'json' }
import schema_getMe from './schemas/getMe.json' with { type: 'json' }
import schema_listNights from './schemas/listNights.json' with { type: 'json' }
import schema_getNight from './schemas/getNight.json' with { type: 'json' }
import schema_updateProjectPack from './schemas/updateProjectPack.json' with { type: 'json' }
import schema_getPilotArchive from './schemas/getPilotArchive.json' with { type: 'json' }
import schema_listProjects from './schemas/listProjects.json' with { type: 'json' }
import schema_getProject from './schemas/getProject.json' with { type: 'json' }
import schema_getPublicProjectStatus from './schemas/getPublicProjectStatus.json' with { type: 'json' }
import schema_listPublicProjectCalls from './schemas/listPublicProjectCalls.json' with { type: 'json' }
import schema_listPublicLedgerEntries from './schemas/listPublicLedgerEntries.json' with { type: 'json' }
import schema_listPublicGrades from './schemas/listPublicGrades.json' with { type: 'json' }
import schema_listPublicCalendarEntries from './schemas/listPublicCalendarEntries.json' with { type: 'json' }
import schema_getPublicCall from './schemas/getPublicCall.json' with { type: 'json' }
import schema_getPublicWindow from './schemas/getPublicWindow.json' with { type: 'json' }
import schema_getPublicServiceStatus from './schemas/getPublicServiceStatus.json' with { type: 'json' }
import schema_streamPublicProjectState from './schemas/streamPublicProjectState.json' with { type: 'json' }
import schema_evaluatePublicProject from './schemas/evaluatePublicProject.json' with { type: 'json' }
import schema_streamReadings from './schemas/streamReadings.json' with { type: 'json' }
import schema_getReplay from './schemas/getReplay.json' with { type: 'json' }
import schema_listReviewItems from './schemas/listReviewItems.json' with { type: 'json' }
import schema_updateReviewItem from './schemas/updateReviewItem.json' with { type: 'json' }
import schema_listRuns from './schemas/listRuns.json' with { type: 'json' }
import schema_createRun from './schemas/createRun.json' with { type: 'json' }
import schema_getRun from './schemas/getRun.json' with { type: 'json' }
import schema_evaluateSandbox from './schemas/evaluateSandbox.json' with { type: 'json' }
import schema_searchOrganisation from './schemas/searchOrganisation.json' with { type: 'json' }
import schema_bindSource from './schemas/bindSource.json' with { type: 'json' }
import schema_listProjectSources from './schemas/listProjectSources.json' with { type: 'json' }
import schema_unbindSource from './schemas/unbindSource.json' with { type: 'json' }
import schema_rotateDeviceToken from './schemas/rotateDeviceToken.json' with { type: 'json' }
import schema_listSourceReadings from './schemas/listSourceReadings.json' with { type: 'json' }
import schema_listSourcePolls from './schemas/listSourcePolls.json' with { type: 'json' }
import schema_getProjectStrip from './schemas/getProjectStrip.json' with { type: 'json' }
import schema_createSubscribeLink from './schemas/createSubscribeLink.json' with { type: 'json' }
import schema_getSubscriberCounts from './schemas/getSubscriberCounts.json' with { type: 'json' }
import schema_listSubscribers from './schemas/listSubscribers.json' with { type: 'json' }
import schema_createSubscriber from './schemas/createSubscriber.json' with { type: 'json' }
import schema_deleteSubscriber from './schemas/deleteSubscriber.json' with { type: 'json' }
import schema_getUsage from './schemas/getUsage.json' with { type: 'json' }
import schema_getProjectVerdicts from './schemas/getProjectVerdicts.json' with { type: 'json' }
import schema_listWebhooks from './schemas/listWebhooks.json' with { type: 'json' }
import schema_createWebhook from './schemas/createWebhook.json' with { type: 'json' }
import schema_getWebhook from './schemas/getWebhook.json' with { type: 'json' }
import schema_updateWebhook from './schemas/updateWebhook.json' with { type: 'json' }
import schema_deleteWebhook from './schemas/deleteWebhook.json' with { type: 'json' }
import schema_verifyWebhook from './schemas/verifyWebhook.json' with { type: 'json' }
import schema_redeliverWebhook from './schemas/redeliverWebhook.json' with { type: 'json' }
import schema_listWebhookDeliveries from './schemas/listWebhookDeliveries.json' with { type: 'json' }
import schema_listWindows from './schemas/listWindows.json' with { type: 'json' }
import schema_createWindow from './schemas/createWindow.json' with { type: 'json' }
import schema_updateWindow from './schemas/updateWindow.json' with { type: 'json' }
import schema_cancelWindow from './schemas/cancelWindow.json' with { type: 'json' }
import schema_createWindowReport from './schemas/createWindowReport.json' with { type: 'json' }
import { OPENAPI_SHA256, OPERATION_IDS, type OperationId } from '../src/generated'

export interface OpenApiDocument {
  openapi: string
  info: { title: string; version: string; description?: string }
  paths: Record<string, unknown>
  components?: Record<string, unknown>
}
export type JsonSchema = Record<string, unknown> | boolean
export interface OperationSchema {
  $schema: string
  title: string
  allOf: Array<{ $ref: string }>
  $defs: { request: JsonSchema; response: JsonSchema }
  'x-operationId': string
  'x-method': string
  'x-path': string
}

export { OPENAPI_SHA256 }
export const openapi: OpenApiDocument = document as OpenApiDocument
export const operationSchemas: Record<OperationId, OperationSchema> = {
  getProjectAnalysis: schema_getProjectAnalysis,
  getOrganisationAnalysis: schema_getOrganisationAnalysis,
  evaluateWhatIf: schema_evaluateWhatIf,
  listProjectBundles: schema_listProjectBundles,
  streamBundles: schema_streamBundles,
  getBundle: schema_getBundle,
  listOrganisationBundles: schema_listOrganisationBundles,
  listProjectCalls: schema_listProjectCalls,
  getCall: schema_getCall,
  getCallExplanation: schema_getCallExplanation,
  listCatalogueSources: schema_listCatalogueSources,
  listChannels: schema_listChannels,
  previewChannels: schema_previewChannels,
  updateChannel: schema_updateChannel,
  listClauseSheets: schema_listClauseSheets,
  listClauseSheetVersions: schema_listClauseSheetVersions,
  getClauseSheetVersion: schema_getClauseSheetVersion,
  getClauseSheetDiff: schema_getClauseSheetDiff,
  evaluateClauseSheet: schema_evaluateClauseSheet,
  listClauseSheetDrafts: schema_listClauseSheetDrafts,
  createClauseSheetDraft: schema_createClauseSheetDraft,
  getClauseSheetDraft: schema_getClauseSheetDraft,
  deleteClauseSheetDraft: schema_deleteClauseSheetDraft,
  createReplay: schema_createReplay,
  getCommonsBudget: schema_getCommonsBudget,
  getDashboard: schema_getDashboard,
  listProjectDays: schema_listProjectDays,
  createDevice: schema_createDevice,
  streamOrganisationEvents: schema_streamOrganisationEvents,
  listEvidenceRequests: schema_listEvidenceRequests,
  createEvidenceRequest: schema_createEvidenceRequest,
  getEvidenceRequest: schema_getEvidenceRequest,
  listGrades: schema_listGrades,
  listIcsFeeds: schema_listIcsFeeds,
  createIcsFeed: schema_createIcsFeed,
  getIcsFeed: schema_getIcsFeed,
  deleteIcsFeed: schema_deleteIcsFeed,
  getProjectIndicators: schema_getProjectIndicators,
  ingestReadings: schema_ingestReadings,
  listLedgerEntries: schema_listLedgerEntries,
  exportLedger: schema_exportLedger,
  verifyLedger: schema_verifyLedger,
  listProjectListings: schema_listProjectListings,
  proposeListing: schema_proposeListing,
  listOrganisationListings: schema_listOrganisationListings,
  getMe: schema_getMe,
  listNights: schema_listNights,
  getNight: schema_getNight,
  updateProjectPack: schema_updateProjectPack,
  getPilotArchive: schema_getPilotArchive,
  listProjects: schema_listProjects,
  getProject: schema_getProject,
  getPublicProjectStatus: schema_getPublicProjectStatus,
  listPublicProjectCalls: schema_listPublicProjectCalls,
  listPublicLedgerEntries: schema_listPublicLedgerEntries,
  listPublicGrades: schema_listPublicGrades,
  listPublicCalendarEntries: schema_listPublicCalendarEntries,
  getPublicCall: schema_getPublicCall,
  getPublicWindow: schema_getPublicWindow,
  getPublicServiceStatus: schema_getPublicServiceStatus,
  streamPublicProjectState: schema_streamPublicProjectState,
  evaluatePublicProject: schema_evaluatePublicProject,
  streamReadings: schema_streamReadings,
  getReplay: schema_getReplay,
  listReviewItems: schema_listReviewItems,
  updateReviewItem: schema_updateReviewItem,
  listRuns: schema_listRuns,
  createRun: schema_createRun,
  getRun: schema_getRun,
  evaluateSandbox: schema_evaluateSandbox,
  searchOrganisation: schema_searchOrganisation,
  bindSource: schema_bindSource,
  listProjectSources: schema_listProjectSources,
  unbindSource: schema_unbindSource,
  rotateDeviceToken: schema_rotateDeviceToken,
  listSourceReadings: schema_listSourceReadings,
  listSourcePolls: schema_listSourcePolls,
  getProjectStrip: schema_getProjectStrip,
  createSubscribeLink: schema_createSubscribeLink,
  getSubscriberCounts: schema_getSubscriberCounts,
  listSubscribers: schema_listSubscribers,
  createSubscriber: schema_createSubscriber,
  deleteSubscriber: schema_deleteSubscriber,
  getUsage: schema_getUsage,
  getProjectVerdicts: schema_getProjectVerdicts,
  listWebhooks: schema_listWebhooks,
  createWebhook: schema_createWebhook,
  getWebhook: schema_getWebhook,
  updateWebhook: schema_updateWebhook,
  deleteWebhook: schema_deleteWebhook,
  verifyWebhook: schema_verifyWebhook,
  redeliverWebhook: schema_redeliverWebhook,
  listWebhookDeliveries: schema_listWebhookDeliveries,
  listWindows: schema_listWindows,
  createWindow: schema_createWindow,
  updateWindow: schema_updateWindow,
  cancelWindow: schema_cancelWindow,
  createWindowReport: schema_createWindowReport
}
export const operationSchemaPaths: Record<OperationId, string> = Object.fromEntries(
  OPERATION_IDS.map((id) => [id, `@skyclause/sdk/openapi/schemas/${id}`])
) as Record<OperationId, string>
export type OperationSchemaId = OperationId

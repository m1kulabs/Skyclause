export const OPENAPI_SHA256 = 'd9af64836ba902c17a6e808d274250adfa31c43e964aba8c5f6b9259ad3767bf' as const // gitleaks:allow -- a SHA-256 of openapi.json, not a secret.

export const OPERATION_IDS = [
  'getProjectAnalysis',
  'getOrganisationAnalysis',
  'evaluateWhatIf',
  'listProjectBundles',
  'streamBundles',
  'getBundle',
  'listOrganisationBundles',
  'listProjectCalls',
  'getCall',
  'getCallExplanation',
  'listCatalogueSources',
  'listChannels',
  'previewChannels',
  'updateChannel',
  'listClauseSheets',
  'listClauseSheetVersions',
  'getClauseSheetVersion',
  'getClauseSheetDiff',
  'evaluateClauseSheet',
  'listClauseSheetDrafts',
  'createClauseSheetDraft',
  'getClauseSheetDraft',
  'deleteClauseSheetDraft',
  'createReplay',
  'getCommonsBudget',
  'getDashboard',
  'listProjectDays',
  'createDevice',
  'streamOrganisationEvents',
  'listEvidenceRequests',
  'createEvidenceRequest',
  'getEvidenceRequest',
  'listGrades',
  'listIcsFeeds',
  'createIcsFeed',
  'deleteIcsFeed',
  'getProjectIndicators',
  'ingestReadings',
  'listLedgerEntries',
  'exportLedger',
  'verifyLedger',
  'listProjectListings',
  'proposeListing',
  'listOrganisationListings',
  'getMe',
  'listNights',
  'getNight',
  'updateProjectPack',
  'getPilotArchive',
  'listProjects',
  'getProject',
  'getPublicProjectStatus',
  'listPublicProjectCalls',
  'listPublicLedgerEntries',
  'listPublicGrades',
  'listPublicCalendarEntries',
  'getPublicCall',
  'getPublicWindow',
  'getPublicServiceStatus',
  'streamPublicProjectState',
  'evaluatePublicProject',
  'streamReadings',
  'getReplay',
  'listReviewItems',
  'updateReviewItem',
  'listRuns',
  'createRun',
  'getRun',
  'evaluateSandbox',
  'searchOrganisation',
  'bindSource',
  'listProjectSources',
  'unbindSource',
  'rotateDeviceToken',
  'listSourceReadings',
  'listSourcePolls',
  'getProjectStrip',
  'createSubscribeLink',
  'getSubscriberCounts',
  'listSubscribers',
  'createSubscriber',
  'deleteSubscriber',
  'getUsage',
  'getProjectVerdicts',
  'listWebhooks',
  'createWebhook',
  'getWebhook',
  'updateWebhook',
  'deleteWebhook',
  'verifyWebhook',
  'redeliverWebhook',
  'listWebhookDeliveries',
  'listWindows',
  'createWindow',
  'updateWindow',
  'cancelWindow',
  'createWindowReport'
] as const

export interface OpenApiComponents {
  schemas: Record<string, never>
}

export type OperationId = (typeof OPERATION_IDS)[number]

export type OperationRequests = {
  getProjectAnalysis: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
      from?: string
      to?: string
      pack?: 'sky' | 'crowd'
      period?: '7d' | '30d' | '90d' | 'all'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getOrganisationAnalysis: {
    query?: {
      limit?: number
      cursor?: string
      from?: string
      to?: string
      pack?: 'sky' | 'crowd'
      period?: '7d' | '30d' | '90d' | 'all'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  evaluateWhatIf: {
    params: {
      id: string
    }
    body: {
      sheet: {
        pack: 'sky' | 'crowd'
        clauses: Array<{
          key: string
          name: string
          enabled: boolean
          builtin?: 'silent_input'
          scope: 'site' | 'window' | 'night'
          requires: Array<string>
          optional?: Array<string>
          span?: {
            from: string
            to: string
          }
          when: string
          expiry?: 'start' | 'end'
          proposes: {
            mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
            watch?: true
            recommendations?: Array<
              'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
            >
            note?: 'flood_note' | 'single_source_flag' | 'calendar_entry'
          }
          wording: {
            en?: string
            ms?: string
          }
        }>
      }
      range: {
        from: string
        to: string
        step: 'reading' | string
      }
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listProjectBundles: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
      pack?: 'sky' | 'crowd'
      state?:
        | 'drafted'
        | 'closed'
        | 'needs_review'
        | 'superseded'
        | 'expired'
        | 'reconfirm'
        | 'approved'
        | 'sending'
        | 'sent'
        | 'graded'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  streamBundles: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getBundle: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listOrganisationBundles: {
    query?: {
      limit?: number
      cursor?: string
      pack?: 'sky' | 'crowd'
      state?:
        | 'drafted'
        | 'closed'
        | 'needs_review'
        | 'superseded'
        | 'expired'
        | 'reconfirm'
        | 'approved'
        | 'sending'
        | 'sent'
        | 'graded'
      project_id?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listProjectCalls: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
      window_id?: string
      pack?: 'sky' | 'crowd'
      state?: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
      mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
      from?: string
      to?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getCall: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getCallExplanation: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listCatalogueSources: {
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listChannels: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  previewChannels: {
    params: {
      id: string
    }
    query?: {
      pack?: 'sky' | 'crowd'
      mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
      language?: 'en' | 'ms'
      channel?: 'email' | 'ics' | 'webhook' | 'in_app'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  updateChannel: {
    params: {
      id: string
      channel: 'email' | 'ics' | 'webhook' | 'in_app'
    }
    body: {
      enabled: boolean
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listClauseSheets: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listClauseSheetVersions: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getClauseSheetVersion: {
    params: {
      id: string
      n: number
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getClauseSheetDiff: {
    params: {
      id: string
    }
    query: {
      base: 'live' | number
      head: string | number
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  evaluateClauseSheet: {
    params: {
      id: string
    }
    body?:
      | {
          content: {
            pack: 'sky' | 'crowd'
            clauses: Array<{
              key: string
              name: string
              enabled: boolean
              builtin?: 'silent_input'
              scope: 'site' | 'window' | 'night'
              requires: Array<string>
              optional?: Array<string>
              span?: {
                from: string
                to: string
              }
              when: string
              expiry?: 'start' | 'end'
              proposes: {
                mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
                watch?: true
                recommendations?: Array<
                  'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
                >
                note?: 'flood_note' | 'single_source_flag' | 'calendar_entry'
              }
              wording: {
                en?: string
                ms?: string
              }
            }>
          }
          at?: string
        }
      | {
          draft_id: string
          at?: string
        }
      | {
          version_n: number
          at?: string
        }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listClauseSheetDrafts: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  createClauseSheetDraft: {
    params: {
      id: string
    }
    body?: {
      content: {
        pack: 'sky' | 'crowd'
        clauses: Array<{
          key: string
          name: string
          enabled: boolean
          builtin?: 'silent_input'
          scope: 'site' | 'window' | 'night'
          requires: Array<string>
          optional?: Array<string>
          span?: {
            from: string
            to: string
          }
          when: string
          expiry?: 'start' | 'end'
          proposes: {
            mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
            watch?: true
            recommendations?: Array<
              'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
            >
            note?: 'flood_note' | 'single_source_flag' | 'calendar_entry'
          }
          wording: {
            en?: string
            ms?: string
          }
        }>
      }
      base_n?: number
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getClauseSheetDraft: {
    params: {
      id: string
      draftId: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  deleteClauseSheetDraft: {
    params: {
      id: string
      draftId: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  createReplay: {
    params: {
      id: string
    }
    body?: {
      version_id: string
      from: string
      to: string
      step: string
      dataset_id?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getCommonsBudget: {
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getDashboard: {
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listProjectDays: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  createDevice: {
    params: {
      id: string
    }
    body?: {
      kind: 'camera' | 'pi'
      name: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  streamOrganisationEvents: {
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listEvidenceRequests: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  createEvidenceRequest: {
    params: {
      id: string
    }
    body: {
      span?: {
        from: string
        to: string
      }
      call_id?: string | null
      window_id?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getEvidenceRequest: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listGrades: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
      pack?: 'sky' | 'crowd'
      from?: string
      to?: string
      outcome?:
        | 'hit'
        | 'miss'
        | 'false_alarm'
        | 'correct_normal'
        | 'no_call'
        | 'in_band'
        | 'out_of_band'
        | 'unlisted_surge'
        | 'pending'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listIcsFeeds: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  createIcsFeed: {
    params: {
      id: string
    }
    body?:
      | {
          url: string
        }
      | {
          file: {
            name: string
            content: string
          }
        }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  deleteIcsFeed: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getProjectIndicators: {
    params: {
      id: string
    }
    query: {
      pack: 'sky' | 'crowd'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  ingestReadings: {
    params: {
      sourceId: string
    }
    body?:
      | {
          readings: Array<{
            metric: string
            unit: string
            observed_at: string
            value?: number | null
            value_text?: string | null
            value_json?: Record<string, unknown> | null
            device_time?: string | null
            item_key?: string | null
          }>
          posted_at?: string
          feed_age_s?: number
          fetch_latency_ms?: number
        }
      | {
          kind: 'camera_frame'
          capture_id: string
          device_time: string
          ratio_near: number
          ratio_far: number
          flag: 'visible' | 'obscured'
          distance_km: number
          buffered: boolean
          jpeg_b64: string
        }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listLedgerEntries: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
      from?: string
      to?: string
      pack?: 'sky' | 'crowd'
      mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
      state?: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
      kind?:
        | 'call_approved'
        | 'call_edited'
        | 'call_rejected'
        | 'call_expired'
        | 'call_sent'
        | 'grade'
        | 'night_graded'
        | 'listing_listed'
        | 'listing_changed'
        | 'listing_cancelled'
        | 'clause_version'
        | 'window_cancelled'
        | 'evidence_replied'
        | 'crowd_reply'
        | 'correction'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  exportLedger: {
    params: {
      id: string
    }
    query?: {
      from?: string
      to?: string
      pack?: 'sky' | 'crowd'
      mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
      state?: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
      kind?:
        | 'call_approved'
        | 'call_edited'
        | 'call_rejected'
        | 'call_expired'
        | 'call_sent'
        | 'grade'
        | 'night_graded'
        | 'listing_listed'
        | 'listing_changed'
        | 'listing_cancelled'
        | 'clause_version'
        | 'window_cancelled'
        | 'evidence_replied'
        | 'crowd_reply'
        | 'correction'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  verifyLedger: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listProjectListings: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  proposeListing: {
    params: {
      id: string
    }
    body?: {
      source_url: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listOrganisationListings: {
    query: {
      limit?: number
      cursor?: string
      state: 'proposed'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getMe: {
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listNights: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getNight: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  updateProjectPack: {
    params: {
      id: string
      pack: 'sky' | 'crowd'
    }
    body?: {
      enabled?: boolean
      sla_s?: number | null
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getPilotArchive: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listProjects: {
    query?: {
      limit?: number
      cursor?: string
      slug?: string
      include?: 'summary'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getProject: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getPublicProjectStatus: {
    params: {
      org: string
      project: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listPublicProjectCalls: {
    params: {
      org: string
      project: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listPublicLedgerEntries: {
    params: {
      org: string
      project: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listPublicGrades: {
    params: {
      org: string
      project: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listPublicCalendarEntries: {
    params: {
      org: string
      project: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getPublicCall: {
    params: {
      callId: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getPublicWindow: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getPublicServiceStatus: {
    idempotencyKey?: string
    signal?: AbortSignal
  }
  streamPublicProjectState: {
    params: {
      org: string
      project: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  evaluatePublicProject: {
    params: {
      org: string
      project: string
    }
    body: {
      date: string
      start_time: string
      end_time: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  streamReadings: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getReplay: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listReviewItems: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
      state?: string
      reason?: 'miss' | 'false_alarm' | 'expired_above_normal' | 'out_of_band' | 'unlisted_surge' | 'no_call'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  updateReviewItem: {
    params: {
      id: string
    }
    body: {
      state?: string
      explanation?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listRuns: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  createRun: {
    params: {
      id: string
    }
    body?: {
      pack: 'sky' | 'crowd'
      window_ids?: Array<string>
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getRun: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  evaluateSandbox: {
    body: {
      pack: 'sky' | 'crowd'
      clause: {
        key: string
        name: string
        enabled: boolean
        builtin?: 'silent_input'
        scope: 'site' | 'window' | 'night'
        requires: Array<string>
        optional?: Array<string>
        span?: {
          from: string
          to: string
        }
        when: string
        expiry?: 'start' | 'end'
        proposes: {
          mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
          watch?: true
          recommendations?: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          note?: 'flood_note' | 'single_source_flag' | 'calendar_entry'
        }
        wording: {
          en?: string
          ms?: string
        }
      }
      replay_id?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  searchOrganisation: {
    query: {
      limit?: number
      cursor?: string
      q: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  bindSource: {
    params: {
      id: string
    }
    body?: {
      source_id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listProjectSources: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  unbindSource: {
    params: {
      id: string
      sourceId: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  rotateDeviceToken: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listSourceReadings: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listSourcePolls: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getProjectStrip: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  createSubscribeLink: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getSubscriberCounts: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listSubscribers: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
      window_id?: string
      channel?: 'email' | 'ics' | 'webhook' | 'in_app'
      status?: 'confirmed' | 'unconfirmed' | 'bounced' | 'complained' | 'suppressed' | 'unsubscribed'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  createSubscriber: {
    params: {
      id: string
    }
    body: {
      email: string
      role: string
      window_ids: Array<string>
      channels: Array<'email' | 'ics' | 'webhook' | 'in_app'>
      language: 'en' | 'ms'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  deleteSubscriber: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getUsage: {
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getProjectVerdicts: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listWebhooks: {
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  createWebhook: {
    body: {
      url: string
      project_ids: Array<string>
      events: Array<
        | 'source.error'
        | 'source.stale'
        | 'source.recovered'
        | 'crossing.detected'
        | 'run.completed'
        | 'run.failed'
        | 'bundle.drafted'
        | 'bundle.needs_review'
        | 'bundle.escalated'
        | 'bundle.approved'
        | 'bundle.superseded'
        | 'bundle.expired'
        | 'call.sent'
        | 'call.graded'
        | 'listing.proposed'
        | 'listing.listed'
        | 'listing.changed'
        | 'night.graded'
        | 'review_item.opened'
        | 'evidence_request.answered'
      >
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  getWebhook: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  updateWebhook: {
    params: {
      id: string
    }
    body: {
      url?: string
      project_ids?: Array<string>
      events?: Array<
        | 'source.error'
        | 'source.stale'
        | 'source.recovered'
        | 'crossing.detected'
        | 'run.completed'
        | 'run.failed'
        | 'bundle.drafted'
        | 'bundle.needs_review'
        | 'bundle.escalated'
        | 'bundle.approved'
        | 'bundle.superseded'
        | 'bundle.expired'
        | 'call.sent'
        | 'call.graded'
        | 'listing.proposed'
        | 'listing.listed'
        | 'listing.changed'
        | 'night.graded'
        | 'review_item.opened'
        | 'evidence_request.answered'
      >
      disabled?: boolean
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  deleteWebhook: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  verifyWebhook: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  redeliverWebhook: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listWebhookDeliveries: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  listWindows: {
    params: {
      id: string
    }
    query?: {
      limit?: number
      cursor?: string
      include?: 'calls'
      from?: string
      to?: string
      kind?: 'class' | 'event' | 'commute_wave'
      at_risk?: 'true' | 'false'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  createWindow: {
    params: {
      id: string
    }
    body?: {
      title: string
      kind: 'class' | 'event' | 'commute_wave'
      starts_at: string
      ends_at: string
      tz: string
      recurrence?: {
        frequency: 'weekly'
        days_of_week: Array<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'>
        until?: string
        count?: number
        skip_dates: Array<string>
      }
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  updateWindow: {
    params: {
      id: string
    }
    query?: {
      scope?: 'occurrence' | 'series'
    }
    body?: {
      title?: string
      kind?: 'class' | 'event' | 'commute_wave'
      starts_at?: string
      ends_at?: string
      tz?: string
      recurrence?: {
        frequency: 'weekly'
        days_of_week: Array<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'>
        until?: string
        count?: number
        skip_dates: Array<string>
      }
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  cancelWindow: {
    params: {
      id: string
    }
    query?: {
      scope?: 'occurrence' | 'series'
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
  createWindowReport: {
    params: {
      id: string
    }
    idempotencyKey?: string
    signal?: AbortSignal
  }
}

export type OperationResponses = {
  getProjectAnalysis: {
    from: string
    to: string
    updated_at: string
    metrics: Array<{
      metric: string
      x: number | null
      value?: number | null
      n: number
      low: number | null
      high: number | null
      pack: 'sky' | 'crowd'
      clause_key: string | null
    }>
    series: Array<{
      at: string
      metrics: Array<{
        metric: string
        x: number | null
        value?: number | null
        n: number
        low: number | null
        high: number | null
        pack: 'sky' | 'crowd'
        clause_key: string | null
      }>
    }>
    grades: {
      data: Array<{
        id: string
        call_id: string | null
        night_id: string | null
        outcome: string
        sheet_version_id: string
        pack: 'sky' | 'crowd'
        window_id: string | null
        proposed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        observed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        mode_diff: number
        no_call: boolean
        agrees: boolean
        stale_inputs: boolean
      }>
      next_cursor: string | null
    }
    kill_line_exceeded: boolean
    evidence_minutes?: Array<{
      metric: string
      x: number | null
      value?: number | null
      n: number
      low: number | null
      high: number | null
    }>
  }
  getOrganisationAnalysis: {
    from: string
    to: string
    updated_at: string
    metrics: Array<{
      metric: string
      x: number | null
      value?: number | null
      n: number
      low: number | null
      high: number | null
      pack: 'sky' | 'crowd'
      clause_key: string | null
    }>
    series: Array<{
      at: string
      metrics: Array<{
        metric: string
        x: number | null
        value?: number | null
        n: number
        low: number | null
        high: number | null
        pack: 'sky' | 'crowd'
        clause_key: string | null
      }>
    }>
    grades: {
      data: Array<{
        id: string
        call_id: string | null
        night_id: string | null
        outcome: string
        sheet_version_id: string
        pack: 'sky' | 'crowd'
        window_id: string | null
        proposed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        observed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        mode_diff: number
        no_call: boolean
        agrees: boolean
        stale_inputs: boolean
      }>
      next_cursor: string | null
    }
    kill_line_exceeded: boolean
    evidence_minutes?: Array<{
      metric: string
      x: number | null
      value?: number | null
      n: number
      low: number | null
      high: number | null
    }>
  }
  evaluateWhatIf: {
    label: 'replay'
    steps: Array<{
      t_eval: string
      verdicts: {
        t_eval: string
        pack: 'sky' | 'crowd'
        content_hash: string
        snapshot_hash: string
        site: Array<{
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }>
        windows: Array<{
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }>
        nights: Array<{
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }>
        hash: string
      }
    }>
    summary: Record<string, number>
    metrics?: Array<{
      metric: string
      x: number | null
      value?: number | null
      n: number
      low: number | null
      high: number | null
      pack: 'sky' | 'crowd'
      clause_key: string | null
    }>
  }
  listProjectBundles: {
    data: Array<{
      id: string
      project_id: string
      run_id: string
      pack: 'sky' | 'crowd'
      state:
        | 'drafted'
        | 'closed'
        | 'needs_review'
        | 'superseded'
        | 'expired'
        | 'reconfirm'
        | 'approved'
        | 'sending'
        | 'sent'
        | 'graded'
      superseded_by: string | null
      review_hash: string
      sla_due_at: string | null
      needs_review_at: string | null
      approved_by: string | null
      escalation_level: number
      draft_only: boolean
      calls: Array<{
        id: string
        bundle_id: string
        window_id: string | null
        night_id: string | null
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: Array<string> | null
        fired: Array<{
          clause: string
          inputs: Array<string>
        }>
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        recipients: Array<string>
        notices: Array<{
          language: 'en' | 'ms'
          subject: string
          body: string
        }>
        reason: string
        state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
        shadow: {
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }
        chosen: string
        agrees: boolean
        decision: string | null
        expires_at: string
        triggered_at: string
        drafted_at: string
        approved_at: string | null
        sent_at: string | null
        superseded_by_call_id: string | null
        ics_uid: string | null
        ics_sequence: number
      }>
      missing?: Array<{
        window_id: string | null
        night_id: string | null
        shadow: {
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }
        recipients: Array<string>
        resolution: 'drafted' | 'dismissed' | 'superseded' | null
        call_id: string | null
        reason: string | null
        resolved_by: string | null
        resolved_at: string | null
        superseded_by: string | null
      }>
      trigger: 'schedule' | 'crossing' | 'window' | 'listing' | 'calendar' | 'request'
      triggered_at: string
      sheet_version_id: string | null
      alerts: Array<{
        account_id: string
        notified_at: string
        level: string
      }>
    }>
    next_cursor: string | null
  }
  streamBundles: Response
  getBundle: {
    id: string
    project_id: string
    run_id: string
    pack: 'sky' | 'crowd'
    state:
      | 'drafted'
      | 'closed'
      | 'needs_review'
      | 'superseded'
      | 'expired'
      | 'reconfirm'
      | 'approved'
      | 'sending'
      | 'sent'
      | 'graded'
    superseded_by: string | null
    review_hash: string
    sla_due_at: string | null
    needs_review_at: string | null
    approved_by: string | null
    escalation_level: number
    draft_only: boolean
    calls: Array<{
      id: string
      bundle_id: string
      window_id: string | null
      night_id: string | null
      mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      watch: boolean
      no_call: Array<string> | null
      fired: Array<{
        clause: string
        inputs: Array<string>
      }>
      recommendations: Array<'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'>
      recipients: Array<string>
      notices: Array<{
        language: 'en' | 'ms'
        subject: string
        body: string
      }>
      reason: string
      state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
      shadow: {
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }
      chosen: string
      agrees: boolean
      decision: string | null
      expires_at: string
      triggered_at: string
      drafted_at: string
      approved_at: string | null
      sent_at: string | null
      superseded_by_call_id: string | null
      ics_uid: string | null
      ics_sequence: number
      recipient_counts?: {
        by_language: {
          en: number
          ms: number
        }
        by_channel: {
          email: number
          push: number
        }
        suppressed: number
      }
    }>
    missing?: Array<{
      window_id: string | null
      night_id: string | null
      shadow: {
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }
      recipients: Array<string>
      resolution: 'drafted' | 'dismissed' | 'superseded' | null
      call_id: string | null
      reason: string | null
      resolved_by: string | null
      resolved_at: string | null
      superseded_by: string | null
    }>
    trigger: 'schedule' | 'crossing' | 'window' | 'listing' | 'calendar' | 'request'
    triggered_at: string
    sheet_version_id: string | null
    alerts: Array<{
      account_id: string
      notified_at: string
      level: string
    }>
    summary?: {
      text: string
      inputs: Array<{
        name: string
        value: number | boolean | string | Array<number> | null
        unit: string
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string | null
        age_s: number | null
        source_ids: Array<string>
        source_url: string | null
        reading_ids: Array<string>
        observed_at: string | null
      }>
    }
    escalations?: Array<{
      actor_id: string
      at: string
    }>
  }
  listOrganisationBundles: {
    data: Array<{
      id: string
      project_id: string
      run_id: string
      pack: 'sky' | 'crowd'
      state:
        | 'drafted'
        | 'closed'
        | 'needs_review'
        | 'superseded'
        | 'expired'
        | 'reconfirm'
        | 'approved'
        | 'sending'
        | 'sent'
        | 'graded'
      superseded_by: string | null
      review_hash: string
      sla_due_at: string | null
      needs_review_at: string | null
      approved_by: string | null
      escalation_level: number
      draft_only: boolean
      calls: Array<{
        id: string
        bundle_id: string
        window_id: string | null
        night_id: string | null
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: Array<string> | null
        fired: Array<{
          clause: string
          inputs: Array<string>
        }>
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        recipients: Array<string>
        notices: Array<{
          language: 'en' | 'ms'
          subject: string
          body: string
        }>
        reason: string
        state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
        shadow: {
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }
        chosen: string
        agrees: boolean
        decision: string | null
        expires_at: string
        triggered_at: string
        drafted_at: string
        approved_at: string | null
        sent_at: string | null
        superseded_by_call_id: string | null
        ics_uid: string | null
        ics_sequence: number
      }>
      missing?: Array<{
        window_id: string | null
        night_id: string | null
        shadow: {
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }
        recipients: Array<string>
        resolution: 'drafted' | 'dismissed' | 'superseded' | null
        call_id: string | null
        reason: string | null
        resolved_by: string | null
        resolved_at: string | null
        superseded_by: string | null
      }>
      trigger: 'schedule' | 'crossing' | 'window' | 'listing' | 'calendar' | 'request'
      triggered_at: string
      sheet_version_id: string | null
      alerts: Array<{
        account_id: string
        notified_at: string
        level: string
      }>
    }>
    next_cursor: string | null
  }
  listProjectCalls: {
    data: Array<{
      id: string
      bundle_id: string
      window_id: string | null
      night_id: string | null
      mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      watch: boolean
      no_call: Array<string> | null
      fired: Array<{
        clause: string
        inputs: Array<string>
      }>
      recommendations: Array<'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'>
      recipients: Array<string>
      notices: Array<{
        language: 'en' | 'ms'
        subject: string
        body: string
      }>
      reason: string
      state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
      shadow: {
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }
      chosen: string
      agrees: boolean
      decision: string | null
      expires_at: string
      triggered_at: string
      drafted_at: string
      approved_at: string | null
      sent_at: string | null
      superseded_by_call_id: string | null
      ics_uid: string | null
      ics_sequence: number
    }>
    next_cursor: string | null
  }
  getCall: {
    id: string
    bundle_id: string
    window_id: string | null
    night_id: string | null
    mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
    watch: boolean
    no_call: Array<string> | null
    fired: Array<{
      clause: string
      inputs: Array<string>
    }>
    recommendations: Array<'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'>
    recipients: Array<string>
    notices: Array<{
      language: 'en' | 'ms'
      subject: string
      body: string
    }>
    reason: string
    state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
    shadow: {
      scope: {
        kind: 'site' | 'window' | 'night'
        id: string | null
      }
      pack: 'sky' | 'crowd'
      mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      watch: boolean
      no_call: {
        inputs: Array<{
          name: string
          source_id: string | null
          state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
          since: string
        }>
      } | null
      recommendations: Array<'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'>
      clauses: Array<{
        key: string
        result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
        blocked_by: Array<{
          name: string
          source_id: string | null
          state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
          since: string
        }>
        span?: {
          from: string
          to: string
          complete: boolean
        }
        inputs: Array<{
          name: string
          value: number | boolean | string | Array<number> | null
          unit: string
          state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
          since: string | null
          age_s: number | null
          source_ids: Array<string>
          source_url: string | null
          reading_ids: Array<string>
          observed_at: string | null
        }>
      }>
      open_from: string | null
    }
    chosen: string
    agrees: boolean
    decision: string | null
    expires_at: string
    triggered_at: string
    drafted_at: string
    approved_at: string | null
    sent_at: string | null
    superseded_by_call_id: string | null
    ics_uid: string | null
    ics_sequence: number
    call_id: string
    sheet_version_id: string
    clauses: Array<{
      key: string
      result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
      blocked_by: Array<{
        name: string
        source_id: string | null
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string
      }>
      span?: {
        from: string
        to: string
        complete: boolean
      }
      inputs: Array<{
        name: string
        value: number | boolean | string | Array<number> | null
        unit: string
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string | null
        age_s: number | null
        source_ids: Array<string>
        source_url: string | null
        reading_ids: Array<string>
        observed_at: string | null
      }>
      cel: string
      wording: {
        en?: string
        ms?: string
      }
    }>
    inputs: Array<{
      name: string
      value: number | boolean | string | Array<number> | null
      unit: string
      state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
      since: string | null
      age_s: number | null
      source_ids: Array<string>
      source_url: string | null
      reading_ids: Array<string>
      observed_at: string | null
    }>
    warnings: Array<{
      reading_id: string
      text: string
      gloss: string | null
      valid_from: string
      valid_to: string
    }>
    trace: Array<{
      step: string
      duration_ms: number
      inputs: Array<{
        name: string
        value: number | boolean | string | Array<number> | null
        unit: string
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string | null
        age_s: number | null
        source_ids: Array<string>
        source_url: string | null
        reading_ids: Array<string>
        observed_at: string | null
      }>
      detail: string
    }>
    project_id: string
    trace_id: string
    window: {
      id: string
      project_id: string
      starts_at: string
      ends_at: string
      title: string
      kind: 'class' | 'event' | 'commute_wave'
      tz: string
      declared_by: string
      guest: boolean
      via: 'app' | 'form' | 'ics' | 'api' | 'cli' | 'mcp' | 'guest' | 'share'
      expires_at: string | null
      series_id: string | null
      ics_feed_id: string | null
      cancelled_at: string | null
      share_link_id: string | null
      moderation: 'visible' | 'hidden_pending_review' | 'removed'
    } | null
    night: {
      id: string
      project_id: string
      date: string
      state: 'upcoming' | 'in_progress' | 'awaiting_actuals' | 'graded' | 'unlisted'
      doors: string
      show: string
      arrival_start: string
      arrival_end: string
      exit_start: string | null
      exit_end: string | null
    } | null
    approved_by: string | null
    grade: {
      id: string
      call_id: string | null
      night_id: string | null
      outcome: string
      sheet_version_id: string
      pack: 'sky' | 'crowd'
      window_id: string | null
      proposed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      observed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      mode_diff: number
      no_call: boolean
      agrees: boolean
      stale_inputs: boolean
    } | null
    permalink: string
    deliveries: Array<{
      recipient_id: string
      language: 'en' | 'ms'
      status: 'queued' | 'sent' | 'delivered' | 'bounced' | 'complained' | 'suppressed' | 'failed' | 'expired'
      accepted_at: string | null
    }>
    recipient_counts?: {
      by_language: {
        en: number
        ms: number
      }
      by_channel: {
        email: number
        push: number
      }
      suppressed: number
    }
  }
  getCallExplanation: {
    call_id: string
    sheet_version_id: string
    clauses: Array<{
      key: string
      result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
      blocked_by: Array<{
        name: string
        source_id: string | null
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string
      }>
      span?: {
        from: string
        to: string
        complete: boolean
      }
      inputs: Array<{
        name: string
        value: number | boolean | string | Array<number> | null
        unit: string
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string | null
        age_s: number | null
        source_ids: Array<string>
        source_url: string | null
        reading_ids: Array<string>
        observed_at: string | null
      }>
      cel: string
      wording: {
        en?: string
        ms?: string
      }
    }>
    inputs: Array<{
      name: string
      value: number | boolean | string | Array<number> | null
      unit: string
      state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
      since: string | null
      age_s: number | null
      source_ids: Array<string>
      source_url: string | null
      reading_ids: Array<string>
      observed_at: string | null
    }>
    warnings: Array<{
      reading_id: string
      text: string
      gloss: string | null
      valid_from: string
      valid_to: string
    }>
    trace: Array<{
      step: string
      duration_ms: number
      inputs: Array<{
        name: string
        value: number | boolean | string | Array<number> | null
        unit: string
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string | null
        age_s: number | null
        source_ids: Array<string>
        source_url: string | null
        reading_ids: Array<string>
        observed_at: string | null
      }>
      detail: string
    }>
  }
  listCatalogueSources: {
    data: Array<{
      id: string
      kind:
        | 'jps_rain'
        | 'met_warning'
        | 'met_forecast'
        | 'apims'
        | 'rapidrail_od'
        | 'gtfs_static'
        | 'gtfs_rt'
        | 'golive'
        | 'wikipedia'
        | 'camera'
        | 'pi'
      external_id: string
      owner_org_id: string | null
      name: string
      lat: number | null
      lon: number | null
      url: string
      cadence_s: number
      stale_after_s: number
      licence_id: string
      licence_label: string
      latest_reading: {
        id: string
        source_id: string
        poll_id: string | null
        metric: string
        unit: string | null
        observed_at: string
        received_at: string
        value: number | null
        value_text: string | null
        value_json: Record<string, unknown> | null
        device_time: string | null
        item_key: string | null
        revision: string
      } | null
      age_s: number | null
      source_state: {
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string
        http_status: number | null
        pending_until: string | null
      } | null
    }>
    next_cursor: string | null
  }
  listChannels: {
    data: Array<{
      channel: 'email' | 'ics' | 'webhook' | 'in_app'
      enabled: boolean
    }>
    next_cursor: string | null
  }
  previewChannels:
    | {
        n: 0
        call_id: null
        previews: Array<{
          channel: 'email' | 'ics' | 'webhook' | 'in_app'
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          language: 'en' | 'ms'
          subject: string
          text: string
          html?: string
        }>
        replay?: {
          label: 'replay'
          source: {
            station_id: string
            url: string
            captured_at: string
            observed_at: string
          }
          previews: Array<{
            channel: 'email' | 'ics' | 'webhook' | 'in_app'
            pack: 'sky' | 'crowd'
            mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
            language: 'en' | 'ms'
            subject: string
            text: string
            html?: string
          }>
        }
      }
    | {
        n: 1
        call_id: string
        previews: Array<{
          channel: 'email' | 'ics' | 'webhook' | 'in_app'
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          language: 'en' | 'ms'
          subject: string
          text: string
          html?: string
        }>
      }
  updateChannel: {
    channel: 'email' | 'ics' | 'webhook' | 'in_app'
    enabled: boolean
  }
  listClauseSheets: {
    data: Array<{
      id: string
      project_id: string
      pack: 'sky' | 'crowd'
      live_version_id: string | null
    }>
    next_cursor: string | null
  }
  listClauseSheetVersions: {
    data: Array<{
      id: string
      content: {
        pack: 'sky' | 'crowd'
        clauses: Array<{
          key: string
          name: string
          enabled: boolean
          builtin?: 'silent_input'
          scope: 'site' | 'window' | 'night'
          requires: Array<string>
          optional?: Array<string>
          span?: {
            from: string
            to: string
          }
          when: string
          expiry?: 'start' | 'end'
          proposes: {
            mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
            watch?: true
            recommendations?: Array<
              'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
            >
            note?: 'flood_note' | 'single_source_flag' | 'calendar_entry'
          }
          wording: {
            en?: string
            ms?: string
          }
        }>
      }
      content_hash: string
      published_by: string | null
      base_n: number | null
      published_at: string | null
      check: {
        ok: boolean
        publishable: boolean
        issues: Array<{
          clause_key: string | null
          message: string
          offset: number
          length: number
        }>
      } | null
      publishable: boolean
      validation_status: 'checked' | 'unavailable'
      status: 'published'
      n: number
    }>
    next_cursor: string | null
  }
  getClauseSheetVersion: {
    id: string
    content: {
      pack: 'sky' | 'crowd'
      clauses: Array<{
        key: string
        name: string
        enabled: boolean
        builtin?: 'silent_input'
        scope: 'site' | 'window' | 'night'
        requires: Array<string>
        optional?: Array<string>
        span?: {
          from: string
          to: string
        }
        when: string
        expiry?: 'start' | 'end'
        proposes: {
          mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
          watch?: true
          recommendations?: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          note?: 'flood_note' | 'single_source_flag' | 'calendar_entry'
        }
        wording: {
          en?: string
          ms?: string
        }
      }>
    }
    content_hash: string
    published_by: string | null
    base_n: number | null
    published_at: string | null
    check: {
      ok: boolean
      publishable: boolean
      issues: Array<{
        clause_key: string | null
        message: string
        offset: number
        length: number
      }>
    } | null
    publishable: boolean
    validation_status: 'checked' | 'unavailable'
    status: 'published'
    n: number
  }
  getClauseSheetDiff: Array<{
    key: string
    before: {
      key: string
      name: string
      enabled: boolean
      builtin?: 'silent_input'
      scope: 'site' | 'window' | 'night'
      requires: Array<string>
      optional?: Array<string>
      span?: {
        from: string
        to: string
      }
      when: string
      expiry?: 'start' | 'end'
      proposes: {
        mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
        watch?: true
        recommendations?: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        note?: 'flood_note' | 'single_source_flag' | 'calendar_entry'
      }
      wording: {
        en?: string
        ms?: string
      }
    } | null
    after: {
      key: string
      name: string
      enabled: boolean
      builtin?: 'silent_input'
      scope: 'site' | 'window' | 'night'
      requires: Array<string>
      optional?: Array<string>
      span?: {
        from: string
        to: string
      }
      when: string
      expiry?: 'start' | 'end'
      proposes: {
        mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
        watch?: true
        recommendations?: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        note?: 'flood_note' | 'single_source_flag' | 'calendar_entry'
      }
      wording: {
        en?: string
        ms?: string
      }
    } | null
  }>
  evaluateClauseSheet: {
    check: {
      ok: boolean
      publishable: boolean
      issues: Array<{
        clause_key: string | null
        message: string
        offset: number
        length: number
      }>
    }
    verdicts: {
      t_eval: string
      pack: 'sky' | 'crowd'
      content_hash: string
      snapshot_hash: string
      site: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }>
      windows: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }>
      nights: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }>
      hash: string
    }
    label: 'live' | 'replay'
    explanations: Array<{
      key: string
      result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
      blocked_by: Array<{
        name: string
        source_id: string | null
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string
      }>
      span?: {
        from: string
        to: string
        complete: boolean
      }
      inputs: Array<{
        name: string
        value: number | boolean | string | Array<number> | null
        unit: string
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string | null
        age_s: number | null
        source_ids: Array<string>
        source_url: string | null
        reading_ids: Array<string>
        observed_at: string | null
      }>
      cel: string
      wording: {
        en?: string
        ms?: string
      }
    }>
  }
  listClauseSheetDrafts: {
    data: Array<{
      id: string
      content: {
        pack: 'sky' | 'crowd'
        clauses: Array<{
          key: string
          name: string
          enabled: boolean
          builtin?: 'silent_input'
          scope: 'site' | 'window' | 'night'
          requires: Array<string>
          optional?: Array<string>
          span?: {
            from: string
            to: string
          }
          when: string
          expiry?: 'start' | 'end'
          proposes: {
            mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
            watch?: true
            recommendations?: Array<
              'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
            >
            note?: 'flood_note' | 'single_source_flag' | 'calendar_entry'
          }
          wording: {
            en?: string
            ms?: string
          }
        }>
      }
      content_hash: string
      published_by: string | null
      base_n: number | null
      published_at: string | null
      check: {
        ok: boolean
        publishable: boolean
        issues: Array<{
          clause_key: string | null
          message: string
          offset: number
          length: number
        }>
      } | null
      publishable: boolean
      validation_status: 'checked' | 'unavailable'
      status: 'draft'
      n: null
    }>
    next_cursor: string | null
  }
  createClauseSheetDraft: {
    id: string
    content: {
      pack: 'sky' | 'crowd'
      clauses: Array<{
        key: string
        name: string
        enabled: boolean
        builtin?: 'silent_input'
        scope: 'site' | 'window' | 'night'
        requires: Array<string>
        optional?: Array<string>
        span?: {
          from: string
          to: string
        }
        when: string
        expiry?: 'start' | 'end'
        proposes: {
          mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
          watch?: true
          recommendations?: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          note?: 'flood_note' | 'single_source_flag' | 'calendar_entry'
        }
        wording: {
          en?: string
          ms?: string
        }
      }>
    }
    content_hash: string
    published_by: string | null
    base_n: number | null
    published_at: string | null
    check: {
      ok: boolean
      publishable: boolean
      issues: Array<{
        clause_key: string | null
        message: string
        offset: number
        length: number
      }>
    } | null
    publishable: boolean
    validation_status: 'checked' | 'unavailable'
    status: 'draft'
    n: null
  }
  getClauseSheetDraft: {
    id: string
    content: {
      pack: 'sky' | 'crowd'
      clauses: Array<{
        key: string
        name: string
        enabled: boolean
        builtin?: 'silent_input'
        scope: 'site' | 'window' | 'night'
        requires: Array<string>
        optional?: Array<string>
        span?: {
          from: string
          to: string
        }
        when: string
        expiry?: 'start' | 'end'
        proposes: {
          mode?: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night'
          watch?: true
          recommendations?: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          note?: 'flood_note' | 'single_source_flag' | 'calendar_entry'
        }
        wording: {
          en?: string
          ms?: string
        }
      }>
    }
    content_hash: string
    published_by: string | null
    base_n: number | null
    published_at: string | null
    check: {
      ok: boolean
      publishable: boolean
      issues: Array<{
        clause_key: string | null
        message: string
        offset: number
        length: number
      }>
    } | null
    publishable: boolean
    validation_status: 'checked' | 'unavailable'
    status: 'draft'
    n: null
  }
  deleteClauseSheetDraft: {
    id: string
  }
  createReplay: {
    id: string
    label: 'replay'
    steps: Array<{
      t_eval: string
      verdicts: {
        t_eval: string
        pack: 'sky' | 'crowd'
        content_hash: string
        snapshot_hash: string
        site: Array<{
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }>
        windows: Array<{
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }>
        nights: Array<{
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }>
        hash: string
      }
    }>
    summary: Record<string, number>
  }
  getCommonsBudget: {
    device: {
      resets_at: string
      runs: {
        used: number
        limit: number
        remaining: number
      }
      evidence_requests: {
        used: number
        limit: number
        remaining: number
      }
      active_windows: {
        used: number
        limit: number
        remaining: number
      }
    }
    ip: {
      resets_at: string
      runs: {
        used: number
        limit: number
        remaining: number
      }
      evidence_requests: {
        used: number
        limit: number
        remaining: number
      }
    }
    commons: {
      resets_at: string
      model_tokens: {
        used: number
        limit: number
        remaining: number
      }
    }
  }
  getDashboard: {
    needs_review: {
      data: Array<{
        id: string
        project: {
          id: string
          slug: string
          org_slug: string
        }
        pack: 'sky' | 'crowd'
        sla_due_at: string
        seconds_remaining: number
      }>
      n: number
      next_action: string | null
    }
    windows_at_risk: {
      data: Array<{
        project: {
          id: string
          slug: string
          org_slug: string
        }
        window: {
          id: string
          project_id: string
          starts_at: string
          ends_at: string
          title: string
          kind: 'class' | 'event' | 'commute_wave'
          tz: string
          declared_by: string
          guest: boolean
          via: 'app' | 'form' | 'ics' | 'api' | 'cli' | 'mcp' | 'guest' | 'share'
          expires_at: string | null
          series_id: string | null
          ics_feed_id: string | null
          cancelled_at: string | null
          share_link_id: string | null
          moderation: 'visible' | 'hidden_pending_review' | 'removed'
        }
        verdict: {
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }
      }>
      n: number
      next_action: string | null
    }
    signal_health: {
      data: Array<{
        project: {
          id: string
          slug: string
          org_slug: string
        }
        source: {
          id: string
          kind:
            | 'jps_rain'
            | 'met_warning'
            | 'met_forecast'
            | 'apims'
            | 'rapidrail_od'
            | 'gtfs_static'
            | 'gtfs_rt'
            | 'golive'
            | 'wikipedia'
            | 'camera'
            | 'pi'
          external_id: string
          owner_org_id: string | null
          name: string
          lat: number | null
          lon: number | null
          url: string
          cadence_s: number
          stale_after_s: number
          licence_id: string
          licence_label: string
        }
        state: {
          state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
          since: string
          http_status: number | null
          pending_until: string | null
        }
        age_s: number | null
      }>
      n: number
      next_action: string | null
    }
    upcoming_risks: {
      data: Array<{
        project: {
          id: string
          slug: string
          org_slug: string
        }
        pack: 'sky' | 'crowd'
        date: string
        starts_at: string
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        show_name?: string | null
        warning?: {
          text: string
          gloss: string | null
          valid_from: string
          valid_to: string
        } | null
      }>
      n: number
      next_action: string | null
    }
    yesterday_grades: {
      data: Array<{
        project: {
          id: string
          slug: string
          org_slug: string
        }
        grade: {
          id: string
          call_id: string | null
          night_id: string | null
          outcome: string
          sheet_version_id: string
          pack: 'sky' | 'crowd'
          window_id: string | null
          proposed_mode:
            'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          observed_mode:
            'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          mode_diff: number
          no_call: boolean
          agrees: boolean
          stale_inputs: boolean
        }
        metric: {
          metric: string
          x: number | null
          value?: number | null
          n: number
          low: number | null
          high: number | null
        }
      }>
      n: number
      next_action: string | null
    }
  }
  listProjectDays: {
    data: Array<{
      date: string
      reading_count: number
      error_count: number
      window_count: number
      storm_afternoon?: {
        wording: string
        source_url: string
      } | null
    }>
    next_cursor: string | null
  }
  createDevice: {
    source_id: string
    token: string
    scope: 'ingest'
    kind: 'camera' | 'pi'
    name: string
  }
  streamOrganisationEvents: Response
  listEvidenceRequests: {
    data: Array<{
      id: string
      project_id: string
      span: {
        from: string
        to: string
      }
      requester: string
      call_id: string | null
      via: 'email' | 'app' | 'api' | 'mcp'
      leaves_org: boolean
      reply_channel: 'email' | 'in_app' | null
      status: string
      received_at: string
      drafted_at: string | null
      approved_at: string | null
      replied_at: string | null
    }>
    next_cursor: string | null
  }
  createEvidenceRequest: {
    id: string
    project_id: string
    span: {
      from: string
      to: string
    }
    requester: string
    call_id: string | null
    via: 'email' | 'app' | 'api' | 'mcp'
    leaves_org: boolean
    reply_channel: 'email' | 'in_app' | null
    status: string
    received_at: string
    drafted_at: string | null
    approved_at: string | null
    replied_at: string | null
    pack: {
      project_id: string
      window_id: string | null
      readings: Array<{
        id: string
        source_id: string
        poll_id: string | null
        metric: string
        unit: string | null
        observed_at: string
        received_at: string
        value: number | null
        value_text: string | null
        value_json: Record<string, unknown> | null
        device_time: string | null
        item_key: string | null
        revision: string
        station_id: string
        source_url: string
      }>
      warnings: Array<{
        reading_id: string
        text: string
        gloss: string | null
        valid_from: string
        valid_to: string
      }>
      calls: Array<{
        id: string
        bundle_id: string
        window_id: string | null
        night_id: string | null
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: Array<string> | null
        fired: Array<{
          clause: string
          inputs: Array<string>
        }>
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        recipients: Array<string>
        notices: Array<{
          language: 'en' | 'ms'
          subject: string
          body: string
        }>
        reason: string
        state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
        shadow: {
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }
        chosen: string
        agrees: boolean
        decision: string | null
        expires_at: string
        triggered_at: string
        drafted_at: string
        approved_at: string | null
        sent_at: string | null
        superseded_by_call_id: string | null
        ics_uid: string | null
        ics_sequence: number
      }>
      approvals: Array<{
        id: string
        call_id: string | null
        approved_by: string
        approved_at: string
      }>
      grades: Array<{
        id: string
        call_id: string | null
        night_id: string | null
        outcome: string
        sheet_version_id: string
        pack: 'sky' | 'crowd'
        window_id: string | null
        proposed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        observed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        mode_diff: number
        no_call: boolean
        agrees: boolean
        stale_inputs: boolean
      }>
      ledger: Array<{
        id: string
        project_id: string
        seq: number
        kind:
          | 'call_approved'
          | 'call_edited'
          | 'call_rejected'
          | 'call_expired'
          | 'call_sent'
          | 'grade'
          | 'night_graded'
          | 'listing_listed'
          | 'listing_changed'
          | 'listing_cancelled'
          | 'clause_version'
          | 'window_cancelled'
          | 'evidence_replied'
          | 'crowd_reply'
          | 'correction'
        refs: Record<string, string>
        body: Record<string, unknown> | null
        prev_hash: string
        hash: string
        at: string
        corrects?: string
      }>
      frames: Array<{
        reading_id: string
        url: string
        captured_at: string
      }>
    } | null
  }
  getEvidenceRequest: {
    id: string
    project_id: string
    span: {
      from: string
      to: string
    }
    requester: string
    call_id: string | null
    via: 'email' | 'app' | 'api' | 'mcp'
    leaves_org: boolean
    reply_channel: 'email' | 'in_app' | null
    status: string
    received_at: string
    drafted_at: string | null
    approved_at: string | null
    replied_at: string | null
    pack: {
      project_id: string
      window_id: string | null
      readings: Array<{
        id: string
        source_id: string
        poll_id: string | null
        metric: string
        unit: string | null
        observed_at: string
        received_at: string
        value: number | null
        value_text: string | null
        value_json: Record<string, unknown> | null
        device_time: string | null
        item_key: string | null
        revision: string
        station_id: string
        source_url: string
      }>
      warnings: Array<{
        reading_id: string
        text: string
        gloss: string | null
        valid_from: string
        valid_to: string
      }>
      calls: Array<{
        id: string
        bundle_id: string
        window_id: string | null
        night_id: string | null
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: Array<string> | null
        fired: Array<{
          clause: string
          inputs: Array<string>
        }>
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        recipients: Array<string>
        notices: Array<{
          language: 'en' | 'ms'
          subject: string
          body: string
        }>
        reason: string
        state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
        shadow: {
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }
        chosen: string
        agrees: boolean
        decision: string | null
        expires_at: string
        triggered_at: string
        drafted_at: string
        approved_at: string | null
        sent_at: string | null
        superseded_by_call_id: string | null
        ics_uid: string | null
        ics_sequence: number
      }>
      approvals: Array<{
        id: string
        call_id: string | null
        approved_by: string
        approved_at: string
      }>
      grades: Array<{
        id: string
        call_id: string | null
        night_id: string | null
        outcome: string
        sheet_version_id: string
        pack: 'sky' | 'crowd'
        window_id: string | null
        proposed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        observed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        mode_diff: number
        no_call: boolean
        agrees: boolean
        stale_inputs: boolean
      }>
      ledger: Array<{
        id: string
        project_id: string
        seq: number
        kind:
          | 'call_approved'
          | 'call_edited'
          | 'call_rejected'
          | 'call_expired'
          | 'call_sent'
          | 'grade'
          | 'night_graded'
          | 'listing_listed'
          | 'listing_changed'
          | 'listing_cancelled'
          | 'clause_version'
          | 'window_cancelled'
          | 'evidence_replied'
          | 'crowd_reply'
          | 'correction'
        refs: Record<string, string>
        body: Record<string, unknown> | null
        prev_hash: string
        hash: string
        at: string
        corrects?: string
      }>
      frames: Array<{
        reading_id: string
        url: string
        captured_at: string
      }>
    } | null
  }
  listGrades: {
    data: Array<{
      id: string
      call_id: string | null
      night_id: string | null
      outcome:
        | 'hit'
        | 'miss'
        | 'false_alarm'
        | 'correct_normal'
        | 'no_call'
        | 'in_band'
        | 'out_of_band'
        | 'unlisted_surge'
        | 'pending'
      sheet_version_id: string
      pack: 'sky' | 'crowd'
      window_id: string | null
      proposed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      observed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      mode_diff: number
      no_call: boolean
      agrees: boolean
      stale_inputs: boolean
      forecast: {
        id: string
        night_id: string
        baseline: number
        uplift: number
        forecast: number
        band_low: number
        band_high: number
        created_at: string
        method: string
        reading_ids: Array<string>
      } | null
      actual: number | null
      reading_ids: Array<string>
      graded_at: string
      local_date?: string
      pending_until?: string | null
    }>
    next_cursor: string | null
  }
  listIcsFeeds: {
    data: Array<{
      id: string
      project_id: string
      url: string | null
      filename?: string
    }>
    next_cursor: string | null
  }
  createIcsFeed: {
    id: string
    project_id: string
    url: string | null
    filename?: string
  }
  deleteIcsFeed: {
    id: string
    project_id: string
    url: string | null
    filename?: string
  }
  getProjectIndicators: {
    project_id: string
    pack: 'sky' | 'crowd'
    t_eval: string
    inputs: Array<{
      state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
      since: string
      http_status: number | null
      pending_until: string | null
      source_id: string
      age_s: number | null
    }>
    site: Record<
      string,
      {
        name: string
        value: number | boolean | string | Array<number> | null
        unit: string
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string | null
        age_s: number | null
        source_ids: Array<string>
        source_url: string | null
        reading_ids: Array<string>
        observed_at: string | null
      }
    >
    series: Record<string, Array<[string, number | null, string]>>
    nights: Array<{
      night: {
        id: string
        project_id: string
        date: string
        state: 'upcoming' | 'in_progress' | 'awaiting_actuals' | 'graded' | 'unlisted'
        doors: string
        show: string
        arrival_start: string
        arrival_end: string
        exit_start: string | null
        exit_end: string | null
      }
      forecast: {
        id: string
        night_id: string
        baseline: number
        uplift: number
        forecast: number
        band_low: number
        band_high: number
        created_at: string
        method: string
        reading_ids: Array<string>
      } | null
      single_source: boolean
    }>
    registry_hash: string
    hash: string
  }
  ingestReadings:
    | {
        source_id: string
        accepted: number
        received_at: string
        camera_day_start: string
        camera_day_end: string
      }
    | {
        ok: true
        duplicate: true
      }
  listLedgerEntries: {
    data: Array<{
      id: string
      project_id: string
      seq: number
      kind:
        | 'call_approved'
        | 'call_edited'
        | 'call_rejected'
        | 'call_expired'
        | 'call_sent'
        | 'grade'
        | 'night_graded'
        | 'listing_listed'
        | 'listing_changed'
        | 'listing_cancelled'
        | 'clause_version'
        | 'window_cancelled'
        | 'evidence_replied'
        | 'crowd_reply'
        | 'correction'
      refs: Record<string, string>
      body: Record<string, unknown> | null
      prev_hash: string
      hash: string
      at: string
      corrects?: string
      pack: 'sky' | 'crowd' | null
      call: {
        id: string
        bundle_id: string
        window_id: string | null
        night_id: string | null
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: Array<string> | null
        fired: Array<{
          clause: string
          inputs: Array<string>
        }>
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        recipients: Array<string>
        notices: Array<{
          language: 'en' | 'ms'
          subject: string
          body: string
        }>
        reason: string
        state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
        shadow: {
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }
        chosen: string
        agrees: boolean
        decision: string | null
        expires_at: string
        triggered_at: string
        drafted_at: string
        approved_at: string | null
        sent_at: string | null
        superseded_by_call_id: string | null
        ics_uid: string | null
        ics_sequence: number
      } | null
      window: {
        id: string
        project_id: string
        starts_at: string
        ends_at: string
        title: string
        kind: 'class' | 'event' | 'commute_wave'
        tz: string
        declared_by: string
        guest: boolean
        via: 'app' | 'form' | 'ics' | 'api' | 'cli' | 'mcp' | 'guest' | 'share'
        expires_at: string | null
        series_id: string | null
        ics_feed_id: string | null
        cancelled_at: string | null
        share_link_id: string | null
        moderation: 'visible' | 'hidden_pending_review' | 'removed'
      } | null
      grade: {
        id: string
        call_id: string | null
        night_id: string | null
        outcome: string
        sheet_version_id: string
        pack: 'sky' | 'crowd'
        window_id: string | null
        proposed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        observed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        mode_diff: number
        no_call: boolean
        agrees: boolean
        stale_inputs: boolean
      } | null
      approver_role: 'owner' | 'admin' | 'approver' | 'editor' | 'viewer' | 'guest' | null
    }>
    next_cursor: string | null
    total: number
  }
  exportLedger: string
  verifyLedger: {
    valid: boolean
    checked_entries: number
    first_bad_entry_id: string | null
    head_hash: string
    verified_at: string
    first_bad?: {
      id: string
      seq: number
      reason: 'seq_gap' | 'prev_hash' | 'hash'
    }
  }
  listProjectListings: {
    data: Array<{
      id: string
      project_id: string
      listing_key: string
      source_url: string
      source_revision: string
      state: 'proposed' | 'listed' | 'rejected' | 'cancelled'
      class: string
      class_hint: string | null
      single_source: boolean
      historical: boolean
      night_id: string | null
      pending_change: Record<string, unknown> | null
    }>
    next_cursor: string | null
  }
  proposeListing: {
    id: string
    project_id: string
    listing_key: string
    source_url: string
    source_revision: string
    state: 'proposed' | 'listed' | 'rejected' | 'cancelled'
    class: string
    class_hint: string | null
    single_source: boolean
    historical: boolean
    night_id: string | null
    pending_change: Record<string, unknown> | null
  }
  listOrganisationListings: {
    data: Array<{
      id: string
      project_id: string
      listing_key: string
      source_url: string
      source_revision: string
      state: 'proposed' | 'listed' | 'rejected' | 'cancelled'
      class: string
      class_hint: string | null
      single_source: boolean
      historical: boolean
      night_id: string | null
      pending_change: Record<string, unknown> | null
    }>
    next_cursor: string | null
  }
  getMe: {
    account_id: string | null
    client: 'app' | 'api' | 'cli' | 'mcp' | 'playground' | 'worker'
    client_name: string | null
    principal_kind: 'session' | 'api_key' | 'oauth' | 'guest_token' | 'share_link' | 'device' | 'system'
    organization_id: string | null
    role: 'owner' | 'admin' | 'approver' | 'editor' | 'viewer' | 'guest' | null
    scopes: Array<'read' | 'draft' | 'admin' | 'ingest'>
  }
  listNights: {
    data: Array<{
      id: string
      project_id: string
      date: string
      state: 'upcoming' | 'in_progress' | 'awaiting_actuals' | 'graded' | 'unlisted'
      doors: string
      show: string
      arrival_start: string
      arrival_end: string
      exit_start: string | null
      exit_end: string | null
      forecast: {
        id: string
        night_id: string
        baseline: number
        uplift: number
        forecast: number
        band_low: number
        band_high: number
        created_at: string
        method: string
        reading_ids: Array<string>
      } | null
      show_name?: string
      source_url?: string
    }>
    next_cursor: string | null
  }
  getNight: {
    id: string
    project_id: string
    date: string
    state: 'upcoming' | 'in_progress' | 'awaiting_actuals' | 'graded' | 'unlisted'
    doors: string
    show: string
    arrival_start: string
    arrival_end: string
    exit_start: string | null
    exit_end: string | null
    forecast: {
      id: string
      night_id: string
      baseline: number
      uplift: number
      forecast: number
      band_low: number
      band_high: number
      created_at: string
      method: string
      reading_ids: Array<string>
    } | null
    show_name?: string
    source_url?: string
  }
  updateProjectPack: {
    pack: 'sky' | 'crowd'
    enabled: boolean
    sheet_id: string | null
    schedule: Record<string, unknown> | null
    sla_s: number | null
  }
  getPilotArchive: {
    data: Array<{
      project_id: string
      kind: 'sheets_ledger' | 'jira_register' | 'run_traces'
      url: string
      sha256: string
      captured_at: string
    }>
    next_cursor: string | null
    label?: string
  }
  listProjects: {
    data: Array<{
      id: string
      org_id: string
      name: string
      slug: string
      time_zone: string
      public: boolean
      semester_ends_on: string | null
      site_name: string | null
      site_lat: number | null
      site_lon: number | null
      archived_at: string | null
      camera_day_start: string | null
      camera_day_end: string | null
      warning_area_terms: Array<string>
      packs: Array<{
        pack: 'sky' | 'crowd'
        enabled: boolean
        sheet_id: string | null
        schedule: Record<string, unknown> | null
        sla_s: number | null
      }>
      summary?: {
        pack_states: Array<{
          pack: 'sky' | 'crowd'
          basis: 'approved_call' | 'engine_verdict' | null
          call_id: string | null
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
        }>
        windows_at_risk: number
        signal_health: {
          state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
          inputs_reporting: number
          oldest_age_s: number | null
        }
        latest_bundle: {
          id: string
          project_id: string
          run_id: string
          pack: 'sky' | 'crowd'
          state:
            | 'drafted'
            | 'closed'
            | 'needs_review'
            | 'superseded'
            | 'expired'
            | 'reconfirm'
            | 'approved'
            | 'sending'
            | 'sent'
            | 'graded'
          superseded_by: string | null
          review_hash: string
          sla_due_at: string | null
          needs_review_at: string | null
          approved_by: string | null
          escalation_level: number
          draft_only: boolean
          calls: Array<{
            id: string
            bundle_id: string
            window_id: string | null
            night_id: string | null
            mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
            watch: boolean
            no_call: Array<string> | null
            fired: Array<{
              clause: string
              inputs: Array<string>
            }>
            recommendations: Array<
              'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
            >
            recipients: Array<string>
            notices: Array<{
              language: 'en' | 'ms'
              subject: string
              body: string
            }>
            reason: string
            state:
              'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
            shadow: {
              scope: {
                kind: 'site' | 'window' | 'night'
                id: string | null
              }
              pack: 'sky' | 'crowd'
              mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
              watch: boolean
              no_call: {
                inputs: Array<{
                  name: string
                  source_id: string | null
                  state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
                  since: string
                }>
              } | null
              recommendations: Array<
                'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
              >
              clauses: Array<{
                key: string
                result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
                blocked_by: Array<{
                  name: string
                  source_id: string | null
                  state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
                  since: string
                }>
                span?: {
                  from: string
                  to: string
                  complete: boolean
                }
                inputs: Array<{
                  name: string
                  value: number | boolean | string | Array<number> | null
                  unit: string
                  state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
                  since: string | null
                  age_s: number | null
                  source_ids: Array<string>
                  source_url: string | null
                  reading_ids: Array<string>
                  observed_at: string | null
                }>
              }>
              open_from: string | null
            }
            chosen: string
            agrees: boolean
            decision: string | null
            expires_at: string
            triggered_at: string
            drafted_at: string
            approved_at: string | null
            sent_at: string | null
            superseded_by_call_id: string | null
            ics_uid: string | null
            ics_sequence: number
          }>
          missing?: Array<{
            window_id: string | null
            night_id: string | null
            shadow: {
              scope: {
                kind: 'site' | 'window' | 'night'
                id: string | null
              }
              pack: 'sky' | 'crowd'
              mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
              watch: boolean
              no_call: {
                inputs: Array<{
                  name: string
                  source_id: string | null
                  state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
                  since: string
                }>
              } | null
              recommendations: Array<
                'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
              >
              clauses: Array<{
                key: string
                result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
                blocked_by: Array<{
                  name: string
                  source_id: string | null
                  state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
                  since: string
                }>
                span?: {
                  from: string
                  to: string
                  complete: boolean
                }
                inputs: Array<{
                  name: string
                  value: number | boolean | string | Array<number> | null
                  unit: string
                  state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
                  since: string | null
                  age_s: number | null
                  source_ids: Array<string>
                  source_url: string | null
                  reading_ids: Array<string>
                  observed_at: string | null
                }>
              }>
              open_from: string | null
            }
            recipients: Array<string>
            resolution: 'drafted' | 'dismissed' | 'superseded' | null
            call_id: string | null
            reason: string | null
            resolved_by: string | null
            resolved_at: string | null
            superseded_by: string | null
          }>
        } | null
        next_night: {
          id: string
          project_id: string
          date: string
          state: 'upcoming' | 'in_progress' | 'awaiting_actuals' | 'graded' | 'unlisted'
          doors: string
          show: string
          arrival_start: string
          arrival_end: string
          exit_start: string | null
          exit_end: string | null
        } | null
        next_storm_date: string | null
        next_action: 'bind_source' | 'declare_window' | null
      }
    }>
    next_cursor: string | null
  }
  getProject: {
    id: string
    org_id: string
    name: string
    slug: string
    time_zone: string
    public: boolean
    semester_ends_on: string | null
    site_name: string | null
    site_lat: number | null
    site_lon: number | null
    archived_at: string | null
    camera_day_start: string | null
    camera_day_end: string | null
    warning_area_terms: Array<string>
    packs: Array<{
      pack: 'sky' | 'crowd'
      enabled: boolean
      sheet_id: string | null
      schedule: Record<string, unknown> | null
      sla_s: number | null
    }>
  }
  getPublicProjectStatus: {
    state_version: string
    project: {
      id: string
      slug: string
      org_slug: string
    }
    packs: Array<{
      pack: 'sky' | 'crowd'
      basis: 'approved_call' | 'engine_verdict' | null
      call_id: string | null
      mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      watch: boolean
      no_call: {
        inputs: Array<{
          name: string
          source_id: string | null
          state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
          since: string
        }>
      } | null
    }>
    verdicts: Array<{
      t_eval: string
      pack: 'sky' | 'crowd'
      content_hash: string
      snapshot_hash: string
      site: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }>
      windows: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }>
      nights: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }>
      hash: string
    }>
    strip: Array<{
      name: string
      value: number | boolean | string | Array<number> | null
      unit: string
      state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
      since: string | null
      age_s: number | null
      source_ids: Array<string>
      source_url: string | null
      reading_ids: Array<string>
      observed_at: string | null
    }>
  }
  listPublicProjectCalls: {
    data: Array<{
      id: string
      pack: 'sky' | 'crowd'
      state: 'approved' | 'sent'
      mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      watch: boolean
      window: {
        starts_at: string
        ends_at: string
      } | null
      fired: Array<{
        clause: string
        inputs: Array<{
          name: string
          value: number | boolean | string | Array<number> | null
          unit: string
          state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
          since: string | null
          age_s: number | null
          source_ids: Array<string>
          source_url: string | null
          reading_ids: Array<string>
          observed_at: string | null
        }>
      }>
      approver_role: 'owner' | 'admin' | 'approver' | 'editor' | 'viewer' | 'guest'
      approval_delay_s: number
      clause_version_n: number
      approved_at: string
      sent_at: string | null
      grade: {
        id: string
        call_id: string | null
        night_id: string | null
        outcome: string
        sheet_version_id: string
        pack: 'sky' | 'crowd'
        window_id: string | null
        proposed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        observed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        mode_diff: number
        no_call: boolean
        agrees: boolean
        stale_inputs: boolean
      } | null
    }>
    next_cursor: string | null
  }
  listPublicLedgerEntries: {
    data: Array<{
      id: string
      project_id: string
      seq: number
      kind:
        | 'call_approved'
        | 'call_edited'
        | 'call_rejected'
        | 'call_expired'
        | 'call_sent'
        | 'grade'
        | 'night_graded'
        | 'listing_listed'
        | 'listing_changed'
        | 'listing_cancelled'
        | 'clause_version'
        | 'window_cancelled'
        | 'evidence_replied'
        | 'crowd_reply'
        | 'correction'
      refs: Record<string, string>
      prev_hash: string
      hash: string
      at: string
      corrects?: string
      derived_values: Array<{
        name: string
        value: number | boolean | string | Array<number> | null
        unit: string
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string | null
        age_s: number | null
        source_ids: Array<string>
        source_url: string | null
        reading_ids: Array<string>
        observed_at: string | null
      }>
    }>
    next_cursor: string | null
  }
  listPublicGrades: {
    data: Array<{
      metric: string
      x: number | null
      value?: number | null
      n: number
      low: number | null
      high: number | null
      pack: 'sky' | 'crowd'
    }>
    next_cursor: string | null
  }
  listPublicCalendarEntries: {
    data: Array<{
      id: string
      call_id: string
      pack: 'sky' | 'crowd'
      kind: 'class' | 'event' | 'commute_wave'
      starts_at: string
      ends_at: string
      mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      watch: boolean
      permalink: string
    }>
    next_cursor: string | null
  }
  getPublicCall: {
    id: string
    pack: 'sky' | 'crowd'
    state: 'approved' | 'sent'
    mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
    watch: boolean
    window: {
      starts_at: string
      ends_at: string
    } | null
    fired: Array<{
      clause: string
      inputs: Array<{
        name: string
        value: number | boolean | string | Array<number> | null
        unit: string
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string | null
        age_s: number | null
        source_ids: Array<string>
        source_url: string | null
        reading_ids: Array<string>
        observed_at: string | null
      }>
    }>
    approver_role: 'owner' | 'admin' | 'approver' | 'editor' | 'viewer' | 'guest'
    approval_delay_s: number
    clause_version_n: number
    approved_at: string
    sent_at: string | null
    grade: {
      id: string
      call_id: string | null
      night_id: string | null
      outcome: string
      sheet_version_id: string
      pack: 'sky' | 'crowd'
      window_id: string | null
      proposed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      observed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      mode_diff: number
      no_call: boolean
      agrees: boolean
      stale_inputs: boolean
    } | null
  }
  getPublicWindow: {
    id: string
    call_id: string
    pack: 'sky' | 'crowd'
    kind: 'class' | 'event' | 'commute_wave'
    starts_at: string
    ends_at: string
    mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
    watch: boolean
    permalink: string
  }
  getPublicServiceStatus: {
    components: Array<{
      scope: 'ours' | 'source'
      component: string
      source_id: string | null
      ok: boolean
      checked_at: string
    }>
    incidents: Array<{
      id: string
      scope: 'ours' | 'source'
      component: string
      source_id: string | null
      status: string
      body: string
      created_at: string
      resolved_at: string | null
    }>
  }
  streamPublicProjectState: Response
  evaluatePublicProject: {
    label: 'Clause engine verdict: not reviewed, not sent'
    evaluated_at: string
    verdicts: Array<{
      t_eval: string
      pack: 'sky' | 'crowd'
      content_hash: string
      snapshot_hash: string
      site: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }>
      windows: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }>
      nights: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }>
      hash: string
    }>
    strip: Array<{
      name: string
      value: number | boolean | string | Array<number> | null
      unit: string
      state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
      since: string | null
      age_s: number | null
      source_ids: Array<string>
      source_url: string | null
      reading_ids: Array<string>
      observed_at: string | null
    }>
  }
  streamReadings: Response
  getReplay: {
    id: string
    label: 'replay'
    steps: Array<{
      t_eval: string
      verdicts: {
        t_eval: string
        pack: 'sky' | 'crowd'
        content_hash: string
        snapshot_hash: string
        site: Array<{
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }>
        windows: Array<{
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }>
        nights: Array<{
          scope: {
            kind: 'site' | 'window' | 'night'
            id: string | null
          }
          pack: 'sky' | 'crowd'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
          watch: boolean
          no_call: {
            inputs: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
          } | null
          recommendations: Array<
            'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
          >
          clauses: Array<{
            key: string
            result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
            blocked_by: Array<{
              name: string
              source_id: string | null
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string
            }>
            span?: {
              from: string
              to: string
              complete: boolean
            }
            inputs: Array<{
              name: string
              value: number | boolean | string | Array<number> | null
              unit: string
              state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
              since: string | null
              age_s: number | null
              source_ids: Array<string>
              source_url: string | null
              reading_ids: Array<string>
              observed_at: string | null
            }>
          }>
          open_from: string | null
        }>
        hash: string
      }
    }>
    summary: Record<string, number>
  }
  listReviewItems: {
    data: Array<{
      id: string
      grade_id: string
      state: string
      explanation: string
      grade: {
        id: string
        call_id: string | null
        night_id: string | null
        outcome: string
        sheet_version_id: string
        pack: 'sky' | 'crowd'
        window_id: string | null
        proposed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        observed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        mode_diff: number
        no_call: boolean
        agrees: boolean
        stale_inputs: boolean
      }
      reasons?: Array<'miss' | 'false_alarm' | 'expired_above_normal' | 'out_of_band' | 'unlisted_surge' | 'no_call'>
      explained_by?: string | null
      explained_at?: string | null
      opened_at?: string
    }>
    next_cursor: string | null
  }
  updateReviewItem: {
    id: string
    grade_id: string
    state: string
    explanation: string
    grade: {
      id: string
      call_id: string | null
      night_id: string | null
      outcome: string
      sheet_version_id: string
      pack: 'sky' | 'crowd'
      window_id: string | null
      proposed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      observed_mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      mode_diff: number
      no_call: boolean
      agrees: boolean
      stale_inputs: boolean
    }
    reasons?: Array<'miss' | 'false_alarm' | 'expired_above_normal' | 'out_of_band' | 'unlisted_surge' | 'no_call'>
    explained_by?: string | null
    explained_at?: string | null
    opened_at?: string
  }
  listRuns: {
    data: Array<{
      id: string
      project_id: string
      pack: 'sky' | 'crowd'
      trigger: 'schedule' | 'crossing' | 'window' | 'listing' | 'calendar' | 'request'
      dedupe_key: string
      sheet_version_id: string | null
      snapshot_id: string | null
      model: string | null
      fallback_used: boolean
      status: 'queued' | 'running' | 'drafted' | 'no_draft' | 'failed'
      reason: string | null
      trigger_ref: string | null
      window_ids: Array<string>
      verdict_hash: string | null
    }>
    next_cursor: string | null
  }
  createRun: {
    id: string
    project_id: string
    pack: 'sky' | 'crowd'
    trigger: 'schedule' | 'crossing' | 'window' | 'listing' | 'calendar' | 'request'
    dedupe_key: string
    sheet_version_id: string | null
    snapshot_id: string | null
    model: string | null
    fallback_used: boolean
    status: 'queued' | 'running' | 'drafted' | 'no_draft' | 'failed'
    reason: string | null
    trigger_ref: string | null
    window_ids: Array<string>
    verdict_hash: string | null
  }
  getRun: {
    id: string
    project_id: string
    pack: 'sky' | 'crowd'
    trigger: 'schedule' | 'crossing' | 'window' | 'listing' | 'calendar' | 'request'
    dedupe_key: string
    sheet_version_id: string | null
    snapshot_id: string | null
    model: string | null
    fallback_used: boolean
    status: 'queued' | 'running' | 'drafted' | 'no_draft' | 'failed'
    reason: string | null
    trigger_ref: string | null
    window_ids: Array<string>
    verdict_hash: string | null
    triggered_at?: string
    bundle_id?: string | null
    trace?: {
      text: string
      inputs: Array<{
        name: string
        value: number | boolean | string | Array<number> | null
        unit: string
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string | null
        age_s: number | null
        source_ids: Array<string>
        source_url: string | null
        reading_ids: Array<string>
        observed_at: string | null
      }>
      steps: Array<{
        step: string
        status: string
        started_at: string
        finished_at: string | null
      }>
    }
  }
  evaluateSandbox: {
    evaluated_at: string
    source: 'live' | 'replay'
    result: boolean | null
    type_errors: Array<{
      path: Array<string>
      message: string
    }>
    inputs: Array<{
      name: string
      value: number | boolean | string | Array<number> | null
      unit: string
      state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
      since: string | null
      age_s: number | null
      source_ids: Array<string>
      source_url: string | null
      reading_ids: Array<string>
      observed_at: string | null
    }>
  }
  searchOrganisation: {
    data: Array<{
      kind: 'project' | 'source' | 'window' | 'bundle' | 'call' | 'ledger'
      id: string
      label: string
      href: string
      project_id: string | null
      external_id: string | null
    }>
    next_cursor: string | null
  }
  bindSource: {
    id: string
    kind:
      | 'jps_rain'
      | 'met_warning'
      | 'met_forecast'
      | 'apims'
      | 'rapidrail_od'
      | 'gtfs_static'
      | 'gtfs_rt'
      | 'golive'
      | 'wikipedia'
      | 'camera'
      | 'pi'
    external_id: string
    owner_org_id: string | null
    name: string
    lat: number | null
    lon: number | null
    url: string
    cadence_s: number
    stale_after_s: number
    licence_id: string
    licence_label: string
    project_id: string
    role:
      | 'rain_gauge'
      | 'api_station'
      | 'warnings'
      | 'met_forecast'
      | 'rail_station'
      | 'venue_listings'
      | 'bus_feed'
      | 'gtfs_static'
      | 'camera'
      | 'pi'
    state: {
      state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
      since: string
      http_status: number | null
      pending_until: string | null
    }
    latest_reading: {
      id: string
      source_id: string
      poll_id: string | null
      metric: string
      unit: string | null
      observed_at: string
      received_at: string
      value: number | null
      value_text: string | null
      value_json: Record<string, unknown> | null
      device_time: string | null
      item_key: string | null
      revision: string
    } | null
    age_s: number | null
    recent_errors: Array<{
      id: string
      source_id: string
      started_at: string
      http_status: number | null
      latency_ms: number
      outcome: string
      request_id: string
      error_code: string | null
    }>
  }
  listProjectSources: {
    data: Array<{
      id: string
      kind:
        | 'jps_rain'
        | 'met_warning'
        | 'met_forecast'
        | 'apims'
        | 'rapidrail_od'
        | 'gtfs_static'
        | 'gtfs_rt'
        | 'golive'
        | 'wikipedia'
        | 'camera'
        | 'pi'
      external_id: string
      owner_org_id: string | null
      name: string
      lat: number | null
      lon: number | null
      url: string
      cadence_s: number
      stale_after_s: number
      licence_id: string
      licence_label: string
      project_id: string
      role:
        | 'rain_gauge'
        | 'api_station'
        | 'warnings'
        | 'met_forecast'
        | 'rail_station'
        | 'venue_listings'
        | 'bus_feed'
        | 'gtfs_static'
        | 'camera'
        | 'pi'
      state: {
        state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
        since: string
        http_status: number | null
        pending_until: string | null
      }
      latest_reading: {
        id: string
        source_id: string
        poll_id: string | null
        metric: string
        unit: string | null
        observed_at: string
        received_at: string
        value: number | null
        value_text: string | null
        value_json: Record<string, unknown> | null
        device_time: string | null
        item_key: string | null
        revision: string
      } | null
      age_s: number | null
      recent_errors: Array<{
        id: string
        source_id: string
        started_at: string
        http_status: number | null
        latency_ms: number
        outcome: string
        request_id: string
        error_code: string | null
      }>
    }>
    next_cursor: string | null
  }
  unbindSource: undefined
  rotateDeviceToken: {
    source_id: string
    token: string
    scope: 'ingest'
  }
  listSourceReadings: {
    data: Array<{
      id: string
      source_id: string
      poll_id: string | null
      metric: string
      unit: string | null
      observed_at: string
      received_at: string
      value: number | null
      value_text: string | null
      value_json: Record<string, unknown> | null
      device_time: string | null
      item_key: string | null
      revision: string
    }>
    next_cursor: string | null
  }
  listSourcePolls: {
    data: Array<{
      id: string
      source_id: string
      started_at: string
      http_status: number | null
      latency_ms: number
      outcome: string
      request_id: string
      error_code: string | null
    }>
    next_cursor: string | null
  }
  getProjectStrip: {
    project_id: string
    range: {
      from: string
      to: string
    }
    window: {
      id: string
      project_id: string
      starts_at: string
      ends_at: string
      title: string
      kind: 'class' | 'event' | 'commute_wave'
      tz: string
      declared_by: string
      guest: boolean
      via: 'app' | 'form' | 'ics' | 'api' | 'cli' | 'mcp' | 'guest' | 'share'
      expires_at: string | null
      series_id: string | null
      ics_feed_id: string | null
      cancelled_at: string | null
      share_link_id: string | null
      moderation: 'visible' | 'hidden_pending_review' | 'removed'
    } | null
    series: Record<string, Array<[string, number | null, string]>>
    inputs: Array<{
      name: string
      value: number | boolean | string | Array<number> | null
      unit: string
      state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
      since: string | null
      age_s: number | null
      source_ids: Array<string>
      source_url: string | null
      reading_ids: Array<string>
      observed_at: string | null
    }>
    packs: Array<{
      pack: 'sky' | 'crowd'
      basis: 'approved_call' | 'engine_verdict' | null
      call_id: string | null
      mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      watch: boolean
      no_call: {
        inputs: Array<{
          name: string
          source_id: string | null
          state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
          since: string
        }>
      } | null
    }>
    verdicts: Array<{
      t_eval: string
      pack: 'sky' | 'crowd'
      content_hash: string
      snapshot_hash: string
      site: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }>
      windows: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }>
      nights: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
        }>
        open_from: string | null
      }>
      hash: string
    }>
    nights: Array<{
      id: string
      project_id: string
      date: string
      state: 'upcoming' | 'in_progress' | 'awaiting_actuals' | 'graded' | 'unlisted'
      doors: string
      show: string
      arrival_start: string
      arrival_end: string
      exit_start: string | null
      exit_end: string | null
    }>
    replay?: {
      source: string
      captured_at: string
    }
  }
  createSubscribeLink: {
    id: string
    project_id: string
    url: string
  }
  getSubscriberCounts: {
    total: number
    confirmed: number
    unconfirmed: number
    suppressed: number
    bounced: number
    complained: number
    unsubscribed: number
    by_window: Array<{
      window_id: string
      count: number
    }>
    by_channel: Array<{
      channel: 'email' | 'ics' | 'webhook' | 'in_app'
      count: number
    }>
  }
  listSubscribers: {
    data: Array<{
      id: string
      project_id: string
      email: string
      role: string
      window_ids: Array<string>
      channels: Array<'email' | 'ics' | 'webhook' | 'in_app'>
      language: 'en' | 'ms'
      confirmed_at: string | null
      status: 'confirmed' | 'unconfirmed' | 'bounced' | 'complained' | 'suppressed' | 'unsubscribed'
      suppressed: boolean
      last_notice_at: string | null
      consent: {
        at: string
        form: string
        notice_version: string
        language: 'en' | 'ms'
      } | null
    }>
    next_cursor: string | null
  }
  createSubscriber: {
    id: string
    project_id: string
    email: string
    role: string
    window_ids: Array<string>
    channels: Array<'email' | 'ics' | 'webhook' | 'in_app'>
    language: 'en' | 'ms'
    confirmed_at: string | null
    status: 'confirmed' | 'unconfirmed' | 'bounced' | 'complained' | 'suppressed' | 'unsubscribed'
    suppressed: boolean
    last_notice_at: string | null
    consent: {
      at: string
      form: string
      notice_version: string
      language: 'en' | 'ms'
    } | null
  }
  deleteSubscriber: undefined
  getUsage: {
    period_start: string
    period_end: string
    totals: {
      runs: number
      tokens_in: number
      tokens_out: number
      estimated_cost_myr: number | null
    }
    data: Array<{
      run_id: string | null
      ai_key_id: string | null
      model: string
      tokens_in: number
      tokens_out: number
      estimated_cost_myr: number | null
    }>
    next_cursor: string | null
  }
  getProjectVerdicts: {
    project_id: string
    packs: Array<{
      t_eval: string
      pack: 'sky' | 'crowd'
      content_hash: string
      snapshot_hash: string
      site: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
          last_fired_at: string | null
        }>
        open_from: string | null
      }>
      windows: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
          last_fired_at: string | null
        }>
        open_from: string | null
      }>
      nights: Array<{
        scope: {
          kind: 'site' | 'window' | 'night'
          id: string | null
        }
        pack: 'sky' | 'crowd'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        watch: boolean
        no_call: {
          inputs: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
        } | null
        recommendations: Array<
          'keep_with_advisory' | 'shift_start' | 'shift_end' | 'ask_shuttle' | 'leave_before_doors'
        >
        clauses: Array<{
          key: string
          result: 'fired' | 'not_fired' | 'blocked' | 'not_open'
          blocked_by: Array<{
            name: string
            source_id: string | null
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string
          }>
          span?: {
            from: string
            to: string
            complete: boolean
          }
          inputs: Array<{
            name: string
            value: number | boolean | string | Array<number> | null
            unit: string
            state: 'fresh' | 'stale' | 'error' | 'recovered' | 'pending' | 'probation' | 'off_hours'
            since: string | null
            age_s: number | null
            source_ids: Array<string>
            source_url: string | null
            reading_ids: Array<string>
            observed_at: string | null
          }>
          last_fired_at: string | null
        }>
        open_from: string | null
      }>
      hash: string
    }>
  }
  listWebhooks: {
    data: Array<{
      id: string
      url: string
      events: Array<
        | 'source.error'
        | 'source.stale'
        | 'source.recovered'
        | 'crossing.detected'
        | 'run.completed'
        | 'run.failed'
        | 'bundle.drafted'
        | 'bundle.needs_review'
        | 'bundle.escalated'
        | 'bundle.approved'
        | 'bundle.superseded'
        | 'bundle.expired'
        | 'call.sent'
        | 'call.graded'
        | 'listing.proposed'
        | 'listing.listed'
        | 'listing.changed'
        | 'night.graded'
        | 'review_item.opened'
        | 'evidence_request.answered'
      >
      project_ids: Array<string>
      disabled_at: string | null
      verified_at: string | null
      status: string
      last_delivery_at?: string | null
    }>
    next_cursor: string | null
  }
  createWebhook: {
    id: string
    url: string
    events: Array<
      | 'source.error'
      | 'source.stale'
      | 'source.recovered'
      | 'crossing.detected'
      | 'run.completed'
      | 'run.failed'
      | 'bundle.drafted'
      | 'bundle.needs_review'
      | 'bundle.escalated'
      | 'bundle.approved'
      | 'bundle.superseded'
      | 'bundle.expired'
      | 'call.sent'
      | 'call.graded'
      | 'listing.proposed'
      | 'listing.listed'
      | 'listing.changed'
      | 'night.graded'
      | 'review_item.opened'
      | 'evidence_request.answered'
    >
    project_ids: Array<string>
    disabled_at: string | null
    verified_at: string | null
    status: string
    last_delivery_at?: string | null
    secret: string
  }
  getWebhook: {
    id: string
    url: string
    events: Array<
      | 'source.error'
      | 'source.stale'
      | 'source.recovered'
      | 'crossing.detected'
      | 'run.completed'
      | 'run.failed'
      | 'bundle.drafted'
      | 'bundle.needs_review'
      | 'bundle.escalated'
      | 'bundle.approved'
      | 'bundle.superseded'
      | 'bundle.expired'
      | 'call.sent'
      | 'call.graded'
      | 'listing.proposed'
      | 'listing.listed'
      | 'listing.changed'
      | 'night.graded'
      | 'review_item.opened'
      | 'evidence_request.answered'
    >
    project_ids: Array<string>
    disabled_at: string | null
    verified_at: string | null
    status: string
    last_delivery_at?: string | null
  }
  updateWebhook: {
    id: string
    url: string
    events: Array<
      | 'source.error'
      | 'source.stale'
      | 'source.recovered'
      | 'crossing.detected'
      | 'run.completed'
      | 'run.failed'
      | 'bundle.drafted'
      | 'bundle.needs_review'
      | 'bundle.escalated'
      | 'bundle.approved'
      | 'bundle.superseded'
      | 'bundle.expired'
      | 'call.sent'
      | 'call.graded'
      | 'listing.proposed'
      | 'listing.listed'
      | 'listing.changed'
      | 'night.graded'
      | 'review_item.opened'
      | 'evidence_request.answered'
    >
    project_ids: Array<string>
    disabled_at: string | null
    verified_at: string | null
    status: string
    last_delivery_at?: string | null
  }
  deleteWebhook: undefined
  verifyWebhook: {
    id: string
    url: string
    events: Array<
      | 'source.error'
      | 'source.stale'
      | 'source.recovered'
      | 'crossing.detected'
      | 'run.completed'
      | 'run.failed'
      | 'bundle.drafted'
      | 'bundle.needs_review'
      | 'bundle.escalated'
      | 'bundle.approved'
      | 'bundle.superseded'
      | 'bundle.expired'
      | 'call.sent'
      | 'call.graded'
      | 'listing.proposed'
      | 'listing.listed'
      | 'listing.changed'
      | 'night.graded'
      | 'review_item.opened'
      | 'evidence_request.answered'
    >
    project_ids: Array<string>
    disabled_at: string | null
    verified_at: string | null
    status: string
    last_delivery_at?: string | null
  }
  redeliverWebhook: {
    dispatch_id: string
    event_id: string
    state: string
  }
  listWebhookDeliveries: {
    data: Array<{
      id: string
      event_id: string
      dispatch_id: string
      attempt: number
      status_code: number | null
      latency_ms: number
      state: string
      attempted_at: string
      request_headers: Record<string, string>
      request_body:
        | {
            id: string
            type: 'source.error'
            created_at: string
            org_id: string
            project_id: string
            data: {
              source_id: string
              state: 'error'
              since: string
              http_status: number | null
            }
          }
        | {
            id: string
            type: 'source.stale'
            created_at: string
            org_id: string
            project_id: string
            data: {
              source_id: string
              state: 'stale'
              since: string
              http_status: number | null
            }
          }
        | {
            id: string
            type: 'source.recovered'
            created_at: string
            org_id: string
            project_id: string
            data: {
              source_id: string
              state: 'recovered'
              since: string
              http_status: number | null
            }
          }
        | {
            id: string
            type: 'crossing.detected'
            created_at: string
            org_id: string
            project_id: string
            data: {
              crossing_id: string
              pack: 'sky' | 'crowd'
              scope: {
                kind: 'site' | 'window' | 'night'
                id: string | null
              }
              from: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
              to: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
              at: string
              snapshot_id: string
              verdict_hash: string
            }
          }
        | {
            id: string
            type: 'run.completed'
            created_at: string
            org_id: string
            project_id: string
            data: {
              run_id: string
              pack: 'sky' | 'crowd'
              trigger: 'schedule' | 'crossing' | 'listing' | 'calendar' | 'request'
              bundle_id: string
              shadow_mode: boolean
            }
          }
        | {
            id: string
            type: 'run.failed'
            created_at: string
            org_id: string
            project_id: string
            data: {
              run_id: string
              pack: 'sky' | 'crowd'
              trigger: 'schedule' | 'crossing' | 'listing' | 'calendar' | 'request'
              reason: string
              shadow_mode: boolean
            }
          }
        | {
            id: string
            type: 'bundle.drafted'
            created_at: string
            org_id: string
            project_id: string
            data: {
              bundle_id: string
              pack: 'sky' | 'crowd'
              state: 'drafted' | 'needs_review' | 'superseded' | 'expired' | 'escalated' | 'approved'
              call_ids: Array<string>
              sla_due_at: string | null
            }
          }
        | {
            id: string
            type: 'bundle.needs_review'
            created_at: string
            org_id: string
            project_id: string
            data: {
              bundle_id: string
              pack: 'sky' | 'crowd'
              state: 'drafted' | 'needs_review' | 'superseded' | 'expired' | 'escalated' | 'approved'
              call_ids: Array<string>
              sla_due_at: string | null
            }
          }
        | {
            id: string
            type: 'bundle.superseded'
            created_at: string
            org_id: string
            project_id: string
            data: {
              bundle_id: string
              pack: 'sky' | 'crowd'
              state: 'drafted' | 'needs_review' | 'superseded' | 'expired' | 'escalated' | 'approved'
              call_ids: Array<string>
              sla_due_at: string | null
            }
          }
        | {
            id: string
            type: 'bundle.expired'
            created_at: string
            org_id: string
            project_id: string
            data: {
              bundle_id: string
              pack: 'sky' | 'crowd'
              state: 'drafted' | 'needs_review' | 'superseded' | 'expired' | 'escalated' | 'approved'
              call_ids: Array<string>
              sla_due_at: string | null
            }
          }
        | {
            id: string
            type: 'bundle.escalated'
            created_at: string
            org_id: string
            project_id: string
            data: {
              bundle_id: string
              pack: 'sky' | 'crowd'
              state: 'drafted' | 'needs_review' | 'superseded' | 'expired' | 'escalated' | 'approved'
              call_ids: Array<string>
              sla_due_at: string | null
              level: 'next_approver' | 'admins'
            }
          }
        | {
            id: string
            type: 'bundle.approved'
            created_at: string
            org_id: string
            project_id: string
            data: {
              bundle_id: string
              pack: 'sky' | 'crowd'
              state: 'drafted' | 'needs_review' | 'superseded' | 'expired' | 'escalated' | 'approved'
              call_ids: Array<string>
              sla_due_at: string | null
              sending_call_ids: Array<string>
              rejected_call_ids: Array<string>
            }
          }
        | {
            id: string
            type: 'call.sent'
            created_at: string
            org_id: string
            project_id: string
            data: {
              call_id: string
              mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
              outcome: string
            }
          }
        | {
            id: string
            type: 'call.graded'
            created_at: string
            org_id: string
            project_id: string
            data: {
              call_id: string
              outcome:
                | 'hit'
                | 'miss'
                | 'false_alarm'
                | 'correct_normal'
                | 'no_call'
                | 'in_band'
                | 'out_of_band'
                | 'unlisted_surge'
                | 'pending'
            }
          }
        | {
            id: string
            type: 'night.graded'
            created_at: string
            org_id: string
            project_id: string
            data: {
              night_id: string
              outcome:
                | 'hit'
                | 'miss'
                | 'false_alarm'
                | 'correct_normal'
                | 'no_call'
                | 'in_band'
                | 'out_of_band'
                | 'unlisted_surge'
                | 'pending'
            }
          }
        | {
            id: string
            type: 'review_item.opened'
            created_at: string
            org_id: string
            project_id: string
            data: {
              review_item_id: string
              outcome:
                | 'hit'
                | 'miss'
                | 'false_alarm'
                | 'correct_normal'
                | 'no_call'
                | 'in_band'
                | 'out_of_band'
                | 'unlisted_surge'
                | 'pending'
            }
          }
        | {
            id: string
            type: 'listing.proposed'
            created_at: string
            org_id: string
            project_id: string
            data: {
              listing_id: string
              state: 'proposed' | 'listed' | 'rejected' | 'cancelled' | 'unlisted'
              night_id: string
            }
          }
        | {
            id: string
            type: 'listing.listed'
            created_at: string
            org_id: string
            project_id: string
            data: {
              listing_id: string
              state: 'proposed' | 'listed' | 'rejected' | 'cancelled' | 'unlisted'
              night_id: string
            }
          }
        | {
            id: string
            type: 'listing.changed'
            created_at: string
            org_id: string
            project_id: string
            data: {
              listing_id: string
              state: 'proposed' | 'listed' | 'rejected' | 'cancelled' | 'unlisted'
              night_id: string
            }
          }
        | {
            id: string
            type: 'evidence_request.answered'
            created_at: string
            org_id: string
            project_id: string
            data: {
              evidence_request_id: string
              reply_channel: 'email' | 'app' | 'api' | 'mcp'
            }
          }
        | {
            id: string
            type: 'window.created'
            created_at: string
            org_id: string
            project_id: string
            data: {
              window_id: string
              via: 'form' | 'ics' | 'm365' | 'api' | 'cli' | 'mcp' | 'guest' | 'share'
              times_changed: boolean
              series_id: string | null
            }
          }
        | {
            id: string
            type: 'window.updated'
            created_at: string
            org_id: string
            project_id: string
            data: {
              window_id: string
              via: 'form' | 'ics' | 'm365' | 'api' | 'cli' | 'mcp' | 'guest' | 'share'
              times_changed: boolean
              series_id: string | null
            }
          }
        | {
            id: string
            type: 'window.cancelled'
            created_at: string
            org_id: string
            project_id: string
            data: {
              window_id: string
              via: 'form' | 'ics' | 'm365' | 'api' | 'cli' | 'mcp' | 'guest' | 'share'
              times_changed: boolean
              series_id: string | null
            }
          }
        | {
            id: string
            type: 'poll.recorded'
            created_at: string
            org_id: string
            project_id: string
            data: {
              source_id: string
              poll_id: string
              outcome: string
              http_status: number | null
              new_rows: number
            }
          }
        | {
            id: string
            type: 'source.bound'
            created_at: string
            org_id: string
            project_id: string
            data: {
              source_id: string
              role: string
            }
          }
        | {
            id: string
            type: 'source.unbound'
            created_at: string
            org_id: string
            project_id: string
            data: {
              source_id: string
              role: string
            }
          }
        | {
            id: string
            type: 'clause_sheet.published'
            created_at: string
            org_id: string
            project_id: string
            data: {
              sheet_id: string
              pack: 'sky' | 'crowd'
              version_n: number
            }
          }
      response_headers: Record<string, string>
      response_body: string | null
      raw_request_body?: string
      error?: string | null
      next_retry_at?: string | null
    }>
    next_cursor: string | null
  }
  listWindows: {
    data: Array<{
      id: string
      project_id: string
      starts_at: string
      ends_at: string
      title: string
      kind: 'class' | 'event' | 'commute_wave'
      tz: string
      declared_by: string
      guest: boolean
      via: 'app' | 'form' | 'ics' | 'api' | 'cli' | 'mcp' | 'guest' | 'share'
      expires_at: string | null
      series_id: string | null
      ics_feed_id: string | null
      cancelled_at: string | null
      share_link_id: string | null
      moderation: 'visible' | 'hidden_pending_review' | 'removed'
      at_risk?: boolean
      recurrence?: {
        frequency: 'weekly'
        days_of_week: Array<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'>
        until?: string
        count?: number
        skip_dates: Array<string>
      } | null
      latest_calls: {
        sky: {
          id: string
          bundle_id: string
          state:
            'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        } | null
        crowd: {
          id: string
          bundle_id: string
          state:
            'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
          mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
        } | null
      }
    }>
    next_cursor: string | null
  }
  createWindow: {
    id: string
    project_id: string
    starts_at: string
    ends_at: string
    title: string
    kind: 'class' | 'event' | 'commute_wave'
    tz: string
    declared_by: string
    guest: boolean
    via: 'app' | 'form' | 'ics' | 'api' | 'cli' | 'mcp' | 'guest' | 'share'
    expires_at: string | null
    series_id: string | null
    ics_feed_id: string | null
    cancelled_at: string | null
    share_link_id: string | null
    moderation: 'visible' | 'hidden_pending_review' | 'removed'
    at_risk?: boolean
    recurrence?: {
      frequency: 'weekly'
      days_of_week: Array<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'>
      until?: string
      count?: number
      skip_dates: Array<string>
    } | null
    latest_calls: {
      sky: {
        id: string
        bundle_id: string
        state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      } | null
      crowd: {
        id: string
        bundle_id: string
        state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      } | null
    }
  }
  updateWindow: {
    id: string
    project_id: string
    starts_at: string
    ends_at: string
    title: string
    kind: 'class' | 'event' | 'commute_wave'
    tz: string
    declared_by: string
    guest: boolean
    via: 'app' | 'form' | 'ics' | 'api' | 'cli' | 'mcp' | 'guest' | 'share'
    expires_at: string | null
    series_id: string | null
    ics_feed_id: string | null
    cancelled_at: string | null
    share_link_id: string | null
    moderation: 'visible' | 'hidden_pending_review' | 'removed'
    at_risk?: boolean
    recurrence?: {
      frequency: 'weekly'
      days_of_week: Array<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'>
      until?: string
      count?: number
      skip_dates: Array<string>
    } | null
    latest_calls: {
      sky: {
        id: string
        bundle_id: string
        state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      } | null
      crowd: {
        id: string
        bundle_id: string
        state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      } | null
    }
  }
  cancelWindow: {
    id: string
    project_id: string
    starts_at: string
    ends_at: string
    title: string
    kind: 'class' | 'event' | 'commute_wave'
    tz: string
    declared_by: string
    guest: boolean
    via: 'app' | 'form' | 'ics' | 'api' | 'cli' | 'mcp' | 'guest' | 'share'
    expires_at: string | null
    series_id: string | null
    ics_feed_id: string | null
    cancelled_at: string | null
    share_link_id: string | null
    moderation: 'visible' | 'hidden_pending_review' | 'removed'
    at_risk?: boolean
    recurrence?: {
      frequency: 'weekly'
      days_of_week: Array<'monday' | 'tuesday' | 'wednesday' | 'thursday' | 'friday' | 'saturday' | 'sunday'>
      until?: string
      count?: number
      skip_dates: Array<string>
    } | null
    latest_calls: {
      sky: {
        id: string
        bundle_id: string
        state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      } | null
      crowd: {
        id: string
        bundle_id: string
        state: 'drafted' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded' | 'sending' | 'sent' | 'failed'
        mode: 'normal' | 'outdoor_limited' | 'commute_disruption' | 'hybrid_recommended' | 'surge_night' | null
      } | null
    }
  }
  createWindowReport: {
    window_id: string
    report_count: number
    moderation: 'visible' | 'hidden_pending_review' | 'removed'
  }
}

export type OperationMetadataById = {
  getProjectAnalysis: { method: 'GET'; path: '/v1/projects/{id}/analysis'; idempotent: false; eventStream: false }
  getOrganisationAnalysis: { method: 'GET'; path: '/v1/analysis'; idempotent: false; eventStream: false }
  evaluateWhatIf: { method: 'POST'; path: '/v1/projects/{id}/analysis/what-if'; idempotent: false; eventStream: false }
  listProjectBundles: { method: 'GET'; path: '/v1/projects/{id}/bundles'; idempotent: false; eventStream: false }
  streamBundles: { method: 'GET'; path: '/v1/projects/{id}/bundles/stream'; idempotent: false; eventStream: true }
  getBundle: { method: 'GET'; path: '/v1/bundles/{id}'; idempotent: false; eventStream: false }
  listOrganisationBundles: { method: 'GET'; path: '/v1/bundles'; idempotent: false; eventStream: false }
  listProjectCalls: { method: 'GET'; path: '/v1/projects/{id}/calls'; idempotent: false; eventStream: false }
  getCall: { method: 'GET'; path: '/v1/calls/{id}'; idempotent: false; eventStream: false }
  getCallExplanation: { method: 'GET'; path: '/v1/calls/{id}/explanation'; idempotent: false; eventStream: false }
  listCatalogueSources: { method: 'GET'; path: '/v1/catalogue/sources'; idempotent: false; eventStream: false }
  listChannels: { method: 'GET'; path: '/v1/projects/{id}/channels'; idempotent: false; eventStream: false }
  previewChannels: { method: 'GET'; path: '/v1/projects/{id}/channels/preview'; idempotent: false; eventStream: false }
  updateChannel: {
    method: 'PATCH'
    path: '/v1/projects/{id}/channels/{channel}'
    idempotent: false
    eventStream: false
  }
  listClauseSheets: { method: 'GET'; path: '/v1/projects/{id}/clause-sheets'; idempotent: false; eventStream: false }
  listClauseSheetVersions: {
    method: 'GET'
    path: '/v1/clause-sheets/{id}/versions'
    idempotent: false
    eventStream: false
  }
  getClauseSheetVersion: {
    method: 'GET'
    path: '/v1/clause-sheets/{id}/versions/{n}'
    idempotent: false
    eventStream: false
  }
  getClauseSheetDiff: { method: 'GET'; path: '/v1/clause-sheets/{id}/diff'; idempotent: false; eventStream: false }
  evaluateClauseSheet: {
    method: 'POST'
    path: '/v1/clause-sheets/{id}/evaluate'
    idempotent: false
    eventStream: false
  }
  listClauseSheetDrafts: { method: 'GET'; path: '/v1/clause-sheets/{id}/drafts'; idempotent: false; eventStream: false }
  createClauseSheetDraft: {
    method: 'POST'
    path: '/v1/clause-sheets/{id}/drafts'
    idempotent: true
    eventStream: false
  }
  getClauseSheetDraft: {
    method: 'GET'
    path: '/v1/clause-sheets/{id}/drafts/{draftId}'
    idempotent: false
    eventStream: false
  }
  deleteClauseSheetDraft: {
    method: 'DELETE'
    path: '/v1/clause-sheets/{id}/drafts/{draftId}'
    idempotent: false
    eventStream: false
  }
  createReplay: { method: 'POST'; path: '/v1/clause-sheets/{id}/replay'; idempotent: true; eventStream: false }
  getCommonsBudget: { method: 'GET'; path: '/v1/commons/budget'; idempotent: false; eventStream: false }
  getDashboard: { method: 'GET'; path: '/v1/dashboard'; idempotent: false; eventStream: false }
  listProjectDays: { method: 'GET'; path: '/v1/projects/{id}/days'; idempotent: false; eventStream: false }
  createDevice: { method: 'POST'; path: '/v1/projects/{id}/devices'; idempotent: true; eventStream: false }
  streamOrganisationEvents: { method: 'GET'; path: '/v1/events/stream'; idempotent: false; eventStream: true }
  listEvidenceRequests: {
    method: 'GET'
    path: '/v1/projects/{id}/evidence-requests'
    idempotent: false
    eventStream: false
  }
  createEvidenceRequest: {
    method: 'POST'
    path: '/v1/projects/{id}/evidence-requests'
    idempotent: true
    eventStream: false
  }
  getEvidenceRequest: { method: 'GET'; path: '/v1/evidence-requests/{id}'; idempotent: false; eventStream: false }
  listGrades: { method: 'GET'; path: '/v1/projects/{id}/grades'; idempotent: false; eventStream: false }
  listIcsFeeds: { method: 'GET'; path: '/v1/projects/{id}/ics-feeds'; idempotent: false; eventStream: false }
  createIcsFeed: { method: 'POST'; path: '/v1/projects/{id}/ics-feeds'; idempotent: true; eventStream: false }
  deleteIcsFeed: { method: 'DELETE'; path: '/v1/ics-feeds/{id}'; idempotent: false; eventStream: false }
  getProjectIndicators: { method: 'GET'; path: '/v1/projects/{id}/indicators'; idempotent: false; eventStream: false }
  ingestReadings: { method: 'POST'; path: '/v1/ingest/{sourceId}'; idempotent: true; eventStream: false }
  listLedgerEntries: { method: 'GET'; path: '/v1/projects/{id}/ledger'; idempotent: false; eventStream: false }
  exportLedger: { method: 'GET'; path: '/v1/projects/{id}/ledger/export'; idempotent: false; eventStream: false }
  verifyLedger: { method: 'GET'; path: '/v1/projects/{id}/ledger/verify'; idempotent: false; eventStream: false }
  listProjectListings: { method: 'GET'; path: '/v1/projects/{id}/listings'; idempotent: false; eventStream: false }
  proposeListing: { method: 'POST'; path: '/v1/projects/{id}/listings'; idempotent: true; eventStream: false }
  listOrganisationListings: { method: 'GET'; path: '/v1/listings'; idempotent: false; eventStream: false }
  getMe: { method: 'GET'; path: '/v1/me'; idempotent: false; eventStream: false }
  listNights: { method: 'GET'; path: '/v1/projects/{id}/nights'; idempotent: false; eventStream: false }
  getNight: { method: 'GET'; path: '/v1/nights/{id}'; idempotent: false; eventStream: false }
  updateProjectPack: { method: 'PATCH'; path: '/v1/projects/{id}/packs/{pack}'; idempotent: false; eventStream: false }
  getPilotArchive: { method: 'GET'; path: '/v1/projects/{id}/pilot-archive'; idempotent: false; eventStream: false }
  listProjects: { method: 'GET'; path: '/v1/projects'; idempotent: false; eventStream: false }
  getProject: { method: 'GET'; path: '/v1/projects/{id}'; idempotent: false; eventStream: false }
  getPublicProjectStatus: {
    method: 'GET'
    path: '/v1/public/{org}/{project}/status'
    idempotent: false
    eventStream: false
  }
  listPublicProjectCalls: {
    method: 'GET'
    path: '/v1/public/{org}/{project}/calls'
    idempotent: false
    eventStream: false
  }
  listPublicLedgerEntries: {
    method: 'GET'
    path: '/v1/public/{org}/{project}/ledger'
    idempotent: false
    eventStream: false
  }
  listPublicGrades: { method: 'GET'; path: '/v1/public/{org}/{project}/grades'; idempotent: false; eventStream: false }
  listPublicCalendarEntries: {
    method: 'GET'
    path: '/v1/public/{org}/{project}/calendar-entries'
    idempotent: false
    eventStream: false
  }
  getPublicCall: { method: 'GET'; path: '/v1/public/calls/{callId}'; idempotent: false; eventStream: false }
  getPublicWindow: { method: 'GET'; path: '/v1/public/windows/{id}'; idempotent: false; eventStream: false }
  getPublicServiceStatus: { method: 'GET'; path: '/v1/public/status'; idempotent: false; eventStream: false }
  streamPublicProjectState: {
    method: 'GET'
    path: '/v1/public/{org}/{project}/stream'
    idempotent: false
    eventStream: true
  }
  evaluatePublicProject: {
    method: 'POST'
    path: '/v1/public/{org}/{project}/evaluate'
    idempotent: false
    eventStream: false
  }
  streamReadings: { method: 'GET'; path: '/v1/projects/{id}/readings/stream'; idempotent: false; eventStream: true }
  getReplay: { method: 'GET'; path: '/v1/replays/{id}'; idempotent: false; eventStream: false }
  listReviewItems: { method: 'GET'; path: '/v1/projects/{id}/review-items'; idempotent: false; eventStream: false }
  updateReviewItem: { method: 'PATCH'; path: '/v1/review-items/{id}'; idempotent: false; eventStream: false }
  listRuns: { method: 'GET'; path: '/v1/projects/{id}/runs'; idempotent: false; eventStream: false }
  createRun: { method: 'POST'; path: '/v1/projects/{id}/runs'; idempotent: true; eventStream: false }
  getRun: { method: 'GET'; path: '/v1/runs/{id}'; idempotent: false; eventStream: false }
  evaluateSandbox: { method: 'POST'; path: '/v1/sandbox/evaluate'; idempotent: false; eventStream: false }
  searchOrganisation: { method: 'GET'; path: '/v1/search'; idempotent: false; eventStream: false }
  bindSource: { method: 'POST'; path: '/v1/projects/{id}/sources'; idempotent: true; eventStream: false }
  listProjectSources: { method: 'GET'; path: '/v1/projects/{id}/sources'; idempotent: false; eventStream: false }
  unbindSource: {
    method: 'DELETE'
    path: '/v1/projects/{id}/sources/{sourceId}'
    idempotent: false
    eventStream: false
  }
  rotateDeviceToken: { method: 'POST'; path: '/v1/sources/{id}/rotate-token'; idempotent: true; eventStream: false }
  listSourceReadings: { method: 'GET'; path: '/v1/sources/{id}/readings'; idempotent: false; eventStream: false }
  listSourcePolls: { method: 'GET'; path: '/v1/sources/{id}/polls'; idempotent: false; eventStream: false }
  getProjectStrip: { method: 'GET'; path: '/v1/projects/{id}/strip'; idempotent: false; eventStream: false }
  createSubscribeLink: {
    method: 'POST'
    path: '/v1/projects/{id}/subscribe-link'
    idempotent: true
    eventStream: false
  }
  getSubscriberCounts: {
    method: 'GET'
    path: '/v1/projects/{id}/subscriber-counts'
    idempotent: false
    eventStream: false
  }
  listSubscribers: { method: 'GET'; path: '/v1/projects/{id}/subscribers'; idempotent: false; eventStream: false }
  createSubscriber: { method: 'POST'; path: '/v1/projects/{id}/subscribers'; idempotent: true; eventStream: false }
  deleteSubscriber: { method: 'DELETE'; path: '/v1/subscribers/{id}'; idempotent: false; eventStream: false }
  getUsage: { method: 'GET'; path: '/v1/usage'; idempotent: false; eventStream: false }
  getProjectVerdicts: { method: 'GET'; path: '/v1/projects/{id}/verdicts'; idempotent: false; eventStream: false }
  listWebhooks: { method: 'GET'; path: '/v1/webhooks'; idempotent: false; eventStream: false }
  createWebhook: { method: 'POST'; path: '/v1/webhooks'; idempotent: true; eventStream: false }
  getWebhook: { method: 'GET'; path: '/v1/webhooks/{id}'; idempotent: false; eventStream: false }
  updateWebhook: { method: 'PATCH'; path: '/v1/webhooks/{id}'; idempotent: false; eventStream: false }
  deleteWebhook: { method: 'DELETE'; path: '/v1/webhooks/{id}'; idempotent: false; eventStream: false }
  verifyWebhook: { method: 'POST'; path: '/v1/webhooks/{id}/verify'; idempotent: false; eventStream: false }
  redeliverWebhook: { method: 'POST'; path: '/v1/webhooks/{id}/redeliver'; idempotent: false; eventStream: false }
  listWebhookDeliveries: { method: 'GET'; path: '/v1/webhooks/{id}/deliveries'; idempotent: false; eventStream: false }
  listWindows: { method: 'GET'; path: '/v1/projects/{id}/windows'; idempotent: false; eventStream: false }
  createWindow: { method: 'POST'; path: '/v1/projects/{id}/windows'; idempotent: true; eventStream: false }
  updateWindow: { method: 'PATCH'; path: '/v1/windows/{id}'; idempotent: false; eventStream: false }
  cancelWindow: { method: 'DELETE'; path: '/v1/windows/{id}'; idempotent: false; eventStream: false }
  createWindowReport: { method: 'POST'; path: '/v1/windows/{id}/reports'; idempotent: true; eventStream: false }
}

export const OPERATIONS = {
  getProjectAnalysis: { method: 'GET', path: '/v1/projects/{id}/analysis', idempotent: false, eventStream: false },
  getOrganisationAnalysis: { method: 'GET', path: '/v1/analysis', idempotent: false, eventStream: false },
  evaluateWhatIf: { method: 'POST', path: '/v1/projects/{id}/analysis/what-if', idempotent: false, eventStream: false },
  listProjectBundles: { method: 'GET', path: '/v1/projects/{id}/bundles', idempotent: false, eventStream: false },
  streamBundles: { method: 'GET', path: '/v1/projects/{id}/bundles/stream', idempotent: false, eventStream: true },
  getBundle: { method: 'GET', path: '/v1/bundles/{id}', idempotent: false, eventStream: false },
  listOrganisationBundles: { method: 'GET', path: '/v1/bundles', idempotent: false, eventStream: false },
  listProjectCalls: { method: 'GET', path: '/v1/projects/{id}/calls', idempotent: false, eventStream: false },
  getCall: { method: 'GET', path: '/v1/calls/{id}', idempotent: false, eventStream: false },
  getCallExplanation: { method: 'GET', path: '/v1/calls/{id}/explanation', idempotent: false, eventStream: false },
  listCatalogueSources: { method: 'GET', path: '/v1/catalogue/sources', idempotent: false, eventStream: false },
  listChannels: { method: 'GET', path: '/v1/projects/{id}/channels', idempotent: false, eventStream: false },
  previewChannels: { method: 'GET', path: '/v1/projects/{id}/channels/preview', idempotent: false, eventStream: false },
  updateChannel: {
    method: 'PATCH',
    path: '/v1/projects/{id}/channels/{channel}',
    idempotent: false,
    eventStream: false
  },
  listClauseSheets: { method: 'GET', path: '/v1/projects/{id}/clause-sheets', idempotent: false, eventStream: false },
  listClauseSheetVersions: {
    method: 'GET',
    path: '/v1/clause-sheets/{id}/versions',
    idempotent: false,
    eventStream: false
  },
  getClauseSheetVersion: {
    method: 'GET',
    path: '/v1/clause-sheets/{id}/versions/{n}',
    idempotent: false,
    eventStream: false
  },
  getClauseSheetDiff: { method: 'GET', path: '/v1/clause-sheets/{id}/diff', idempotent: false, eventStream: false },
  evaluateClauseSheet: {
    method: 'POST',
    path: '/v1/clause-sheets/{id}/evaluate',
    idempotent: false,
    eventStream: false
  },
  listClauseSheetDrafts: {
    method: 'GET',
    path: '/v1/clause-sheets/{id}/drafts',
    idempotent: false,
    eventStream: false
  },
  createClauseSheetDraft: {
    method: 'POST',
    path: '/v1/clause-sheets/{id}/drafts',
    idempotent: true,
    eventStream: false
  },
  getClauseSheetDraft: {
    method: 'GET',
    path: '/v1/clause-sheets/{id}/drafts/{draftId}',
    idempotent: false,
    eventStream: false
  },
  deleteClauseSheetDraft: {
    method: 'DELETE',
    path: '/v1/clause-sheets/{id}/drafts/{draftId}',
    idempotent: false,
    eventStream: false
  },
  createReplay: { method: 'POST', path: '/v1/clause-sheets/{id}/replay', idempotent: true, eventStream: false },
  getCommonsBudget: { method: 'GET', path: '/v1/commons/budget', idempotent: false, eventStream: false },
  getDashboard: { method: 'GET', path: '/v1/dashboard', idempotent: false, eventStream: false },
  listProjectDays: { method: 'GET', path: '/v1/projects/{id}/days', idempotent: false, eventStream: false },
  createDevice: { method: 'POST', path: '/v1/projects/{id}/devices', idempotent: true, eventStream: false },
  streamOrganisationEvents: { method: 'GET', path: '/v1/events/stream', idempotent: false, eventStream: true },
  listEvidenceRequests: {
    method: 'GET',
    path: '/v1/projects/{id}/evidence-requests',
    idempotent: false,
    eventStream: false
  },
  createEvidenceRequest: {
    method: 'POST',
    path: '/v1/projects/{id}/evidence-requests',
    idempotent: true,
    eventStream: false
  },
  getEvidenceRequest: { method: 'GET', path: '/v1/evidence-requests/{id}', idempotent: false, eventStream: false },
  listGrades: { method: 'GET', path: '/v1/projects/{id}/grades', idempotent: false, eventStream: false },
  listIcsFeeds: { method: 'GET', path: '/v1/projects/{id}/ics-feeds', idempotent: false, eventStream: false },
  createIcsFeed: { method: 'POST', path: '/v1/projects/{id}/ics-feeds', idempotent: true, eventStream: false },
  deleteIcsFeed: { method: 'DELETE', path: '/v1/ics-feeds/{id}', idempotent: false, eventStream: false },
  getProjectIndicators: { method: 'GET', path: '/v1/projects/{id}/indicators', idempotent: false, eventStream: false },
  ingestReadings: { method: 'POST', path: '/v1/ingest/{sourceId}', idempotent: true, eventStream: false },
  listLedgerEntries: { method: 'GET', path: '/v1/projects/{id}/ledger', idempotent: false, eventStream: false },
  exportLedger: { method: 'GET', path: '/v1/projects/{id}/ledger/export', idempotent: false, eventStream: false },
  verifyLedger: { method: 'GET', path: '/v1/projects/{id}/ledger/verify', idempotent: false, eventStream: false },
  listProjectListings: { method: 'GET', path: '/v1/projects/{id}/listings', idempotent: false, eventStream: false },
  proposeListing: { method: 'POST', path: '/v1/projects/{id}/listings', idempotent: true, eventStream: false },
  listOrganisationListings: { method: 'GET', path: '/v1/listings', idempotent: false, eventStream: false },
  getMe: { method: 'GET', path: '/v1/me', idempotent: false, eventStream: false },
  listNights: { method: 'GET', path: '/v1/projects/{id}/nights', idempotent: false, eventStream: false },
  getNight: { method: 'GET', path: '/v1/nights/{id}', idempotent: false, eventStream: false },
  updateProjectPack: { method: 'PATCH', path: '/v1/projects/{id}/packs/{pack}', idempotent: false, eventStream: false },
  getPilotArchive: { method: 'GET', path: '/v1/projects/{id}/pilot-archive', idempotent: false, eventStream: false },
  listProjects: { method: 'GET', path: '/v1/projects', idempotent: false, eventStream: false },
  getProject: { method: 'GET', path: '/v1/projects/{id}', idempotent: false, eventStream: false },
  getPublicProjectStatus: {
    method: 'GET',
    path: '/v1/public/{org}/{project}/status',
    idempotent: false,
    eventStream: false
  },
  listPublicProjectCalls: {
    method: 'GET',
    path: '/v1/public/{org}/{project}/calls',
    idempotent: false,
    eventStream: false
  },
  listPublicLedgerEntries: {
    method: 'GET',
    path: '/v1/public/{org}/{project}/ledger',
    idempotent: false,
    eventStream: false
  },
  listPublicGrades: { method: 'GET', path: '/v1/public/{org}/{project}/grades', idempotent: false, eventStream: false },
  listPublicCalendarEntries: {
    method: 'GET',
    path: '/v1/public/{org}/{project}/calendar-entries',
    idempotent: false,
    eventStream: false
  },
  getPublicCall: { method: 'GET', path: '/v1/public/calls/{callId}', idempotent: false, eventStream: false },
  getPublicWindow: { method: 'GET', path: '/v1/public/windows/{id}', idempotent: false, eventStream: false },
  getPublicServiceStatus: { method: 'GET', path: '/v1/public/status', idempotent: false, eventStream: false },
  streamPublicProjectState: {
    method: 'GET',
    path: '/v1/public/{org}/{project}/stream',
    idempotent: false,
    eventStream: true
  },
  evaluatePublicProject: {
    method: 'POST',
    path: '/v1/public/{org}/{project}/evaluate',
    idempotent: false,
    eventStream: false
  },
  streamReadings: { method: 'GET', path: '/v1/projects/{id}/readings/stream', idempotent: false, eventStream: true },
  getReplay: { method: 'GET', path: '/v1/replays/{id}', idempotent: false, eventStream: false },
  listReviewItems: { method: 'GET', path: '/v1/projects/{id}/review-items', idempotent: false, eventStream: false },
  updateReviewItem: { method: 'PATCH', path: '/v1/review-items/{id}', idempotent: false, eventStream: false },
  listRuns: { method: 'GET', path: '/v1/projects/{id}/runs', idempotent: false, eventStream: false },
  createRun: { method: 'POST', path: '/v1/projects/{id}/runs', idempotent: true, eventStream: false },
  getRun: { method: 'GET', path: '/v1/runs/{id}', idempotent: false, eventStream: false },
  evaluateSandbox: { method: 'POST', path: '/v1/sandbox/evaluate', idempotent: false, eventStream: false },
  searchOrganisation: { method: 'GET', path: '/v1/search', idempotent: false, eventStream: false },
  bindSource: { method: 'POST', path: '/v1/projects/{id}/sources', idempotent: true, eventStream: false },
  listProjectSources: { method: 'GET', path: '/v1/projects/{id}/sources', idempotent: false, eventStream: false },
  unbindSource: {
    method: 'DELETE',
    path: '/v1/projects/{id}/sources/{sourceId}',
    idempotent: false,
    eventStream: false
  },
  rotateDeviceToken: { method: 'POST', path: '/v1/sources/{id}/rotate-token', idempotent: true, eventStream: false },
  listSourceReadings: { method: 'GET', path: '/v1/sources/{id}/readings', idempotent: false, eventStream: false },
  listSourcePolls: { method: 'GET', path: '/v1/sources/{id}/polls', idempotent: false, eventStream: false },
  getProjectStrip: { method: 'GET', path: '/v1/projects/{id}/strip', idempotent: false, eventStream: false },
  createSubscribeLink: {
    method: 'POST',
    path: '/v1/projects/{id}/subscribe-link',
    idempotent: true,
    eventStream: false
  },
  getSubscriberCounts: {
    method: 'GET',
    path: '/v1/projects/{id}/subscriber-counts',
    idempotent: false,
    eventStream: false
  },
  listSubscribers: { method: 'GET', path: '/v1/projects/{id}/subscribers', idempotent: false, eventStream: false },
  createSubscriber: { method: 'POST', path: '/v1/projects/{id}/subscribers', idempotent: true, eventStream: false },
  deleteSubscriber: { method: 'DELETE', path: '/v1/subscribers/{id}', idempotent: false, eventStream: false },
  getUsage: { method: 'GET', path: '/v1/usage', idempotent: false, eventStream: false },
  getProjectVerdicts: { method: 'GET', path: '/v1/projects/{id}/verdicts', idempotent: false, eventStream: false },
  listWebhooks: { method: 'GET', path: '/v1/webhooks', idempotent: false, eventStream: false },
  createWebhook: { method: 'POST', path: '/v1/webhooks', idempotent: true, eventStream: false },
  getWebhook: { method: 'GET', path: '/v1/webhooks/{id}', idempotent: false, eventStream: false },
  updateWebhook: { method: 'PATCH', path: '/v1/webhooks/{id}', idempotent: false, eventStream: false },
  deleteWebhook: { method: 'DELETE', path: '/v1/webhooks/{id}', idempotent: false, eventStream: false },
  verifyWebhook: { method: 'POST', path: '/v1/webhooks/{id}/verify', idempotent: false, eventStream: false },
  redeliverWebhook: { method: 'POST', path: '/v1/webhooks/{id}/redeliver', idempotent: false, eventStream: false },
  listWebhookDeliveries: { method: 'GET', path: '/v1/webhooks/{id}/deliveries', idempotent: false, eventStream: false },
  listWindows: { method: 'GET', path: '/v1/projects/{id}/windows', idempotent: false, eventStream: false },
  createWindow: { method: 'POST', path: '/v1/projects/{id}/windows', idempotent: true, eventStream: false },
  updateWindow: { method: 'PATCH', path: '/v1/windows/{id}', idempotent: false, eventStream: false },
  cancelWindow: { method: 'DELETE', path: '/v1/windows/{id}', idempotent: false, eventStream: false },
  createWindowReport: { method: 'POST', path: '/v1/windows/{id}/reports', idempotent: true, eventStream: false }
} as const satisfies OperationMetadataById

export type RequiredOperationId =
  | 'getProjectAnalysis'
  | 'evaluateWhatIf'
  | 'listProjectBundles'
  | 'streamBundles'
  | 'getBundle'
  | 'listProjectCalls'
  | 'getCall'
  | 'getCallExplanation'
  | 'listChannels'
  | 'previewChannels'
  | 'updateChannel'
  | 'listClauseSheets'
  | 'listClauseSheetVersions'
  | 'getClauseSheetVersion'
  | 'getClauseSheetDiff'
  | 'evaluateClauseSheet'
  | 'listClauseSheetDrafts'
  | 'createClauseSheetDraft'
  | 'getClauseSheetDraft'
  | 'deleteClauseSheetDraft'
  | 'createReplay'
  | 'listProjectDays'
  | 'createDevice'
  | 'listEvidenceRequests'
  | 'createEvidenceRequest'
  | 'getEvidenceRequest'
  | 'listGrades'
  | 'listIcsFeeds'
  | 'createIcsFeed'
  | 'deleteIcsFeed'
  | 'getProjectIndicators'
  | 'ingestReadings'
  | 'listLedgerEntries'
  | 'exportLedger'
  | 'verifyLedger'
  | 'listProjectListings'
  | 'proposeListing'
  | 'listOrganisationListings'
  | 'listNights'
  | 'getNight'
  | 'updateProjectPack'
  | 'getPilotArchive'
  | 'getProject'
  | 'getPublicProjectStatus'
  | 'listPublicProjectCalls'
  | 'listPublicLedgerEntries'
  | 'listPublicGrades'
  | 'listPublicCalendarEntries'
  | 'getPublicCall'
  | 'getPublicWindow'
  | 'streamPublicProjectState'
  | 'evaluatePublicProject'
  | 'streamReadings'
  | 'getReplay'
  | 'listReviewItems'
  | 'updateReviewItem'
  | 'listRuns'
  | 'createRun'
  | 'getRun'
  | 'evaluateSandbox'
  | 'searchOrganisation'
  | 'bindSource'
  | 'listProjectSources'
  | 'unbindSource'
  | 'rotateDeviceToken'
  | 'listSourceReadings'
  | 'listSourcePolls'
  | 'getProjectStrip'
  | 'createSubscribeLink'
  | 'getSubscriberCounts'
  | 'listSubscribers'
  | 'createSubscriber'
  | 'deleteSubscriber'
  | 'getProjectVerdicts'
  | 'createWebhook'
  | 'getWebhook'
  | 'updateWebhook'
  | 'deleteWebhook'
  | 'verifyWebhook'
  | 'redeliverWebhook'
  | 'listWebhookDeliveries'
  | 'listWindows'
  | 'createWindow'
  | 'updateWindow'
  | 'cancelWindow'
  | 'createWindowReport'

export type EventStreamOperationId =
  'streamBundles' | 'streamOrganisationEvents' | 'streamPublicProjectState' | 'streamReadings'

export type OperationArguments = {
  [Id in OperationId]: Id extends RequiredOperationId ? [input: OperationRequests[Id]] : [input?: OperationRequests[Id]]
}

export type OperationMethod<Id extends OperationId> = (
  ...args: OperationArguments[Id]
) => Promise<OperationResponses[Id]>

export type SdkMethods = { [Id in OperationId]: OperationMethod<Id> }

export type OperationMetadata = (typeof OPERATIONS)[OperationId]

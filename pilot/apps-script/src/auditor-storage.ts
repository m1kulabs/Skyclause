import type { AuditorPorts } from './auditor.ts'
import type { AuditCrossingFile, AuditFamily, AuditRefresh } from './auditor-policy.ts'
import {
  auditTransitionKey,
  decodeAuditTransition,
  encodeAuditTransition,
  decodeAuditCredentialState,
  encodeAuditCredentialState
} from './auditor-state.ts'
import { evidenceGmailPorts } from './evidence-gmail.ts'
import type { Row } from './schema.ts'

export interface AuditorNativeHelpers {
  read: typeof import('./gas.ts').readColumns
  append: typeof import('./gas.ts').appendRows
  newEventId(): string
  hashId(text: string): string
}
const NOTICE = 'SKY_AUDITOR_NOTICE_V1_'
const OBSERVER = 'SKY_AUDITOR_CREDENTIALS_V1'
const props = () => PropertiesService.getScriptProperties()

// Composition is lazy: no native service is touched before a port is called.
export function auditorStoragePorts(
  sheetId: string,
  skyFolderId: string,
  crowdFolderId: string,
  helpers: AuditorNativeHelpers
): AuditorPorts {
  if (![sheetId, skyFolderId, crowdFolderId].every((id) => typeof id === 'string' && id.trim()))
    throw new Error('audit_storage_configuration')
  if (new Set([sheetId.trim(), skyFolderId.trim(), crowdFolderId.trim()]).size !== 3)
    throw new Error('audit_storage_configuration')
  const keyFor = (family: AuditFamily, ref: string) => auditTransitionKey(family, ref, (text) => helpers.hashId(text))
  const gmail = evidenceGmailPorts()
  let notificationCache: Row<'notifications'>[] | undefined
  function crossings(): AuditCrossingFile[] {
    const result: AuditCrossingFile[] = []
    for (const [folderId, pack] of [
      [skyFolderId, 'sky'],
      [crowdFolderId, 'crowd']
    ] as const) {
      const files = DriveApp.getFolderById(folderId).getFiles()
      while (files.hasNext()) {
        const file = files.next()
        if (file.isTrashed()) continue
        result.push({
          fileId: file.getId(),
          name: file.getName(),
          pack,
          writtenAt: file.getDateCreated() as Date,
          text: file.getBlob().getDataAsString('UTF-8')
        })
      }
    }
    return result
  }
  return {
    now: () => new Date(),
    newEventId: () => helpers.newEventId(),
    hashId: (text) => helpers.hashId(text),
    teamAlertEmails: () => props().getProperty('TEAM_ALERT_EMAILS'),
    readInput: () => {
      const sources = helpers.read(sheetId, 'sources', ['source_id', 'kind', 'stale_after_min'], true)
      const camera = sources.some((row) => row.source_id === 'cam-1')
      const dayStart = camera ? props().getProperty('CAMERA_DAY_START') : null
      const dayEnd = camera ? props().getProperty('CAMERA_DAY_END') : null
      let refresh: AuditRefresh
      try {
        refresh = { status: 'readable', value: props().getProperty('GE_SCHEDULES_REFRESHED_AT') }
      } catch {
        refresh = { status: 'unreadable' }
      }
      return {
        sources,
        readings: helpers.read(
          sheetId,
          'readings',
          ['source_kind', 'source_id', 'metric', 'observed_at', 'received_at', 'value'],
          true
        ),
        polls: helpers.read(
          sheetId,
          'polls',
          ['source_kind', 'source_id', 'started_at', 'received_at', 'outcome', 'http_status'],
          true
        ),
        devices: helpers.read(sheetId, 'devices', ['device_id', 'kind', 'last_heartbeat_at'], true),
        crowdGrades: helpers.read(sheetId, 'crowd_grades', ['night_id', 'outcome', 'next_update', 'graded_at'], true),
        ledger: helpers.read(sheetId, 'ledger', ['source_ref'], true),
        crossings: crossings(),
        dayStart,
        dayEnd,
        refresh
      }
    },
    notifications: () =>
      notificationCache ??
      (notificationCache = helpers.read(
        sheetId,
        'notifications',
        ['at', 'kind', 'to', 'ref', 'gmail_message_id'],
        true
      )),
    appendNotification: (row) => {
      notificationCache = undefined
      helpers.append(sheetId, 'notifications', [row])
      SpreadsheetApp.flush()
    },
    pending: () => {
      const properties = props()
      return properties
        .getKeys()
        .filter((key) => key.startsWith(NOTICE))
        .map((key) => {
          // Native reads must propagate; only corrupt persisted content is isolated.
          const raw = properties.getProperty(key)
          try {
            if (raw === null) throw new Error('transition_missing')
            // The controller checks stored-key/marker binding and blocks both identities on mismatch.
            return { key, status: 'valid' as const, transition: decodeAuditTransition(raw) }
          } catch {
            return { key, status: 'invalid' as const, code: 'transition_invalid' }
          }
        })
    },
    saveTransition: (value) => {
      const encoded = encodeAuditTransition(value)
      const valid = decodeAuditTransition(encoded)
      const key = keyFor(valid.family, valid.ref)
      if (
        !/^SKY_AUDITOR_NOTICE_V1_[a-f0-9]{64}$/.test(key) ||
        valid.recipients.some(
          (recipient) => recipient.marker !== `audit:${helpers.hashId(`${valid.eventId}\0${recipient.to}`)}`
        )
      )
        throw new Error('audit_state_binding')
      props().setProperty(key, encoded)
    },
    removeTransition: (family, ref) => {
      const key = keyFor(family, ref)
      if (!/^SKY_AUDITOR_NOTICE_V1_[a-f0-9]{64}$/.test(key)) throw new Error('audit_state_binding')
      props().deleteProperty(key)
    },
    credentialState: () => decodeAuditCredentialState(props().getProperty(OBSERVER)),
    saveCredentialState: (value) => {
      props().setProperty(OBSERVER, encodeAuditCredentialState(value))
    },
    createDraft: gmail.createDraft,
    draft: gmail.draft,
    sendDraft: gmail.sendDraft,
    findSent: gmail.findSent
  }
}

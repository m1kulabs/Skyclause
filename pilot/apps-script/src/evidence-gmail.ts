import { toEvidenceInstant, type EvidenceInboxPorts } from './evidence.ts'
import type { EvidenceNoticeMail, EvidenceNotificationPorts, EvidenceSentMessage } from './evidence-notification.ts'
import { firstUnquotedLine } from './evidence-request.ts'

export type EvidenceGmailPorts = Pick<EvidenceInboxPorts, 'ownerEmail' | 'listMessages' | 'message'> &
  Pick<EvidenceNotificationPorts, 'requesterAddress' | 'createDraft' | 'draft' | 'sendDraft' | 'findSent'>

type Resource = Record<string, unknown>
const API = 'https://gmail.googleapis.com/gmail/v1/users/me'
const MAX_TEXT = 1_000_000
function object(value: unknown): Resource {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('gmail_invalid_response')
  return value as Resource
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error('gmail_invalid_acknowledgement')
  return value
}
function query(values: Record<string, string | number | undefined>): string {
  return Object.entries(values)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
    .join('&')
}
// Numeric HTTP codes are available here; provider exception text is never evidence of absence.
function request(
  path: string,
  values: Record<string, string | number | undefined> = {},
  payload?: unknown,
  missing = false
): Resource | null {
  const qs = query(values)
  const response = UrlFetchApp.fetch(`${API}${path}${qs ? `?${qs}` : ''}`, {
    method: payload === undefined ? 'get' : 'post',
    headers: { Authorization: `Bearer ${ScriptApp.getOAuthToken()}` },
    muteHttpExceptions: true,
    ...(payload === undefined ? {} : { contentType: 'application/json', payload: JSON.stringify(payload) })
  })
  const status = response.getResponseCode()
  if (missing && status === 404) return null
  if (status < 200 || status >= 300) throw new Error(`gmail_http_${status}`)
  try {
    return object(JSON.parse(response.getContentText()))
  } catch {
    throw new Error('gmail_invalid_response')
  }
}
function headers(part: Resource): { name: string; value: string }[] {
  if (part.headers === undefined) return []
  if (!Array.isArray(part.headers)) throw new Error('mime_invalid')
  return part.headers.map((item) => {
    const h = object(item)
    if (typeof h.name !== 'string' || typeof h.value !== 'string') throw new Error('mime_invalid')
    return { name: h.name.toLowerCase(), value: h.value }
  })
}
function header(part: Resource, name: string): string {
  const found = headers(part).filter((h) => h.name === name.toLowerCase())
  if (found.length > 1) throw new Error('mime_invalid')
  return found[0]?.value ?? ''
}
function mailbox(value: string): string | null {
  const trimmed = value.trim()
  const match = /^(?:[^<>\r\n]*<([^<>\s,;]+)>|([^<>\s,;]+))$/.exec(trimmed)
  const address = match?.[1] ?? match?.[2]
  return address && /^[^@]+@[^@]+\.[^@]+$/.test(address) ? address : null
}
function decodeBytes(bytes: number[], charset: string): string {
  const normalized = charset.toLowerCase()
  if (!['utf-8', 'utf8', 'us-ascii', 'iso-8859-1'].includes(normalized)) throw new Error('mime_invalid')
  const text = Utilities.newBlob(bytes).getDataAsString(normalized === 'utf8' ? 'UTF-8' : charset)
  if (text.includes('\ufffd')) throw new Error('mime_invalid')
  return text
}
function encodedWord(value: string): string {
  const joined = value.replace(/(\?=)[ \t\r\n]+(?==\?)/g, '$1')
  const decoded = joined.replace(
    /=\?([^?]+)\?([bq])\?([^?]*)\?=/gi,
    (_, charset: string, encoding: string, data: string) => {
      let bytes: number[]
      if (encoding.toLowerCase() === 'b') {
        if (!/^[A-Za-z0-9+/]*={0,2}$/.test(data) || data.length % 4 !== 0) throw new Error('mime_invalid')
        bytes = Utilities.base64Decode(data)
      } else {
        const q = data.replace(/_/g, ' ')
        bytes = []
        for (let n = 0; n < q.length; n++) {
          if (q[n] === '=') {
            if (!/^[0-9a-f]{2}$/i.test(q.slice(n + 1, n + 3))) throw new Error('mime_invalid')
            bytes.push(parseInt(q.slice(n + 1, n + 3), 16))
            n += 2
          } else {
            const code = q.charCodeAt(n)
            if (code > 127) throw new Error('mime_invalid')
            bytes.push(code)
          }
        }
      }
      return decodeBytes(bytes, charset)
    }
  )
  if (decoded.includes('=?')) throw new Error('mime_invalid')
  return decoded
}
function htmlText(html: string): string {
  return html
    .replace(/<(script|style|blockquote)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(?:br|\/p|\/div|\/li|\/tr)\b[^>]*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi, (full, entity: string) => {
      const named: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
      if (named[entity.toLowerCase()]) return named[entity.toLowerCase()]!
      const code = entity.toLowerCase().startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1))
      return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : full
    })
}
function body(payload: Resource): string {
  const plain: string[] = [],
    html: string[] = []
  let parts = 0,
    size = 0
  function visit(part: Resource, depth: number): void {
    if (++parts > 200 || depth > 20) throw new Error('mime_invalid')
    if (part.filename || /^attachment\b/i.test(header(part, 'content-disposition'))) return
    if (part.parts !== undefined) {
      if (!Array.isArray(part.parts)) throw new Error('mime_invalid')
      for (const item of part.parts) visit(object(item), depth + 1)
    }
    if (part.mimeType !== 'text/plain' && part.mimeType !== 'text/html') return
    const data = object(part.body).data
    if (typeof data !== 'string' || !/^[A-Za-z0-9_-]*={0,2}$/.test(data) || data.length % 4 === 1)
      throw new Error('mime_invalid')
    size += data.length
    if (size > MAX_TEXT) throw new Error('mime_invalid')
    const charset = /charset\s*=\s*"?([^;"\s]+)/i.exec(header(part, 'content-type'))?.[1] ?? 'UTF-8'
    const decoded = decodeBytes(Utilities.base64DecodeWebSafe(data), charset).replace(/\r\n|\r/g, '\n')
    if (part.mimeType === 'text/plain') plain.push(decoded)
    else html.push(htmlText(decoded))
  }
  visit(payload, 0)
  if (!plain.length && !html.length) throw new Error('mime_invalid')
  return (plain.length ? plain : html).join('\n')
}
function labels(message: Resource): string[] {
  if (!Array.isArray(message.labelIds) || !message.labelIds.every((label) => typeof label === 'string'))
    throw new Error('gmail_invalid_message')
  return message.labelIds as string[]
}
// Generated notices are one inline text/plain part. Incoming extraction deliberately has a broader policy.
class UncontrolledMime extends Error {
  constructor() {
    super('gmail_uncontrolled_mime')
  }
}
function controlledBody(payload: Resource): string {
  if (
    payload.mimeType !== 'text/plain' ||
    payload.filename ||
    payload.parts !== undefined ||
    header(payload, 'content-disposition') ||
    object(payload.body).attachmentId !== undefined
  )
    throw new UncontrolledMime()
  return body(payload)
}
function notice(message: Resource): EvidenceNoticeMail {
  const payload = object(message.payload)
  const to = mailbox(header(payload, 'To'))
  // No Cc/Bcc is allowed on a verified controlled notification draft or Sent candidate.
  if (!to || header(payload, 'Cc') || header(payload, 'Bcc')) throw new Error('mime_invalid')
  return { to, subject: encodedWord(header(payload, 'Subject')), body: controlledBody(payload) }
}
function page(result: Resource, limit = 500): { messageIds: string[]; nextPageToken?: string } {
  if (result.messages !== undefined && (!Array.isArray(result.messages) || result.messages.length > limit))
    throw new Error('gmail_invalid_response')
  const messageIds = ((result.messages as unknown[] | undefined) ?? []).map((entry) => id(object(entry).id))
  if (result.nextPageToken !== undefined && (typeof result.nextPageToken !== 'string' || !result.nextPageToken))
    throw new Error('gmail_invalid_response')
  return { messageIds, ...(result.nextPageToken ? { nextPageToken: result.nextPageToken as string } : {}) }
}

export function evidenceGmailPorts(now: () => Date = () => new Date()): EvidenceGmailPorts {
  let owner: string | undefined
  const getMessage = (messageId: string, format = 'full', metadataHeaders?: string) => {
    const message = request(`/messages/${encodeURIComponent(messageId)}`, { format, metadataHeaders }, undefined, true)
    if (message && format === 'full' && message.id !== messageId) throw new Error('gmail_invalid_message')
    return message
  }
  const ownerEmail = () => {
    if (!owner) {
      const profile = request('/profile')!
      owner = typeof profile.emailAddress === 'string' ? (mailbox(profile.emailAddress) ?? undefined) : undefined
      if (!owner) throw new Error('gmail_invalid_profile')
    }
    return owner
  }
  return {
    ownerEmail,
    listMessages: (cursor) => {
      const lower = Date.parse(cursor.lowerBound),
        upper = Date.parse(cursor.upperBound ?? '')
      if (!Number.isFinite(lower) || !Number.isFinite(upper) || lower > upper) throw new Error('gmail_invalid_bounds')
      return page(
        request('/messages', {
          labelIds: 'INBOX',
          maxResults: 25,
          q: `after:${Math.floor(lower / 1000) - 1} before:${Math.floor(upper / 1000) + 1}`,
          pageToken: cursor.pageToken
        })!,
        25
      )
    },
    message: (messageId) => {
      const message = getMessage(messageId)
      if (!message) return null
      const receipt =
        typeof message.internalDate === 'string' && /^\d+$/.test(message.internalDate)
          ? Number(message.internalDate)
          : NaN
      if (message.id !== messageId || !Number.isSafeInteger(receipt) || !Number.isFinite(new Date(receipt).getTime()))
        throw new Error('gmail_invalid_message')
      const ownLabels = labels(message)
      const base = {
        id: messageId,
        receivedAt: toEvidenceInstant(new Date(receipt)),
        fromAddress: '',
        subject: '',
        body: '',
        inInbox: ownLabels.includes('INBOX'),
        sentByOwner: ownLabels.includes('SENT'),
        mailerDaemon: false
      }
      try {
        const payload = object(message.payload)
        base.fromAddress = mailbox(header(payload, 'From')) ?? ''
        if (!base.fromAddress) throw new Error('mime_invalid')
        base.mailerDaemon = /^(?:mailer-daemon|postmaster)@/i.test(base.fromAddress)
        base.subject = encodedWord(header(payload, 'Subject'))
        base.body = firstUnquotedLine(body(payload))
        return base
      } catch {
        return { ...base, subject: '', body: '', decodeError: 'mime_invalid' }
      }
    },
    requesterAddress: (messageId) => {
      const message = getMessage(messageId, 'metadata', 'From')
      return message ? mailbox(header(object(message.payload), 'From')) : null
    },
    createDraft: (mail) => {
      if (!mailbox(mail.to) || /[\r\n]/.test(mail.to + mail.subject)) throw new Error('mime_invalid')
      const words: string[] = []
      let chunk = ''
      for (const char of mail.subject) {
        if (Utilities.base64Encode(chunk + char, Utilities.Charset.UTF_8).length > 60) {
          words.push(`=?UTF-8?B?${Utilities.base64Encode(chunk, Utilities.Charset.UTF_8)}?=`)
          chunk = ''
        }
        chunk += char
      }
      if (chunk) words.push(`=?UTF-8?B?${Utilities.base64Encode(chunk, Utilities.Charset.UTF_8)}?=`)
      const subject = words.join('\r\n ')
      const content =
        Utilities.base64Encode(mail.body, Utilities.Charset.UTF_8)
          .match(/.{1,76}/g)
          ?.join('\r\n') ?? ''
      const raw = `From: ${ownerEmail()}\r\nDate: ${now().toUTCString()}\r\nTo: ${mail.to}\r\nSubject: ${subject}\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${content}`
      return {
        id: id(
          request('/drafts', {}, { message: { raw: Utilities.base64EncodeWebSafe(raw, Utilities.Charset.UTF_8) } })!.id
        )
      }
    },
    draft: (draftId) => {
      const result = request(`/drafts/${encodeURIComponent(draftId)}`, { format: 'full' }, undefined, true)
      if (!result) return null
      const message = object(result.message)
      return { ...notice(message), id: id(result.id), messageId: id(message.id), threadId: id(message.threadId) }
    },
    sendDraft: (draftId) => {
      const sent = request('/drafts/send', {}, { id: draftId })!
      return {
        id: id(sent.id),
        ...(typeof sent.threadId === 'string' && sent.threadId.trim() ? { threadId: sent.threadId } : {})
      }
    },
    findSent: (marker) => {
      if (!/^[a-z0-9:-]+$/i.test(marker)) throw new Error('gmail_invalid_marker')
      const results: EvidenceSentMessage[] = [],
        tokens = new Set<string>()
      let token: string | undefined
      do {
        const found = page(
          request('/messages', { labelIds: 'SENT', q: `in:sent "${marker}"`, maxResults: 500, pageToken: token })!
        )
        for (const messageId of found.messageIds) {
          const message = getMessage(messageId)
          if (message && labels(message).includes('SENT')) {
            try {
              results.push({ ...notice(message), id: id(message.id), threadId: id(message.threadId) })
            } catch (error) {
              // A known nonmatching MIME shape cannot establish controlled Sent delivery. Finish every page.
              if (!(error instanceof UncontrolledMime)) throw error
            }
          }
        }
        token = found.nextPageToken
        if (token && tokens.has(token)) throw new Error('gmail_repeated_page')
        if (token) tokens.add(token)
      } while (token)
      return results
    }
  }
}

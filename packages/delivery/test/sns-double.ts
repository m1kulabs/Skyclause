// Signed SNS doubles for tests only, until messages captured from production replace them (#113).
import { createSign, generateKeyPairSync } from 'node:crypto'

export const region = 'ap-southeast-2'
export const topicArn = 'arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-inbound'
export const certUrl =
  'https://sns.ap-southeast-2.amazonaws.com/SimpleNotificationService-6209c161c6221fdf56ec1eb5c821d112.pem'

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
export const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString()

/** Fetches the "certificate": the double's public key at `certUrl`, 404 elsewhere. */
export const certificates = async (url: string) => {
  if (url !== certUrl) throw new Error(`unexpected certificate URL ${url}`)
  return publicKeyPem
}

// Field order from AWS's "Verifying the signatures of Amazon SNS messages".
const SIGNED: Record<string, string[]> = {
  Notification: ['Message', 'MessageId', 'Subject', 'Timestamp', 'TopicArn', 'Type'],
  SubscriptionConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type'],
  UnsubscribeConfirmation: ['Message', 'MessageId', 'SubscribeURL', 'Timestamp', 'Token', 'TopicArn', 'Type']
}

export function signed(fields: Record<string, string>): Record<string, string> {
  const message: Record<string, string> = {
    MessageId: 'b3f0c7a2-5d1e-5f3a-9c1e-000000000001',
    TopicArn: topicArn,
    Timestamp: '2026-11-06T10:00:00.000Z',
    SignatureVersion: '2',
    SigningCertURL: certUrl,
    ...fields
  }
  const keys = SIGNED[message.Type ?? ''] ?? []
  const text = keys
    .filter((key) => message[key] !== undefined)
    .map((key) => `${key}\n${message[key]}\n`)
    .join('')
  message.Signature = createSign('RSA-SHA256').update(text).sign(privateKey, 'base64')
  return message
}

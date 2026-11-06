// Labelled replay of a named capture: the SNS notification production's inbound topic sent for #113's
// delivery test on 6 Nov 2026 (SES message i8bf3990918gehocqhrma22h5f55etndi8pq96g1, from
// notices@notices.skyclause.m1ku.tech to delivery-test@in.skyclause.m1ku.tech, no user data), taken
// from a temporary SQS subscription, and the public SNS certificate its SigningCertURL names.
import { readFileSync } from 'node:fs'
import { DeleteObjectCommand, GetObjectCommand, NoSuchKey } from '@aws-sdk/client-s3'
import { describe, expect, test } from 'vitest'
import { createInboundRouter } from '../src/inbound'
import { verifySnsMessage } from '../src/sns'

const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8')
const capture = JSON.parse(fixture('ses-inbound-received-2026-11-06.json')) as Record<string, string>
const certificatePem = fixture('SimpleNotificationService-1e59c4574facfe41babdb2d652f8ebef.pem')

const options = {
  topicArn: 'arn:aws:sns:ap-southeast-2:776566309118:skyclause-production-inbound',
  region: 'ap-southeast-2',
  certificate: async (url: string) => {
    expect(url).toBe(capture.SigningCertURL)
    return certificatePem
  }
}

describe('captured production notification (6 Nov 2026)', () => {
  test("verifies with SNS's real signature and certificate", async () => {
    const message = await verifySnsMessage(capture, options)
    const received = JSON.parse(message.Message)
    expect(received.notificationType).toBe('Received')
    expect(received.receipt.spfVerdict.status).toBe('PASS')
    expect(received.receipt.dkimVerdict.status).toBe('PASS')
    expect(received.receipt.dmarcVerdict.status).toBe('PASS')
  })

  test('is refused once any signed field changes', async () => {
    await expect(verifySnsMessage({ ...capture, Timestamp: '2026-11-06T00:44:31.000Z' }, options)).rejects.toThrow(
      'signature'
    )
  })

  test('the handler reads its S3 action and treats a gone object as already handled', async () => {
    const commands: Array<{ type: string; bucket?: string; object?: string }> = []
    const router = createInboundRouter()
    const handle = router.handler({
      ...options,
      bucket: 'skyclause-production-inbound-776566309118',
      s3: {
        send: async (command: GetObjectCommand | DeleteObjectCommand) => {
          commands.push({
            type: command instanceof GetObjectCommand ? 'get' : 'delete',
            bucket: command.input.Bucket,
            object: command.input.Key
          })
          throw new NoSuchKey({ message: 'The specified key does not exist.', $metadata: { httpStatusCode: 404 } })
        }
      }
    })

    const res = await handle(
      new Request('https://worker.example/ses/inbound', { method: 'POST', body: JSON.stringify(capture) })
    )

    expect(res.status).toBe(204)
    expect(commands).toEqual([
      {
        type: 'get',
        bucket: 'skyclause-production-inbound-776566309118',
        object: 'i8bf3990918gehocqhrma22h5f55etndi8pq96g1'
      }
    ])
  })
})

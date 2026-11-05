import { describe, expect, test } from 'vitest'
import { verifySnsMessage } from '../src/sns'
import { certificates, region, signed, topicArn } from './sns-double'

const options = { topicArn, region, certificate: certificates }
const notification = () => signed({ Type: 'Notification', Message: '{"notificationType":"Received"}' })

describe('verifySnsMessage', () => {
  test('accepts a signature version 2 notification from the expected topic', async () => {
    const message = notification()
    await expect(verifySnsMessage(message, options)).resolves.toMatchObject({
      Type: 'Notification',
      Message: '{"notificationType":"Received"}'
    })
  })

  test('accepts a subscription confirmation, whose signature covers SubscribeURL and Token', async () => {
    const message = signed({
      Type: 'SubscriptionConfirmation',
      Message: 'You have chosen to subscribe to the topic.',
      Token: 'confirm-token',
      SubscribeURL: `https://sns.${region}.amazonaws.com/?Action=ConfirmSubscription&TopicArn=${topicArn}&Token=confirm-token`
    })
    await expect(verifySnsMessage(message, options)).resolves.toMatchObject({ Type: 'SubscriptionConfirmation' })
  })

  test('refuses a tampered message', async () => {
    const message = { ...notification(), Message: '{"notificationType":"Bounce"}' }
    await expect(verifySnsMessage(message, options)).rejects.toThrow('signature')
  })

  test('refuses another topic, even when correctly signed', async () => {
    const message = signed({
      Type: 'Notification',
      Message: '{}',
      TopicArn: 'arn:aws:sns:ap-southeast-2:111122223333:elsewhere'
    })
    await expect(verifySnsMessage(message, options)).rejects.toThrow('topic')
  })

  test('refuses a certificate URL that is not SNS in our region over HTTPS', async () => {
    for (const SigningCertURL of [
      'https://sns.ap-southeast-2.amazonaws.com.evil.example/SimpleNotificationService-1.pem',
      'http://sns.ap-southeast-2.amazonaws.com/SimpleNotificationService-1.pem',
      'https://sns.us-east-1.amazonaws.com/SimpleNotificationService-1.pem',
      'https://evil.example/sns.ap-southeast-2.amazonaws.com/SimpleNotificationService-1.pem'
    ]) {
      const message = signed({ Type: 'Notification', Message: '{}', SigningCertURL })
      await expect(verifySnsMessage(message, options)).rejects.toThrow('certificate URL')
    }
  })

  test('refuses signature version 1', async () => {
    const message = signed({ Type: 'Notification', Message: '{}', SignatureVersion: '1' })
    await expect(verifySnsMessage(message, options)).rejects.toThrow('version')
  })

  test('refuses something that is not an SNS message', async () => {
    await expect(verifySnsMessage({ hello: 'world' }, options)).rejects.toThrow()
    await expect(verifySnsMessage(null, options)).rejects.toThrow()
  })
})

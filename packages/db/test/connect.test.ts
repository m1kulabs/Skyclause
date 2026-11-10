import { describe, expect, it } from 'vitest'
import { withSystem } from '../src/client'
import { latestVerifications, recordVerification } from '../src/connect'
import { parseVerificationRecordArgs } from '../scripts/verification-record'

const now = new Date('2026-11-10T00:00:00.000Z')

describe('connect verifications', () => {
  it('keeps the latest row for a target and preserves its tested time and client version', async () => {
    const older = new Date(now.getTime() - 91 * 24 * 60 * 60 * 1000)
    const recent = new Date(now.getTime() - 89 * 24 * 60 * 60 * 1000)
    await withSystem('verification:record', (tx) =>
      recordVerification(
        tx,
        {
          target: 'claude_code',
          clientVersion: 'older',
          testedAt: older,
          result: 'pass',
          testedBy: '018d4a6a-9b21-7a31-8f30-a04841b9d122'
        },
        now
      )
    )
    const stored = await withSystem('verification:record', (tx) =>
      recordVerification(
        tx,
        {
          target: 'claude_code',
          clientVersion: 'current',
          testedAt: recent,
          result: 'pass',
          testedBy: '018d4a6a-9b21-7a31-8f30-a04841b9d122'
        },
        now
      )
    )

    const latest = await withSystem('verification:record', latestVerifications)
    expect(latest.find((row) => row.target === 'claude_code')).toMatchObject({
      id: stored.id,
      clientVersion: 'current',
      testedAt: recent
    })
  })

  it('refuses a future test time and an unknown target', async () => {
    await expect(
      withSystem('verification:record', (tx) =>
        recordVerification(
          tx,
          {
            target: 'claude_code',
            clientVersion: 'current',
            testedAt: new Date(now.getTime() + 1),
            result: 'pass',
            testedBy: '018d4a6a-9b21-7a31-8f30-a04841b9d122'
          },
          now
        )
      )
    ).rejects.toThrow(/future/i)

    await expect(
      withSystem('verification:record', (tx) =>
        recordVerification(
          tx,
          {
            target: 'unknown-client',
            clientVersion: 'current',
            testedAt: now,
            result: 'pass',
            testedBy: '018d4a6a-9b21-7a31-8f30-a04841b9d122'
          } as never,
          now
        )
      )
    ).rejects.toThrow(/unknown target/i)
  })

  it('requires and stores the recorder account ID, never an email address', () => {
    const accountId = '018d4a6a-9b21-7a31-8f30-a04841b9d122'
    const input = parseVerificationRecordArgs(
      ['--target', 'claude_code', '--client-version', '1.2.3', '--result', 'pass'],
      { SKYCLAUSE_TESTED_BY: accountId },
      now
    )
    expect(input.testedBy).toBe(accountId)
    expect(() =>
      parseVerificationRecordArgs(
        ['--target', 'claude_code', '--client-version', '1.2.3', '--result', 'pass'],
        { SKYCLAUSE_TESTED_BY: 'operator@example.com' },
        now
      )
    ).toThrow(/account ID/i)
    expect(() =>
      parseVerificationRecordArgs(
        [
          '--target',
          'claude_code',
          '--client-version',
          '1.2.3',
          '--result',
          'pass',
          '--tested-at',
          '2026-11-11T00:00:00.000Z'
        ],
        { SKYCLAUSE_TESTED_BY: accountId },
        now
      )
    ).toThrow(/future/i)
  })
})

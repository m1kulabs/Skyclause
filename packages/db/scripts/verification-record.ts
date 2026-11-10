import { closeConnections, withSystem } from '../src/client'
import {
  recordVerification,
  VERIFICATION_TARGETS,
  type VerificationResult,
  type VerificationTarget
} from '../src/connect'

type VerificationArgs = {
  target: VerificationTarget
  clientVersion: string
  result: VerificationResult
  testedAt: Date
  testedBy: string
  notes: string | null
}

/** Parse the human recorder's explicit test details and account identity. */
export function parseVerificationRecordArgs(
  args: string[],
  env: Record<string, string | undefined> = process.env,
  now = new Date()
): VerificationArgs {
  const fields = new Map<string, string>()
  for (let i = 0; i < args.length; i += 1) {
    const flag = args[i]
    if (!flag?.startsWith('--')) throw new Error(`Expected an option, received ${flag ?? 'nothing'}`)
    if (!['--target', '--client-version', '--result', '--notes', '--tested-at', '--tested-by'].includes(flag)) {
      throw new Error(`Unknown option: ${flag}`)
    }
    const value = args[i + 1]
    if (value === undefined || value.startsWith('--')) throw new Error(`${flag} needs a value`)
    if (fields.has(flag)) throw new Error(`${flag} may be specified once`)
    fields.set(flag, value)
    i += 1
  }

  const target = fields.get('--target')
  if (!target || !(VERIFICATION_TARGETS as readonly string[]).includes(target)) {
    throw new Error(`Unknown target: ${target ?? '(missing)'}`)
  }
  const clientVersion = fields.get('--client-version')?.trim()
  if (!clientVersion) throw new Error('--client-version is required')
  const result = fields.get('--result')
  if (result !== 'pass' && result !== 'fail') throw new Error('--result must be pass or fail')

  const testedAtValue = fields.get('--tested-at')
  const testedAt = testedAtValue ? new Date(testedAtValue) : new Date(now)
  if (!Number.isFinite(testedAt.getTime())) throw new Error('--tested-at must be a valid date')
  if (testedAt.getTime() > now.getTime()) throw new Error('--tested-at cannot be in the future')

  const testedBy = fields.get('--tested-by') ?? env.SKYCLAUSE_TESTED_BY
  if (!testedBy || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(testedBy)) {
    throw new Error('Set --tested-by or SKYCLAUSE_TESTED_BY to the recorder account ID, not an email address')
  }

  return {
    target: target as VerificationTarget,
    clientVersion,
    result,
    testedAt,
    testedBy,
    notes: fields.get('--notes') ?? null
  }
}

async function main() {
  const input = parseVerificationRecordArgs(process.argv.slice(2))
  const row = await withSystem('verification:record', (tx) => recordVerification(tx, input))
  console.log(`Recorded ${row.target} ${row.result} at ${row.testedAt.toISOString()} (${row.clientVersion}).`)
}

if (import.meta.main) {
  try {
    await main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Unable to record verification.')
    process.exitCode = 1
  } finally {
    await closeConnections()
  }
}

import { metrics, type Meter } from '@opentelemetry/api'
import { METRICS, type Pack, type TxHandle } from '@skyclause/contracts'
import { afterCommit, claimEvaluatorReadingUses, type Tx } from '@skyclause/db'

/** Best-effort post-commit telemetry; SQL receipts suppress redelivered event/reading samples. */
export async function recordUsedReadingLatency(
  tx: TxHandle,
  q: { projectId: string; pack: Pack; pollId: string; readingIds: string[]; tEval: string },
  meter: Meter = metrics.getMeter('skyclause')
): Promise<void> {
  const readings = await claimEvaluatorReadingUses(tx, q)
  if (!readings.length) return
  afterCommit(tx as Tx, async () => {
    const histogram = meter.createHistogram(METRICS.readingToShadowVerdict, { unit: 's' })
    for (const reading of readings)
      histogram.record((Date.parse(q.tEval) - reading.receivedAt.getTime()) / 1000, { pack: q.pack })
  })
}

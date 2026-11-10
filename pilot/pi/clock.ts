export function parseNtpSynchronized(output: string): boolean {
  return output.trim().split(/\r?\n/).includes('NTPSynchronized=yes')
}

export interface NtpStatusResult {
  output: string
  status: number
}

export type NtpStatusCommand = () => Promise<NtpStatusResult>

export async function ntpSynchronized(command: NtpStatusCommand = readSystemNtpStatus): Promise<boolean> {
  try {
    const result = await command()
    return result.status === 0 && parseNtpSynchronized(result.output)
  } catch {
    return false
  }
}

async function readSystemNtpStatus(): Promise<NtpStatusResult> {
  const process = Bun.spawn(['timedatectl', 'show', '-p', 'NTPSynchronized'], { stdout: 'pipe', stderr: 'ignore' })
  const output = await new Response(process.stdout).text()
  return { output, status: await process.exited }
}

import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { connection } from 'next/server'
import { Providers } from '../../../components/providers'
import { AppShell } from '../../../features/shell'
import { SHELL_HARNESS_COOKIE, shellHarnessData } from '../../../features/shell/test-request'
import { t } from '../../../features/shell/i18n'
import { ShellTestReady } from '../../../features/shell/test-harness'
import { CommandPalette } from '../../../features/palette'

export const instant = false

export default async function ShellHarness({
  searchParams
}: {
  searchParams: Promise<{ org?: string; project?: string; tab?: string }>
}) {
  if (process.env.APP_ENV !== 'test') notFound()
  const data = shellHarnessData((await cookies()).get(SHELL_HARNESS_COOKIE)?.value)
  const scope = await searchParams
  await connection()
  return (
    <Providers>
      <ShellTestReady>
        <AppShell data={data} scope={scope} now={new Date().toISOString()} palette={<CommandPalette />}>
          <h1>{t('app-shell.overview')}</h1>
        </AppShell>
      </ShellTestReady>
    </Providers>
  )
}

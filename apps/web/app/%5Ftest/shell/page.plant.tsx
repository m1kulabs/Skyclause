import { cookies } from 'next/headers'
import { notFound } from 'next/navigation'
import { Providers } from '../../../components/providers'
import { AppShell } from '../../../features/shell'
import { shellHarnessData } from '../../../features/shell/test-request'
import { t } from '../../../features/shell/i18n'
import { ShellTestReady } from '../../../features/shell/test-harness'

export const instant = false

export default async function ShellHarness({
  searchParams
}: {
  searchParams: Promise<{ org?: string; project?: string; tab?: string }>
}) {
  if (process.env.APP_ENV !== 'test') notFound()
  const data = shellHarnessData((await cookies()).get('skyclause-test-shell')?.value)
  const scope = await searchParams
  return (
    <Providers>
      <ShellTestReady>
        <AppShell data={data} scope={scope}>
          <h1>{t('app-shell.overview')}</h1>
        </AppShell>
      </ShellTestReady>
    </Providers>
  )
}

import { ESLint } from 'eslint'
import { fileURLToPath } from 'node:url'
import { vi, expect, test } from 'vitest'

// Each test starts an ESLint instance, which can take several seconds when the full suite runs in parallel.
vi.setConfig({ testTimeout: 30_000 })

const root = fileURLToPath(new URL('../../..', import.meta.url))
const eslint = new ESLint({ cwd: root, overrideConfigFile: `${root}/eslint.config.mjs` })

test('only planted routes are exempt from the literal JSX guard', async () => {
  const code = 'export const Planted = () => <p>Intentional defect</p>'
  const [plant] = await eslint.lintText(code, { filePath: `${root}/apps/web/page.plant.tsx` })
  const [real] = await eslint.lintText(code, { filePath: `${root}/apps/web/page.tsx` })
  expect(plant?.messages).toEqual([])
  expect(real?.messages.map((message) => message.ruleId)).toContain('skyclause-i18n/no-literal-jsx')
})

test('planted routes retain the date and concatenation guards', async () => {
  const [plant] = await eslint.lintText(
    `import { t } from '@skyclause/i18n'
export const label = t('shell.loading') + new Date().toLocaleTimeString()`,
    { filePath: `${root}/apps/web/page.plant.tsx` }
  )
  expect(plant?.messages.map((message) => message.ruleId)).toEqual(
    expect.arrayContaining(['skyclause-i18n/no-concatenated-translation', 'no-restricted-properties'])
  )
})

test('only the pure clause calendar helper can use Intl for numeric calendar extraction', async () => {
  const code = "export const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'UTC' }).formatToParts(new Date(0))"
  const [calendar] = await eslint.lintText(code, { filePath: `${root}/packages/clauses/src/local-calendar.ts` })
  expect(calendar?.messages).toEqual([])
  for (const path of ['packages/clauses/src/evaluate.ts', 'apps/web/page.tsx']) {
    const [result] = await eslint.lintText(code, { filePath: `${root}/${path}` })
    expect(result?.messages.map((message) => message.ruleId)).toContain('no-restricted-properties')
  }
  const [display] = await eslint.lintText('export const display = new Date(0).toLocaleString()', {
    filePath: `${root}/packages/clauses/src/local-calendar.ts`
  })
  expect(display?.messages.map((message) => message.ruleId)).toContain('no-restricted-properties')
  const [imports] = await eslint.lintText("export { format } from 'date-fns'", {
    filePath: `${root}/packages/clauses/src/local-calendar.ts`
  })
  expect(imports?.messages.map((message) => message.ruleId)).toContain('no-restricted-imports')
})

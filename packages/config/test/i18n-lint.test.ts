import { ESLint } from 'eslint'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

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

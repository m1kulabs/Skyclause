import { ESLint } from 'eslint'
import { fileURLToPath } from 'node:url'
import { expect, test } from 'vitest'

const root = fileURLToPath(new URL('../..', import.meta.url))
const eslint = new ESLint({ cwd: root, overrideConfigFile: `${root}/eslint.config.mjs` })

async function lint(filePath: string, code: string) {
  const [result] = await eslint.lintText(code, { filePath: `${root}/${filePath}` })
  return result?.messages ?? []
}

test('LOC-6 rejects toLocaleTimeString in apps/web', async () => {
  const messages = await lint('apps/web/planted.ts', "new Date().toLocaleTimeString('en-MY')")

  expect(messages.map((message) => message.ruleId)).toContain('no-restricted-properties')
})

test('LOC-6 rejects Intl.DateTimeFormat outside packages/i18n', async () => {
  const messages = await lint('apps/web/planted.ts', "new Intl.DateTimeFormat('en-MY')")

  expect(messages.map((message) => message.ruleId)).toContain('no-restricted-properties')
})

test('NFR-12 rejects literal JSX text in apps/web', async () => {
  const messages = await lint('apps/web/planted.tsx', 'export const Example = () => <p>Literal text</p>')

  expect(messages.map((message) => message.ruleId)).toContain('skyclause-i18n/no-literal-jsx')
})

test('NFR-12 rejects string literals passed as JSX children', async () => {
  const messages = await lint('apps/web/planted.tsx', "export const Example = () => <p>{'Literal text'}</p>")

  expect(messages.map((message) => message.ruleId)).toContain('skyclause-i18n/no-literal-jsx')
})

test('NFR-12 rejects concatenated t() output in apps/web', async () => {
  const code = `import { t } from '@skyclause/i18n'
export const Example = () => <p>{t('quality.label') + ' suffix'}</p>`
  const messages = await lint('apps/web/planted.tsx', code)

  expect(messages.map((message) => message.ruleId)).toContain('skyclause-i18n/no-concatenated-translation')
})

test('NFR-12 rejects concatenated t() output outside JSX in apps/web', async () => {
  const code = `import { t } from '@skyclause/i18n'
export const label = t('quality.label') + ' suffix'`
  const messages = await lint('apps/web/planted.ts', code)

  expect(messages.map((message) => message.ruleId)).toContain('skyclause-i18n/no-concatenated-translation')
})

test('NFR-12 rejects template literals containing t() output in apps/web', async () => {
  const code =
    "import { t } from '@skyclause/i18n'\nexport const Example = () => <p>{`${t('quality.label')} suffix`}</p>"
  const messages = await lint('apps/web/planted.tsx', code)

  expect(messages.map((message) => message.ruleId)).toContain('skyclause-i18n/no-concatenated-translation')
})

test('NFR-12 accepts translated JSX with no concatenation', async () => {
  const code = `import { t } from '@skyclause/i18n'
export const Example = () => <p>{t('quality.label')}</p>`
  const messages = await lint('apps/web/clean.tsx', code)

  expect(messages).toEqual([])
})

test('LOC-6 rejects date library imports outside packages/i18n', async () => {
  const messages = await lint(
    'packages/formatting/src/date.ts',
    "import { format } from 'date-fns'\nformat(new Date(), 'PP')"
  )

  expect(messages.map((message) => message.ruleId)).toContain('no-restricted-imports')
})

test('LOC-6 permits Intl.DateTimeFormat inside packages/i18n', async () => {
  const messages = await lint('packages/i18n/src/format.ts', "new Intl.DateTimeFormat('en-MY')")

  expect(messages).toEqual([])
})

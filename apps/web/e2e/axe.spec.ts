import { expect, test } from './fixtures'

const page = (body: string) =>
  `<!doctype html><html lang="en"><head><title>Planted</title></head><body><main>${body}</main></body></html>`

test('expectAxeClean fails on a serious finding', async ({ page: p, expectAxeClean }) => {
  await p.setContent(page('<p style="color: #999; background: #aaa">Low contrast text</p>'))
  await expect(expectAxeClean(p)).rejects.toThrow(/color-contrast \(serious\)/)
})

test('expectAxeClean fails on a critical finding', async ({ page: p, expectAxeClean }) => {
  await p.setContent(page('<img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=">'))
  await expect(expectAxeClean(p)).rejects.toThrow(/image-alt \(critical\)/)
})

test('expectAxeClean passes a clean page', async ({ page: p, expectAxeClean }) => {
  await p.setContent(page('<h1>Clean</h1><p>Readable text.</p>'))
  await expectAxeClean(p)
})

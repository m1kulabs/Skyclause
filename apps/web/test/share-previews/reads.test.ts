import { ApiError } from '@skyclause/api'
import { createTestApi } from '@skyclause/api/testing'
import { NotBuiltError } from '@skyclause/contracts'
import { expect, test } from 'vitest'
import { ReadFailed, v1Reads } from '../../features/share-previews/reads'
import { call, publicWindow, status } from './doubles'

const notFound = () => {
  throw new ApiError(404, 'not-found', 'Not found.')
}

test("reads #187's three public operations in process, with the client's address and 404 as null", async () => {
  const forwarded: Array<string | undefined> = []
  const { v1 } = createTestApi({
    handlers: {
      getPublicProjectStatus: {
        handler: (c) => {
          forwarded.push(c.req.header('X-Forwarded-For'))
          return c.req.param('org') === 'apu' && c.req.param('project') === 'bukit-jalil'
            ? c.json(status(), 200)
            : notFound()
        }
      },
      getPublicCall: { handler: (c) => (c.req.param('callId') === call().id ? c.json(call(), 200) : notFound()) },
      getPublicWindow: {
        handler: (c) => (c.req.param('id') === publicWindow().id ? c.json(publicWindow(), 200) : notFound())
      }
    }
  })
  const request = new Request('https://skyclause.m1ku.tech/p/apu/bukit-jalil/og.png', {
    headers: { 'X-Forwarded-For': '203.0.113.9' }
  })
  const reads = v1Reads(v1, request)

  expect(await reads.projectStatus('apu', 'bukit-jalil')).toEqual(status())
  expect(await reads.projectStatus('apu', 'private-one')).toBeNull()
  expect(forwarded).toEqual(['203.0.113.9', '203.0.113.9'])
  expect(await reads.call(call().id)).toEqual(call())
  expect(await reads.call('0192f0e4-0000-7000-8000-00000000dead')).toBeNull()
  expect(await reads.window(publicWindow().id)).toEqual(publicWindow())
  expect(await reads.window('0192f0e4-0000-7000-8000-00000000dead')).toBeNull()
})

test('any other answer is a failed read carrying the response, such as 501 while #187 is unbuilt', async () => {
  const { v1 } = createTestApi({
    handlers: {
      getPublicCall: {
        handler: () => {
          throw new NotBuiltError('d-public-api')
        }
      }
    }
  })
  const reads = v1Reads(v1, new Request('https://skyclause.m1ku.tech/c/x/og.png'))

  const failure = await reads.call('x').catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(ReadFailed)
  expect((failure as ReadFailed).response.status).toBe(501)
  await expect(reads.window('x')).rejects.toBeInstanceOf(ReadFailed)
})

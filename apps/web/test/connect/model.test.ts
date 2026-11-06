import { expect, test, vi } from 'vitest'
import { safeConfig, verificationState, createWithStepUp } from '../../features/connect/model'
import { ApiProblem } from '../../lib/api-fetch'

test('configs preserve whitespace and are refused if they contain a key or Authorization header', () => {
  const config = '  {"command":"skyclause","args":["mcp"]}\r\n'
  expect(safeConfig(config)).toBe(config)
  const oauth =
    '{"authorization_url":"https://app.skyclause.m1ku.tech/oauth/authorize","token_url":"https://app.skyclause.m1ku.tech/oauth/token"}'
  expect(safeConfig(oauth)).toBe(oauth)
  for (const unsafe of [
    'skc_test',
    'skg_test',
    'skw_test',
    '{"Authorization":"Bearer token"}',
    'authorization: Bearer token'
  ]) {
    expect(() => safeConfig(unsafe)).toThrow()
  }
})

test('verification status comes from the server result without calculating its age', () => {
  expect(verificationState(undefined)).toBe('not_verified')
  for (const state of ['verified', 'reverify_due', 'not_verified']) expect(verificationState(state)).toBe(state)
  expect(verificationState('new-server-status')).toBe('unknown_verification')
})

test('401 reauth-required awaits shared step-up before retrying once', async () => {
  const write = vi
    .fn()
    .mockRejectedValueOnce(new ApiProblem(401, { type: 'https://skyclause.m1ku.tech/problems/reauth-required' }))
    .mockResolvedValue('created')
  const reauth = vi.fn(async () => {
    expect(write).toHaveBeenCalledTimes(1)
  })
  expect(await createWithStepUp(write, reauth)).toBe('created')
  expect(reauth).toHaveBeenCalledTimes(1)
  expect(write).toHaveBeenCalledTimes(2)
})

test('step-up cancellation and other errors never create a client', async () => {
  const write = vi.fn().mockRejectedValue(new ApiProblem(401, { type: 'reauth-required' }))
  await expect(
    createWithStepUp(write, async () => {
      throw new Error('cancelled')
    })
  ).rejects.toThrow('cancelled')
  expect(write).toHaveBeenCalledTimes(1)
  const reauth = vi.fn()
  await expect(
    createWithStepUp(async () => {
      throw new ApiProblem(403, {})
    }, reauth)
  ).rejects.toThrow()
  expect(reauth).not.toHaveBeenCalled()
})

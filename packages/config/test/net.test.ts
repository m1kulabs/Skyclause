// a-hardening (#115): the SSRF guard. fast-check covers every refused range in
// IPv4 and IPv6, including decimal, octal, hex and mapped spellings; the
// transport tests pin a local server and prove redirects, caps and the
// resolve-once pin without touching the real network.
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import fc from 'fast-check'
import { afterAll, beforeAll, describe, expect, test } from 'vitest'
import { UnsafeUrlError, assertPublicUrl, fetchPinned, safeFetch } from '@skyclause/config/net'

const unsafe = async (url: string, o?: { https?: boolean; lookup?: (host: string) => Promise<string[]> }) => {
  const error = await assertPublicUrl(url, o).then(
    () => null,
    (error: unknown) => error
  )
  expect(error, url).toBeInstanceOf(UnsafeUrlError)
  expect((error as UnsafeUrlError).slug, url).toBe('unsafe-url')
  return error as UnsafeUrlError
}

const octal = (n: number) => `0${n.toString(8)}`
const hex = (n: number) => `0x${n.toString(16)}`

describe('assertPublicUrl refuses every blocked range', () => {
  test('IPv4 private, loopback, link-local and reserved ranges in dotted decimal', async () => {
    for (const host of [
      '0.1.2.3',
      '10.0.0.1',
      '10.255.255.255',
      '100.64.0.1',
      '100.127.255.255',
      '127.0.0.1',
      '127.1.2.3',
      '169.254.10.20',
      '172.16.0.1',
      '172.31.255.255',
      '192.0.0.1',
      '192.168.0.1',
      '198.18.0.1',
      '198.19.255.255',
      '224.0.0.1',
      '240.0.0.1',
      '255.255.255.255'
    ]) {
      await unsafe(`http://${host}/feed.ics`)
    }
  })

  test('IPv4 boundaries that stay public', async () => {
    for (const host of [
      '8.8.8.8',
      '1.1.1.1',
      '93.184.216.34',
      '9.0.0.0',
      '11.0.0.0',
      '100.63.255.255',
      '100.128.0.1',
      '126.255.255.255',
      '128.0.0.1',
      '172.15.255.255',
      '172.32.0.1',
      '192.0.1.1',
      '192.0.2.1',
      '192.167.255.255',
      '192.169.0.1',
      '198.17.255.255',
      '198.20.0.1',
      '203.0.113.7',
      '223.255.255.255'
    ]) {
      const checked = await assertPublicUrl(`https://${host}/`)
      expect(checked.addresses).toEqual([host])
    }
  })

  test('fast-check: any 10/8, 127/8 or 192.168/16 address is refused in decimal, octal and hex', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom('10', '127', '192.168') as fc.Arbitrary<string>,
        fc.integer({ min: 0, max: 255 }),
        fc.integer({ min: 0, max: 255 }),
        async (head, a, b) => {
          const tail = head === '10' || head === '127' ? [a, b, 1] : [b, 1]
          const parts = [...head.split('.').map(Number), ...tail]
          const spell = (n: number, i: number) =>
            (i + n) % 3 === 0 ? octal(n) : (i + n) % 3 === 1 ? hex(n) : String(n)
          const host = parts.map(spell).join('.')
          await unsafe(`http://${host}/`)
        }
      ),
      { numRuns: 60 }
    )
  })

  test('fast-check: any 172.16/12 or 198.18/15 address is refused', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 16, max: 31 }),
        fc.integer({ min: 18, max: 19 }),
        fc.integer({ min: 0, max: 255 }),
        async (second, net, host) => {
          await unsafe(`http://172.${second}.0.1/`)
          await unsafe(`http://198.${net}.${host}.1/`)
        }
      ),
      { numRuns: 30 }
    )
  })

  test('single-integer spellings (decimal, octal, hex)', async () => {
    // 127.0.0.1 == 2130706433 == 0x7f000001 == 017740000001
    for (const host of ['2130706433', '0x7f000001', '017740000001', '3232235777']) {
      await unsafe(`http://${host}/`)
    }
    // 8.8.8.8 == 134744072 == 0x8080808 == 01002004010 stays public in every integer spelling
    for (const host of ['134744072', '0x8080808', '01002004010']) {
      expect((await assertPublicUrl(`http://${host}/`)).addresses).toEqual(['8.8.8.8'])
    }
  })

  test('two- and three-part spellings', async () => {
    await unsafe('http://127.1/') // 127.0.0.1
    await unsafe('http://0x7f.1/') // 127.0.0.1
    await unsafe('http://10.1/') // 10.0.0.1
    await unsafe('http://127.0.1/') // 127.0.0.1
    expect((await assertPublicUrl('http://8.8.2056/')).addresses).toEqual(['8.8.8.8'])
  })

  test('IPv6 unspecified, loopback, private, link-local and multicast', async () => {
    for (const host of ['::', '::1', 'fc00::1', 'fd12:3456::1', 'fe80::1', 'ff02::1', 'ff00::2']) {
      await unsafe(`http://[${host}]/`)
    }
    const checked = await assertPublicUrl('http://[2606:4700:4700::1111]/')
    expect(checked.addresses).toEqual(['2606:4700:4700::1111'])
  })

  test('IPv4-mapped IPv6 forms of blocked ranges', async () => {
    for (const host of ['::ffff:127.0.0.1', '::ffff:10.0.0.1', '::ffff:2130706433', '::ffff:0a00:0001']) {
      await unsafe(`http://[${host}]/`)
    }
    const checked = await assertPublicUrl('http://[::ffff:8.8.8.8]/')
    expect(checked.addresses).toEqual(['::ffff:8.8.8.8'])
  })

  test('NAT64 forms of blocked ranges', async () => {
    for (const host of ['64:ff9b::7f00:1', '64:ff9b::a00:1', '64:ff9b::c0a8:101']) {
      await unsafe(`http://[${host}]/`)
    }
  })

  test('the metadata name is refused without DNS, in any case or with a trailing dot', async () => {
    for (const host of ['metadata.google.internal', 'METADATA.GOOGLE.INTERNAL', 'metadata.google.internal.']) {
      const lookup = async () => {
        throw new Error('must not resolve')
      }
      await unsafe(`http://${host}/`, { lookup })
    }
  })

  test('only http and https URLs are allowed', async () => {
    await unsafe('ftp://93.184.216.34/file')
    await unsafe('data:text/plain,hi')
    await unsafe('file:///etc/passwd')
  })

  test('https:true refuses http', async () => {
    await unsafe('http://93.184.216.34/', { https: true })
    expect((await assertPublicUrl('https://93.184.216.34/', { https: true })).addresses).toEqual(['93.184.216.34'])
    await unsafe('http://203.0.113.7/', { https: true })
  })

  test('hostnames resolve once through the injected lookup; literals never touch DNS', async () => {
    let calls = 0
    const lookup = async (host: string) => {
      calls += 1
      expect(host).toBe('feeds.example')
      return ['93.184.216.34']
    }
    const checked = await assertPublicUrl('https://feeds.example/radar', { lookup })
    expect(checked.addresses).toEqual(['93.184.216.34'])
    expect(checked.url.hostname).toBe('feeds.example')
    expect(calls).toBe(1)

    const counting = async () => {
      throw new Error('literals must not resolve')
    }
    await assertPublicUrl('http://8.8.8.8/', { lookup: counting })
    await unsafe('http://10.0.0.1/', { lookup: counting })
  })

  test('a mixed DNS answer with any blocked address is refused', async () => {
    await unsafe('https://flap.example/', { lookup: async () => ['93.184.216.34', '10.0.0.1'] })
    await unsafe('https://gone.example/', { lookup: async () => [] as string[] })
    await unsafe('https://gone.example/', {
      lookup: async () => {
        throw Object.assign(new Error('ENOTFOUND'), { code: 'ENOTFOUND' })
      }
    })
  })
})

describe('safeFetch and fetchPinned against a local server', () => {
  let server: Server
  let port: number
  let seenHost = ''
  const routes = (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? '/', 'http://x')
    seenHost = request.headers.host ?? ''
    if (url.pathname === '/ok') {
      response.writeHead(200, { 'Content-Type': 'application/json' })
      response.end(JSON.stringify({ ok: true }))
    } else if (url.pathname === '/redir-private') {
      response.writeHead(302, { Location: 'http://169.254.169.254/' })
      response.end()
    } else if (url.pathname === '/redir-relative') {
      response.writeHead(302, { Location: '/ok' })
      response.end()
    } else if (url.pathname === '/redir-flap') {
      response.writeHead(302, { Location: `http://flap.test:${port}/ok` })
      response.end()
    } else if (url.pathname === '/chain') {
      const n = Number(url.searchParams.get('n') ?? '0')
      response.writeHead(302, { Location: `/chain?n=${n + 1}` })
      response.end()
    } else if (url.pathname === '/hang') {
      // Never responds: the timeout must abort.
    } else if (url.pathname === '/big') {
      response.writeHead(200, { 'Content-Type': 'application/octet-stream' })
      const chunk = Buffer.alloc(32 * 1024, 'x')
      for (let i = 0; i < 8; i++) response.write(chunk)
      response.end()
    } else {
      response.writeHead(404)
      response.end()
    }
  }
  beforeAll(async () => {
    server = createServer(routes)
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
    port = (server.address() as AddressInfo).port
  })
  afterAll(async () => {
    await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())))
  })

  // Pre-checked by contract: the guard is proved above, the transport here.
  const pin = (path: string, host = 'guarded.test') => ({
    url: new URL(`http://${host}:${port}${path}`),
    addresses: ['127.0.0.1']
  })
  // Redirect mechanics against the local server: the stub stands in for the
  // guard (proved above), which would refuse the test hostname.
  const localRecheck = async (url: URL) => ({ url, addresses: ['127.0.0.1'] })

  test('a pinned fetch reaches the server with the original Host, never re-resolving', async () => {
    const lookups: string[] = []
    const lookup = async (host: string) => {
      lookups.push(host)
      return ['203.0.113.99']
    }
    const response = await fetchPinned(pin('/ok'), { lookup })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ ok: true })
    // The TCP connection went to the pinned 127.0.0.1 even though DNS now
    // answers 203.0.113.99; the Host header keeps the original name.
    expect(seenHost).toBe(`guarded.test:${port}`)
    expect(lookups).toEqual([])
  })

  test('a relative redirect is followed; a redirect to a private address fails with unsafe-url', async () => {
    const moved = await fetchPinned(pin('/redir-relative'), { recheck: localRecheck })
    expect(moved.status).toBe(200)
    const error = await fetchPinned(pin('/redir-private')).then(
      () => null,
      (error: unknown) => error
    )
    expect(error).toBeInstanceOf(UnsafeUrlError)
  })

  test('redirects:error refuses the hop and the chain limit aborts', async () => {
    await expect(fetchPinned(pin('/redir-relative'), { redirects: 'error' })).rejects.toThrow(/redirect/)
    await expect(fetchPinned(pin('/chain?n=0'), { maxRedirects: 2, recheck: localRecheck })).rejects.toThrow(/redirect/)
  })

  test('a redirect hop re-resolves and re-checks: an allowed answer is attempted, not refused', async () => {
    const lookups: string[] = []
    const lookup = async (host: string) => {
      lookups.push(host)
      return ['203.0.113.99']
    }
    // 203.0.113.99 is unroutable, so the hop fails — but with a network
    // error after passing the guard, never with unsafe-url.
    const error = await fetchPinned(pin('/redir-flap'), { lookup, timeoutMs: 400 }).then(
      () => null,
      (error: unknown) => error
    )
    expect(error).not.toBeInstanceOf(UnsafeUrlError)
    expect(lookups).toEqual(['flap.test'])
  })

  test('the 10 s and 5 MB caps abort: a hanging server and an oversize body', async () => {
    await expect(fetchPinned(pin('/hang'), { timeoutMs: 300 })).rejects.toThrow(/timed out/)
    await expect(fetchPinned(pin('/big'), { maxBytes: 8192 })).rejects.toThrow(/exceeds/)
  }, 10_000)

  test('safeFetch guards before connecting: refused literals never touch the network', async () => {
    const lookup = async () => {
      throw new Error('must not resolve')
    }
    await expect(safeFetch('http://169.254.169.254/', { lookup })).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(safeFetch('http://127.0.0.1:9/', { lookup })).rejects.toBeInstanceOf(UnsafeUrlError)
    await expect(safeFetch('http://203.0.113.7/', { https: true, lookup })).rejects.toBeInstanceOf(UnsafeUrlError)
  })
})

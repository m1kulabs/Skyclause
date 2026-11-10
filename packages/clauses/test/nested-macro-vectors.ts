// Independent allowed-subset cases shared by Vitest and Node/Bun/browser parity.
export const nestedMacroVectors = [
  { name: 'nested literal overload', when: '[1].all(x, [1.0].all(y, y + 1 > 0))', result: 'rejected' },
  { name: 'nested list element overload', when: '[[1.0]].all(xs, xs.all(x, x + 1 > 0))', result: 'rejected' },
  { name: 'three nested macros', when: '[1].all(x, [1].all(y, [1.0].all(z, z + 1 > 0)))', result: 'rejected' },
  {
    name: 'nested macro in boolean expression',
    when: '[1].all(x, x == 1 && [1.0].all(y, y + 1 > 0))',
    result: 'rejected'
  },
  { name: 'shadowed variable overload', when: '[1].all(x, [1.0].all(x, x + 1 > 0))', result: 'rejected' },
  { name: 'nested exists overload', when: '[1].exists(x, [1.0].exists(y, y + 1 > 0))', result: 'rejected' },
  {
    name: 'three list element levels',
    when: '[[[1.0]]].all(xss, xss.all(xs, xs.all(x, x + 1 > 0)))',
    result: 'rejected'
  },
  { name: 'nested literal matching double', when: '[1].all(x, [1.0].all(y, y + 1.0 > 0.0))', result: 'fired' },
  { name: 'nested list matching double', when: '[[1.0]].all(xs, xs.all(x, x + 1.0 > 0.0))', result: 'fired' },
  { name: 'three valid nested macros', when: '[1].all(x, [1].all(y, [1.0].all(z, z + 1.0 > 0.0)))', result: 'fired' },
  {
    name: 'valid nested boolean expression',
    when: '[1].all(x, x == 1 && [1.0].all(y, y + 1.0 > 0.0))',
    result: 'fired'
  },
  {
    name: 'shadowed variable restores outer type',
    when: '[1].all(x, [1.0].all(x, x + 1.0 > 0.0) && x + 1 == 2)',
    result: 'fired'
  },
  { name: 'nested exists matching double', when: '[1].exists(x, [1.0].exists(y, y + 1.0 > 0.0))', result: 'fired' },
  {
    name: 'three valid list levels',
    when: '[[[1.0]]].all(xss, xss.all(xs, xs.all(x, x + 1.0 > 0.0)))',
    result: 'fired'
  },
  {
    name: 'nested predicate captures outer variable',
    when: '[1].all(x, [1.0].all(y, y + double(x) > 0.0))',
    result: 'fired'
  },
  { name: 'nested exists false result', when: '[1].exists(x, [1.0].exists(y, y + 1.0 < 0.0))', result: 'not_fired' }
] as const

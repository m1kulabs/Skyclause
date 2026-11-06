// Canonical texts follow RFC8785 §§3.2.2–3.2.4 and Appendix B; extra cases are hand-written.
// Fixed digests were derived independently with Python hashlib.sha256(canonical.encode("utf-8")).
export const canonicalVectors: { name: string; value: unknown; digest: string }[] = [
  { name: 'null', value: null, digest: '74234e98afe7498fb5daf1f36ac2d78acc339464f950703b8c019892f982b90b' },
  { name: 'boolean', value: true, digest: 'b5bea41b6c623f7c09f1bf24dcae58ebab3c0cdd90ad966bc43a45b44867e12b' },
  {
    name: 'nested members',
    value: { z: [{ b: 2, a: 1 }, null], a: { y: false, x: 'yes' } },
    digest: 'edbfc6738de4cc6b2b1fdbc22c42de07330fcf2769f3d46b323379adc9d5cc51'
  },
  {
    name: 'numeric-looking keys',
    value: { '2': 'two', '10': 'ten', '1': 'one', '01': 'zero one' },
    digest: 'cc52c78359465b1c2beb88f01195e07a34d57bc0bf69f668b436086d75330da3'
  },
  {
    name: 'RFC8785 section 3.2.3 sorting',
    value: {
      '\u20ac': 'Euro Sign',
      '\r': 'Carriage Return',
      '\ufb33': 'Hebrew Letter Dalet With Dagesh',
      '1': 'One',
      '\ud83d\ude00': 'Emoji: Grinning Face',
      '\u0080': 'Control',
      '\u00f6': 'Latin Small Letter O With Diaeresis'
    },
    digest: '5e321556d22018a9656991a9e94f77ec175fa193e52a2429d312f8419ec8b08c'
  },
  {
    name: 'RFC8785 section 3.2.2 sample',
    value: {
      numbers: [Number('333333333.33333329'), 1e30, 4.5, 2e-3, 1e-27],
      string: '\u20ac$\u000F\u000aA\'\u0042\u0022\u005c\\"/',
      literals: [null, true, false]
    },
    digest: '2d5e01a318d0f0879ab568c4be289c8b1f64ef8921a53c6277d5e069978baacb'
  },
  {
    name: 'raw key escapes',
    value: { '\\': 1, '\n': 2, '"': 3, '': 4 },
    digest: 'aca41f45e0734fcb8bc30a7dc4212102400da1318b4dd9a3441812f4de365f9b'
  },
  {
    name: 'all string escape forms',
    value: '\u0000\b\t\n\f\r\u001f"\\/😀',
    digest: '9b183bc4ef035ee426c3039fab4b437df5e370591882340406cd06b3ad2e9966'
  },
  { name: 'composed Unicode', value: 'é', digest: 'f2886017e9c7abacf804b54d64787dce2b611c9544ba21f3affdd126a6e50086' },
  {
    name: 'decomposed Unicode',
    value: 'e\u0301',
    digest: '3d68ce21f2899a475713cdbe7562ba9bdb6b1dfde8af1f221bdff4a0935b53b2'
  },
  { name: 'negative zero', value: -0, digest: '5feceb66ffc86f38d952786c6d696c79c2dbc239dd4e91b46729d73a27fb57e9' },
  { name: 'array order', value: [3, 1, 2], digest: '51bda7ab4e44726cde71fcb6e4b515357059bb6b6dd5146d1fc50f73f11678c6' },
  {
    name: 'RFC8785 appendix B finite boundaries',
    value: [
      Number.MIN_VALUE,
      -Number.MIN_VALUE,
      Number.MAX_VALUE,
      -Number.MAX_VALUE,
      9007199254740992,
      1e23,
      1e21,
      1e20,
      1e-6,
      1e-7
    ],
    digest: 'a0f974d4c93a0bcdbce66819a7608c9d7d9bb7760bd7779875647a9a10b4b43b'
  }
]

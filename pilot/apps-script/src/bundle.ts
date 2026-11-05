import * as main from './main.ts'

// Apps Script only calls top-level functions, so the build appends one per main.ts export that calls through here.
;(globalThis as { Skyclause?: typeof main }).Skyclause = main

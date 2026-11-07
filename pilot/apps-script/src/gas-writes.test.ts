import { expect, test } from 'bun:test'
import { appendRows, readColumns, skyReplayPorts } from './gas.ts'
import { columnsOf, type Cell, type Row } from './schema.ts'

// Characterizes the native Sheets boundary: setValues parses '=' as a formula
// and a leading apostrophe as the text-input escape. Live checks cover Google itself.
function withClausesSheet(run: () => void): void {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'SpreadsheetApp')
  const cells: Cell[][] = [[...columnsOf('clauses')]]
  const target = {
    getLastRow: () => cells.length,
    getRange(row: number, column: number, height: number, width: number) {
      return {
        getValues: () =>
          Array.from({ length: height }, (_, y) =>
            Array.from({ length: width }, (_, x) => cells[row - 1 + y]?.[column - 1 + x] ?? '')
          ),
        setValues(values: Cell[][]) {
          expect(values).toHaveLength(height)
          values.forEach((valuesRow, y) => {
            expect(valuesRow).toHaveLength(width)
            const stored = (cells[row - 1 + y] ??= [])
            valuesRow.forEach((value, x) => {
              stored[column - 1 + x] =
                typeof value === 'string' && value.startsWith("'")
                  ? value.slice(1)
                  : typeof value === 'string' && value.startsWith('=')
                    ? '#ERROR!'
                    : value
            })
          })
        }
      }
    }
  }
  Object.defineProperty(globalThis, 'SpreadsheetApp', {
    configurable: true,
    value: {
      openById(id: string) {
        expect(id).toBe('dev-sheet')
        return {
          getSheetByName(name: string) {
            expect(name).toBe('clauses')
            return target
          }
        }
      }
    }
  })
  try {
    run()
  } finally {
    if (original) Object.defineProperty(globalThis, 'SpreadsheetApp', original)
    else delete (globalThis as Record<string, unknown>).SpreadsheetApp
  }
}

const clause: Row<'clauses'> = {
  pack: 'sky',
  key: 'storm_watch',
  op: '==',
  threshold: true,
  rank: 0,
  enabled: false,
  wording_en: '=retain this wording as text'
}

function expectLiteralClause(): void {
  expect(
    readColumns('dev-sheet', 'clauses', ['op', 'threshold', 'rank', 'enabled', 'wording_en', 'span_from'])
  ).toEqual([
    {
      op: '==',
      threshold: true,
      rank: 0,
      enabled: false,
      wording_en: '=retain this wording as text',
      span_from: ''
    }
  ])
}

test('appended clause equality operators round-trip as text instead of Sheets formulas', () => {
  withClausesSheet(() => {
    appendRows('dev-sheet', 'clauses', [clause])
    expectLiteralClause()
  })
})

test('replay clause replacement preserves equality operators and scalar types', () => {
  withClausesSheet(() => {
    skyReplayPorts('dev-sheet', 'replay-folder').replaceClauses([clause])
    expectLiteralClause()
  })
})

/// <reference types="node" />
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GRANTS, GRANT_QUALIFIERS, GRANT_SUBJECTS, SCOPE_STATEMENTS, STATEMENTS } from '../src/auth'

const matrixStatements = [
  'project.view',
  'ledger.view',
  'window.declare',
  'run.request',
  'evidence.request',
  'clause_draft.edit',
  'clause_sheet.publish',
  'bundle.approve',
  'listing.decide',
  'rota.manage',
  'sources.manage',
  'channels.manage',
  'integrations.manage',
  'ai_keys.manage',
  'api_key.create',
  'members.manage',
  'share_link.create',
  'public_pages.edit',
  'org.export',
  'audit.view',
  'billing.manage',
  'org.delete'
] as const

const prd = readFileSync(new URL('../../../docs/PRD.md', import.meta.url), 'utf8')
const matrix = prd.split('## Roles and permissions')[1]!.split('## Requirements')[0]!
const rows = matrix
  .split('\n')
  .filter((line) => line.startsWith('|'))
  .slice(2)

// The expectations below interpret PRD cells independently of the contracts data.
const qualifiers = (cell: string) => {
  const values = []
  if (cell.startsWith('Own')) values.push('own')
  if (cell.includes('capped')) values.push('capped')
  if (cell.includes('not to Owner')) values.push('not_to_owner')
  if (cell === 'Commons' || cell === 'Guest window') values.push('commons')
  if (['Shared project', 'Reviewer link', 'By declaring a window'].includes(cell)) values.push('shared_project')
  if (cell.startsWith('Budgeted')) values.push('budgeted')
  if (cell === 'View') values.push('view')
  if (cell === 'Never') values.push('never')
  return values
}

describe('permission contracts', () => {
  it('statements are exactly the 22 PRD rows plus the three Spec §1 additions', () => {
    expect(STATEMENTS).toEqual([...matrixStatements, 'listing.propose', 'project.manage', 'org.manage'])
    expect(new Set(STATEMENTS).size).toBe(25)
  })

  it('walks every PRD matrix cell against the grants', () => {
    expect(rows).toHaveLength(22)
    expect(GRANT_SUBJECTS).toHaveLength(10)
    rows.forEach((row, index) => {
      const statement = matrixStatements[index]!
      const cells = row
        .split('|')
        .slice(2, -1)
        .map((cell) => cell.trim().replaceAll('`', ''))
      expect(cells).toHaveLength(10)
      GRANT_SUBJECTS.forEach((subject, column) => {
        const cell = cells[column]!
        const grant = GRANTS[statement][subject]
        expect(grant.label, `${statement}: ${subject}`).toBe(cell)
        expect(grant.allowed, `${statement}: ${subject}`).toBe(!['No', 'Never'].includes(cell))
        expect(grant.qualifiers, `${statement}: ${subject}`).toEqual(qualifiers(cell))
        const scope = ['read', 'draft', 'admin'].includes(cell) ? cell : undefined
        expect(grant.scope, `${statement}: ${subject}`).toBe(scope)
        for (const qualifier of grant.qualifiers) expect(GRANT_QUALIFIERS).toContain(qualifier)
      })
    })
  })

  it('admits approvers to rota.manage only for their own shifts', () => {
    expect(GRANTS['rota.manage'].approver).toMatchObject({ allowed: true, qualifiers: ['own'] })
  })

  it('gives the added statements only their Spec §1 roles and scopes', () => {
    for (const subject of GRANT_SUBJECTS) {
      expect(GRANTS['listing.propose'][subject].allowed).toBe(
        ['owner', 'admin', 'approver', 'editor', 'api_key', 'mcp_token'].includes(subject)
      )
      for (const statement of ['project.manage', 'org.manage'] as const) {
        expect(GRANTS[statement][subject].allowed).toBe(['owner', 'admin'].includes(subject))
      }
    }
    expect(SCOPE_STATEMENTS.draft).toContain('listing.propose')
  })

  it('uses one scope map matching every API key and MCP token matrix cell', () => {
    for (const statement of matrixStatements) {
      for (const subject of ['api_key', 'mcp_token'] as const) {
        const grant = GRANTS[statement][subject]
        const scopes = subject === 'api_key' ? (['read', 'draft', 'admin'] as const) : (['read', 'draft'] as const)
        for (const scope of scopes) {
          expect(SCOPE_STATEMENTS[scope].includes(statement)).toBe(grant.scope === scope)
        }
      }
    }
  })

  it('no API key or MCP scope maps to approval, publishing or listing decisions', () => {
    for (const statements of Object.values(SCOPE_STATEMENTS)) {
      for (const forbidden of ['bundle.approve', 'clause_sheet.publish', 'listing.decide']) {
        expect(statements).not.toContain(forbidden)
      }
    }
  })
})

// The Neon API v2 calls the restore drill makes, and nothing else. Neon can't scope a key to
// branch names (a project-scoped key may change anything in its project), so this client refuses
// to create or delete a branch not named `drill-*`; Neon refuses to delete the default branch.

const API = 'https://console.neon.tech/api/v2'
const DRILL_NAME = /^drill-/

export interface DrillBranch {
  id: string
  name: string
  endpointId: string
  /** The branch's compute host; its roles and passwords are the parent's. */
  host: string
}

export type EndpointState = 'init' | 'active' | 'idle'

export interface NeonClient {
  /** The project's restore window, `history_retention_seconds`. */
  historyWindowSeconds(): Promise<number>
  /** How many snapshots the project holds. */
  snapshotCount(): Promise<number>
  /** Branches whose name starts with `prefix`, as `{ id, name }`. */
  branchesNamed(prefix: string): Promise<Array<{ id: string; name: string }>>
  /** Branches the default branch at `point` with one read-write compute. */
  createDrillBranch(name: string, point: Date): Promise<DrillBranch>
  endpointState(endpointId: string): Promise<EndpointState>
  deleteDrillBranch(branch: { id: string; name: string }): Promise<void>
}

export interface NeonClientOptions {
  apiKey: string
  projectId: string
  fetch?: typeof globalThis.fetch
}

function assertDrillName(name: string) {
  if (!DRILL_NAME.test(name)) throw new Error(`refusing branch ${name}: the drill touches only drill-* branches`)
}

export function createNeonClient({ apiKey, projectId, fetch = globalThis.fetch }: NeonClientOptions): NeonClient {
  const project = `/projects/${encodeURIComponent(projectId)}`

  // Never surfaces a response body: the create response carries a role password.
  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    const response = await fetch(API + path, {
      method,
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${apiKey}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' })
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    })
    if (!response.ok) {
      const message = await response.json().then(
        (error: unknown) => {
          const text = (error as { message?: unknown } | null)?.message
          return typeof text === 'string' ? text : ''
        },
        () => ''
      )
      throw new Error(`Neon API ${method} ${path}: ${response.status} ${message}`.trim())
    }
    // DELETE answers 200 with a body or 204 without one.
    return (response.status === 204 ? undefined : await response.json()) as T
  }

  return {
    async historyWindowSeconds() {
      const { project: found } = await call<{ project: { history_retention_seconds: number } }>('GET', project)
      return found.history_retention_seconds
    },

    async snapshotCount() {
      const { snapshots } = await call<{ snapshots: unknown[] }>('GET', `${project}/snapshots`)
      return snapshots.length
    },

    async branchesNamed(prefix) {
      const { branches } = await call<{ branches: Array<{ id: string; name: string }> }>('GET', `${project}/branches`)
      return branches.filter((branch) => branch.name.startsWith(prefix)).map(({ id, name }) => ({ id, name }))
    },

    async createDrillBranch(name, point) {
      assertDrillName(name)
      const { branch, endpoints } = await call<{
        branch: { id: string; name: string }
        endpoints: Array<{ id: string; host: string }>
      }>('POST', `${project}/branches`, {
        branch: { name, parent_timestamp: point.toISOString() },
        endpoints: [{ type: 'read_write' }]
      })
      const endpoint = endpoints[0]
      if (!endpoint) throw new Error(`Neon created branch ${branch.id} without a compute`)
      return { id: branch.id, name: branch.name, endpointId: endpoint.id, host: endpoint.host }
    },

    async endpointState(endpointId) {
      const { endpoint } = await call<{ endpoint: { current_state: EndpointState } }>(
        'GET',
        `${project}/endpoints/${encodeURIComponent(endpointId)}`
      )
      return endpoint.current_state
    },

    async deleteDrillBranch({ id, name }) {
      assertDrillName(name)
      await call('DELETE', `${project}/branches/${encodeURIComponent(id)}`)
    }
  }
}

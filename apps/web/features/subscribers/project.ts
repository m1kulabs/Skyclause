import { apiFetch } from '../subscribe/operations'

/** Resolve the route slug through project.view; never send a slug as a project ID. */
export async function resolveProject(org: string, slug: string, signal?: AbortSignal) {
  const page = await apiFetch('listProjects', { org, query: { slug }, signal })
  return page.data.find((project) => project.slug === slug)
}

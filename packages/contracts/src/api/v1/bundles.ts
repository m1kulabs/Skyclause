import { listProjectBundles } from './bundles/listProjectBundles'
import { streamBundles } from './bundles/streamBundles'
import { getBundle } from './bundles/getBundle'
import { listOrganisationBundles } from './bundles/listOrganisationBundles'

export { listProjectBundles } from './bundles/listProjectBundles'
export { streamBundles } from './bundles/streamBundles'
export { getBundle } from './bundles/getBundle'
export { listOrganisationBundles } from './bundles/listOrganisationBundles'

export const routes = [listProjectBundles, streamBundles, getBundle, listOrganisationBundles] as const

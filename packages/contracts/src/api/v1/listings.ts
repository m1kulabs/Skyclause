import { listProjectListings } from './listings/listProjectListings'
import { proposeListing } from './listings/proposeListing'
import { listOrganisationListings } from './listings/listOrganisationListings'

export { listProjectListings } from './listings/listProjectListings'
export { proposeListing } from './listings/proposeListing'
export { listOrganisationListings } from './listings/listOrganisationListings'

export const routes = [listProjectListings, proposeListing, listOrganisationListings] as const

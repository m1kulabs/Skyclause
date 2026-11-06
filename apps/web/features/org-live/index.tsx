// Spec §1 shared parts owned by `d-org-live` (#178). Mounted by the shell (#96): OrgLive in the organisation layout,
// ApprovalsCount in the sidebar. Props are route slugs, the values the layouts hold.
export interface OrgLiveProps {
  org: string
}

export interface ApprovalsCountProps {
  org?: string
}

export function OrgLive(_props: OrgLiveProps) {
  return <div data-unbuilt="d-org-live" />
}

export function ApprovalsCount(_props: ApprovalsCountProps) {
  return <span data-unbuilt="d-org-live" />
}

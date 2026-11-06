'use client'

// Spec §1 shared part owned by `b-windows-ui` (#143), mounted in the project layout (#96) with route slugs.
export interface DeclareWindowDialogProps {
  org: string
  project: string
  open?: boolean
  onOpenChange?: (open: boolean) => void
}

export function DeclareWindowDialog(_props: DeclareWindowDialogProps) {
  return <div data-unbuilt="b-windows-ui" hidden />
}

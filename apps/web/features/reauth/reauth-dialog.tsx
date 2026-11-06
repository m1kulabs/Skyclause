'use client'

export interface ReauthDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ReauthDialog(_props: ReauthDialogProps) {
  return <div data-unbuilt="a-step-up" hidden />
}

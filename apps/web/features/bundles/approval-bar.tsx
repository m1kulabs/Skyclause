'use client'

import { Button } from '#ui/button'
import { Kbd } from '#ui/kbd'
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
  DrawerClose
} from '#ui/drawer'
import { t } from './i18n'
import { formatTime } from '@skyclause/i18n/format'
import { SlaCapsule } from './time'

/** The call the bar's Edit and Reject act on: the focused call, else the first one that can still be reviewed. */
export interface BarCall {
  name: string
  rejected: boolean
  onEdit: () => void
  onReject: () => void
}

/**
 * The decision bar, stuck to the bottom of the screen: the SLA countdown, Edit and Reject for the current call, and
 * Approve for the bundle, so none of them needs a scroll. On a phone Approve opens a confirming drawer.
 */
export function ApprovalBar({
  count,
  disabled,
  pending,
  shortcuts,
  sla,
  now,
  call,
  reason,
  onApprove
}: {
  count: number
  disabled: boolean
  pending: boolean
  shortcuts: boolean
  sla: string | null
  now: number
  call?: BarCall
  /** Why Approve is disabled, when the reviewer can fix it: a missing verdict, a teaching line left in. */
  reason?: string
  onApprove: () => void
}) {
  const label = pending ? t('bundles.pending') : count ? t('bundles.approve', { count }) : t('bundles.save_decisions')
  const deadline = sla ? t('bundles.sla', { time: formatTime(sla, 'en') }) : null
  return (
    <footer className="bundle-approval-bar">
      <div className="bundle-approval-panel">
        {sla && <SlaCapsule due={sla} now={now} />}
        {call && (
          <div className="bundle-approval-call">
            <span className="bundle-approval-name" id="bundle-approval-name">
              {call.name}
            </span>
            <Button variant="outline" disabled={pending} aria-describedby="bundle-approval-name" onClick={call.onEdit}>
              {t('bundles.edit')}
              {shortcuts && <Kbd className="bundle-kbd">{t('bundles.key_e')}</Kbd>}
            </Button>
            <Button
              variant="outline"
              disabled={pending}
              aria-describedby="bundle-approval-name"
              onClick={call.onReject}
            >
              {t(call.rejected ? 'bundles.restore' : 'bundles.reject')}
              {shortcuts && <Kbd className="bundle-kbd">{t('bundles.key_r')}</Kbd>}
            </Button>
          </div>
        )}
        {reason && <p className="bundle-approval-reason">{reason}</p>}
        <Button className="bundle-approve" disabled={disabled} onClick={onApprove}>
          {label}
          {shortcuts && <Kbd className="bundle-kbd">{t('bundles.key_a')}</Kbd>}
        </Button>
        <div className="bundle-phone-approval">
          <Drawer>
            <DrawerTrigger render={<Button />}>{t('bundles.approval')}</DrawerTrigger>
            <DrawerContent className="bundle-approval-drawer">
              <DrawerHeader>
                <DrawerTitle>{t('bundles.approval')}</DrawerTitle>
                <DrawerDescription>{deadline}</DrawerDescription>
                {reason && <p className="bundle-drawer-reason">{reason}</p>}
              </DrawerHeader>
              <DrawerFooter>
                <Button className="bundle-phone-confirm" disabled={disabled} onClick={onApprove}>
                  {label}
                </Button>
                <DrawerClose render={<Button variant="outline" />}>{t('bundles.cancel')}</DrawerClose>
              </DrawerFooter>
            </DrawerContent>
          </Drawer>
        </div>
      </div>
    </footer>
  )
}

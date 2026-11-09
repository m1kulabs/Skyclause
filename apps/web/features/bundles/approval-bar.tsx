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
import { ButtonGroup } from '#ui/button-group'

export function ApprovalBar({
  count,
  disabled,
  pending,
  shortcuts,
  sla,
  onApprove
}: {
  count: number
  disabled: boolean
  pending: boolean
  shortcuts: boolean
  sla: string | null
  onApprove: () => void
}) {
  const label = pending ? t('bundles.pending') : count ? t('bundles.approve', { count }) : t('bundles.save_decisions')
  const deadline = sla ? t('bundles.sla', { time: formatTime(sla, 'en') }) : null
  return (
    <>
      <footer className="bundle-approval-bar">
        <span>{deadline}</span>
        <ButtonGroup>
          <Button disabled={disabled} onClick={onApprove}>
            {label}
            {shortcuts && <Kbd>{t('bundles.key_a')}</Kbd>}
          </Button>
        </ButtonGroup>
      </footer>
      <div className="bundle-phone-approval">
        <Drawer>
          <DrawerTrigger render={<Button variant="outline" />}>{t('bundles.approval')}</DrawerTrigger>
          <DrawerContent className="bundle-approval-drawer">
            <DrawerHeader>
              <DrawerTitle>{t('bundles.approval')}</DrawerTitle>
              <DrawerDescription>{deadline}</DrawerDescription>
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
    </>
  )
}

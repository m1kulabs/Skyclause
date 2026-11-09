'use client'

import { useId, useRef, type MouseEvent, type ReactNode } from 'react'
import styles from './public-chrome.module.css'

export function AttributionLink({
  children,
  details,
  dialogTitle,
  sourceName,
  closeLabel,
  linkLabel
}: {
  children: ReactNode
  details: ReactNode
  dialogTitle: string
  sourceName: string
  closeLabel: string
  linkLabel: string
}) {
  const trigger = useRef<HTMLAnchorElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)
  const titleId = `attribution-dialog-${useId().replaceAll(':', '')}`

  function open(event: MouseEvent<HTMLAnchorElement>) {
    if (!dialog.current || typeof dialog.current.showModal !== 'function') return
    event.preventDefault()
    dialog.current.showModal()
  }

  return (
    <>
      <a
        ref={trigger}
        className={styles.attributionTrigger}
        href="#attribution"
        aria-haspopup="dialog"
        aria-label={linkLabel}
        onClick={open}
      >
        {children}
      </a>
      <dialog
        ref={dialog}
        className={styles.attributionDialog}
        aria-labelledby={titleId}
        onClose={() => trigger.current?.focus()}
      >
        <div className={styles.dialogHeader}>
          <h2 id={titleId}>
            {dialogTitle}
            <span translate="no">{sourceName}</span>
          </h2>
          <button type="button" onClick={() => dialog.current?.close()}>
            {closeLabel}
          </button>
        </div>
        {details}
      </dialog>
    </>
  )
}

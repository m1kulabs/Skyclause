'use client'

import { useId, useRef, type KeyboardEvent, type MouseEvent, type ReactNode } from 'react'
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

  function keepFocusInside(event: KeyboardEvent<HTMLDialogElement>) {
    if (event.key !== 'Tab' || !dialog.current) return
    const focusable = dialog.current.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
    const first = focusable.item(0)
    const last = focusable.item(focusable.length - 1)
    if (!first || !last) return

    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
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
        onKeyDown={keepFocusInside}
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

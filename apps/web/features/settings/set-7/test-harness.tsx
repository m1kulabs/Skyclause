'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { t } from './catalogue'
import { Button } from '#ui/button'
import { Input } from '#ui/input'
import { Label } from '#ui/label'
import { CommandPalette } from '../../palette'
import { ConfirmDialog, TypedConfirmDialog, useUndoableAction, useUnsavedChangesGuard } from './index'

/** Imported only by the planted, APP_ENV=test route. All objects and writes are test doubles. */
export function Set7Harness() {
  const [ready, setReady] = useState(false)
  const [dialog, setDialog] = useState<'confirm' | 'typed' | null>(null)
  const [confirmations, setConfirmations] = useState(0)
  const [commits, setCommits] = useState(0)
  const [value, setValue] = useState('')
  const [saved, setSaved] = useState('')
  const [name, setName] = useState(() => t('set7.harness.name'))
  const router = useRouter()
  const { guardNavigation } = useUnsavedChangesGuard(value !== saved)
  const action = useUndoableAction(async ({ keepalive }) => {
    const response = await fetch('/_test/set-7/commit', { method: 'POST', keepalive })
    if (!response.ok) throw new Error(t('set7.confirm_failed'))
    setCommits((count) => count + 1)
  })
  const confirm = () => setConfirmations((count) => count + 1)

  useEffect(() => setReady(true), [])

  return (
    <main className="mx-auto grid max-w-3xl gap-6 p-5 sm:p-8">
      <h1 className="type-title">{t('set7.harness.title')}</h1>
      <div className="grid gap-2">
        <Label htmlFor="test-object-name">{t('set7.harness.object_name')}</Label>
        <Input
          id="test-object-name"
          name="test-object-name"
          type="text"
          inputMode="text"
          autoComplete="off"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <Button className="h-auto min-h-11 whitespace-normal" onClick={() => setDialog('confirm')}>
          {t('set7.harness.open_confirm')}
        </Button>
        <Button className="h-auto min-h-11 whitespace-normal" onClick={() => setDialog('typed')}>
          {t('set7.harness.open_typed')}
        </Button>
        <Button disabled={!ready} className="h-auto min-h-11 whitespace-normal">
          {t('set7.harness.focus')}
        </Button>
      </div>
      <p role="status" data-testid="confirmations">
        {t('set7.harness.confirmed', { count: confirmations })}
      </p>
      <ConfirmDialog
        open={dialog === 'confirm'}
        onOpenChange={(open) => !open && setDialog(null)}
        objectName={name}
        title={t('set7.harness.confirm', { name })}
        confirmLabel={t('set7.harness.confirm', { name })}
        description={t('set7.harness.description')}
        onConfirm={confirm}
      />
      <TypedConfirmDialog
        open={dialog === 'typed'}
        onOpenChange={(open) => !open && setDialog(null)}
        objectName={name}
        title={t('set7.harness.typed', { name })}
        confirmLabel={t('set7.harness.typed', { name })}
        description={t('set7.harness.description')}
        onConfirm={confirm}
      />
      <section className="grid gap-3">
        <Button
          className="h-auto min-h-11 justify-self-start whitespace-normal"
          onClick={action.start}
          disabled={action.pending || action.committing}
        >
          {t('set7.harness.queue')}
        </Button>
        <p role="status">{t(action.pending ? 'set7.harness.pending' : 'set7.harness.idle')}</p>
        {action.pending && (
          <Button variant="outline" className="min-h-11 justify-self-start" onClick={action.undo}>
            {t('set7.undo')}
          </Button>
        )}
        {action.error != null && <p role="alert">{t('set7.confirm_failed')}</p>}
        <p data-testid="commits">{t('set7.harness.commits', { count: commits })}</p>
      </section>
      <section className="grid gap-3">
        <Label htmlFor="test-unsaved">{t('set7.harness.edit')}</Label>
        <Input
          id="test-unsaved"
          name="test-unsaved"
          type="text"
          inputMode="text"
          autoComplete="off"
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
        <Button className="min-h-11 justify-self-start" onClick={() => setSaved(value)}>
          {t('set7.harness.save')}
        </Button>
        <Link href="/_test/tokens" className="w-fit underline">
          {t('set7.harness.leave')}
        </Link>
        <Button
          variant="outline"
          className="h-auto min-h-11 justify-self-start whitespace-normal"
          onClick={() => guardNavigation(() => router.push('/_test/tokens'))}
        >
          {t('set7.harness.navigate')}
        </Button>
      </section>
      <CommandPalette memberRole="viewer" />
    </main>
  )
}

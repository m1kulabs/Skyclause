import { t } from '@skyclause/i18n'
import { CircleAlertIcon, InfoIcon } from 'lucide-react'
import type { ComponentProps, ReactNode, Ref } from 'react'
import { Alert } from '#ui/alert'
import { cn } from '#lib/utils'
import './auth.css'
import './catalogue'

/** The brand, then the page's one h1 saying what this is, then at most one plain sentence. */
export function AuthHeader({
  title,
  titleId,
  titleRef,
  statement = false,
  lead,
  homeHref = '/',
  locale = 'en'
}: {
  title: ReactNode
  titleId?: string
  /** For a title that must take focus when the page changes under it, as a result does. */
  titleRef?: Ref<HTMLHeadingElement>
  /** A title that is a whole sentence (a result, a refusal) is set as a statement, not as a headline. */
  statement?: boolean
  lead?: ReactNode
  /** The wordmark's target: the landing, which another host may serve (the sign-in page passes it absolute). */
  homeHref?: string
  locale?: 'en' | 'ms'
}) {
  return (
    <header className="auth-header">
      {/* A plain link: the way home must work without JavaScript, and the landing may be on another host. */}
      <a className="auth-brand" href={homeHref} aria-label={t('legal.frame.home', {}, locale)}>
        {/* eslint-disable-next-line @next/next/no-img-element -- The fixed SVG mark needs no optimization or client code. */}
        <img src="/icon.svg" width={28} height={28} alt="" />
        <span translate="no">{t('brand.name', {}, locale)}</span>
      </a>
      <h1
        className={statement ? 'auth-title auth-title-statement' : 'auth-title'}
        id={titleId}
        ref={titleRef}
        tabIndex={titleRef ? -1 : undefined}
      >
        {title}
      </h1>
      {lead ? <p className="auth-lead">{lead}</p> : null}
    </header>
  )
}

/** A message with a glyph, so it is never told by colour alone: an error is announced at once, a result politely. */
export function AuthMessage({
  tone = 'error',
  children,
  className,
  ...props
}: Omit<ComponentProps<typeof Alert>, 'variant'> & { tone?: 'error' | 'result' }) {
  const Icon = tone === 'error' ? CircleAlertIcon : InfoIcon
  return (
    <Alert
      variant="destructive"
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('text-base leading-6', className)}
      {...props}
    >
      <Icon aria-hidden="true" />
      <p className="m-0">{children}</p>
    </Alert>
  )
}

import type { CSSProperties } from 'react'
import { notFound } from 'next/navigation'
import { t } from '@skyclause/i18n'

const tokens = [
  'accent',
  'accent-foreground',
  'background',
  'border',
  'brand-crimson',
  'brand-crimson-foreground',
  'card',
  'card-foreground',
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'control',
  'destructive',
  'focus-width',
  'font-heading',
  'font-mono',
  'font-sans',
  'foreground',
  'grid',
  'input',
  'landing-background',
  'landing-field',
  'landing-field-foreground',
  'landing-field-muted-foreground',
  'landing-foreground',
  'landing-muted-foreground',
  'landing-primary',
  'landing-primary-foreground',
  'landing-surface',
  'muted',
  'muted-foreground',
  'popover',
  'popover-foreground',
  'primary',
  'primary-foreground',
  'radius-2xl',
  'radius-4xl',
  'radius-lg',
  'radius-md',
  'radius-sm',
  'radius-xl',
  'ring',
  'rule',
  'secondary',
  'secondary-foreground',
  'selection',
  'selection-width',
  'shadow-float',
  'shadow-lg',
  'shadow-sm',
  'shadow-xs',
  'sidebar',
  'sidebar-accent',
  'sidebar-accent-foreground',
  'sidebar-border',
  'sidebar-foreground',
  'sidebar-primary',
  'sidebar-primary-foreground',
  'sidebar-ring',
  'status-critical-background',
  'status-critical-border',
  'status-critical-foreground',
  'status-neutral-background',
  'status-neutral-border',
  'status-neutral-foreground',
  'status-no-call-background',
  'status-no-call-border',
  'status-no-call-foreground',
  'status-warning-background',
  'status-warning-border',
  'status-warning-foreground',
  'warning'
]

function swatch(name: string): CSSProperties {
  const value = `var(--${name})`
  if (name.startsWith('radius-')) return { borderRadius: value, backgroundColor: 'var(--control)' }
  if (name.startsWith('shadow-')) return { boxShadow: value, border: 'none', backgroundColor: 'var(--popover)' }
  if (name.startsWith('font-')) return { fontFamily: value }
  if (name === 'focus-width') return { outlineWidth: value, outlineStyle: 'solid', outlineColor: 'var(--ring)' }
  if (name === 'selection-width') return { height: value, backgroundColor: 'var(--selection)' }
  return { backgroundColor: value }
}

export default function Tokens() {
  if (process.env.APP_ENV !== 'test') notFound()
  return (
    <main className="token-page">
      <h1 className="type-title">{t('shell.tokens')}</h1>
      <div className="token-grid">
        {tokens.map((name) => (
          <div key={name}>
            <code className="token-name">{`--${name}`}</code>
            <span className="token-swatch" aria-hidden="true" style={swatch(name)}>
              {name.startsWith('font-') ? `--${name}` : null}
            </span>
          </div>
        ))}
      </div>
    </main>
  )
}

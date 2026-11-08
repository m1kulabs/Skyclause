import { font, theme } from './theme'

export type TitleCardProps = { shotId: string; title: string; waitingFor: string }

export const waitLabel = (needs: 'none' | 'dev-pilot' | 'ge') => {
  if (needs === 'dev-pilot') return 'dev pilot recording'
  if (needs === 'ge') return 'Gemini Enterprise licence'
  return 'confirmed segment details'
}

export const TitleCard: React.FC<TitleCardProps> = ({ shotId, title, waitingFor }) => (
  <div
    style={{
      width: 1920,
      height: 1080,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      padding: '0 160px',
      boxSizing: 'border-box',
      background: theme.background,
      color: theme.foreground,
      fontFamily: font.sans
    }}
  >
    <div
      style={{
        width: 1500,
        minHeight: 380,
        padding: 48,
        background: theme.card,
        border: `1px solid ${theme.border}`,
        boxSizing: 'border-box'
      }}
    >
      <div style={{ color: theme.muted, fontSize: 16, fontVariantNumeric: 'tabular-nums' }}>{shotId}</div>
      <div style={{ marginTop: 28, fontSize: 42, fontWeight: 500, lineHeight: 1.15 }}>{title}</div>
      <div style={{ marginTop: 40, color: theme.secondary, fontSize: 20 }}>Waiting for: {waitingFor}</div>
    </div>
  </div>
)

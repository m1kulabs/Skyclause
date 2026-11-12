import { t } from '@skyclause/i18n/brand'
import './brand.css'

export interface CapsuleWordmarkProps {
  locale?: 'en' | 'ms'
}

/**
 * The name as capsules of different lengths, one per letter, like windows on a strip: the letter in the ground colour
 * on an ink fill. It fills the width of its parent (the parent sets the width, the type scales with it) and is named
 * once, as one word.
 */
export function CapsuleWordmark({ locale = 'en' }: CapsuleWordmarkProps) {
  const name = t('brand.name', {}, locale)
  return (
    <div className="capsule-wordmark" role="img" aria-label={name} translate="no">
      {Array.from(name).map((letter, index) => (
        <span key={index} aria-hidden="true">
          {letter}
        </span>
      ))}
    </div>
  )
}

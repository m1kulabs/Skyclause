/* eslint-disable @next/next/no-img-element -- Self-hosted, pre-sized pictures (CSP img-src 'self'); next/image would add client script to the landing. */
import { photo, srcSetOf } from '../landing/photos'
import { t } from './catalogue'
import styles from './hero.module.css'

// The room: three photographs of Bukit Jalil's sky held in the enormous capsule, crossfading slowly (the signature
// move). None shows a storm, so the room never implies weather the verdict has not read. The crossfade lasts longer
// than five seconds, so a pause sits beside it; reduced motion shows only the first picture.
const ROOM = ['lrtDay', 'stadiumClouds', 'stadiumNight'] as const

export function HeroRoom() {
  return (
    <>
      <div className={styles.room} role="img" aria-label={t('landing-hero.photos_label', {}, 'en')}>
        <div className={styles.roomDrift} data-room-capsule>
          <div className={styles.roomCapsule}>
            {ROOM.map((key, index) => {
              const entry = photo(key)
              return (
                <img
                  key={key}
                  className={styles.roomPhoto}
                  data-slot={index}
                  src={entry.src}
                  srcSet={srcSetOf(entry)}
                  sizes="(min-width: 1024px) 60vw, 100vw"
                  width={entry.width}
                  height={entry.height}
                  alt=""
                  decoding="async"
                  {...(index === 0 ? { fetchPriority: 'high' as const } : { loading: 'lazy' as const })}
                />
              )
            })}
          </div>
        </div>
      </div>
      <label className={styles.pause}>
        <input type="checkbox" name="hero-photos-paused" className={styles.pauseInput} />
        <span className={styles.pauseGlyph} aria-hidden="true" />
        {/* The words follow the glyph: Pause while the photographs move, Play once they are paused (CSS only). */}
        <span className={styles.pauseWord}>{t('landing-hero.pause_photos', {}, 'en')}</span>
        <span className={styles.playWord}>{t('landing-hero.play_photos', {}, 'en')}</span>
      </label>
    </>
  )
}

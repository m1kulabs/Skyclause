import type { CSSProperties } from 'react'
import { wordmarkSvg } from '@skyclause/elements'
import { t } from './catalogue'
import { HeroActivator } from './activator'
import { HeroRoom } from './hero-room'
import { HeroStatic } from './hero-static'
import type { EvaluateResult, LatestCallRead } from './evaluate'
import { calendarPath, pilotRefOf } from './evaluate'
import { heroStripSvg } from './strip-html'
import { datesTodayPlusSeven, stripOf, type HeroWindow } from './window-model'
import styles from './hero.module.css'

export interface HeroRead {
  now: Date
  win: HeroWindow
  result: EvaluateResult
  latestCall: LatestCallRead
}

/** The h1's words, each in its own span for the CSS reveal, with the spaces kept as text so the name reads whole. */
function HeadingLine({ text, offset }: { text: string; offset: number }) {
  const words = text.split(' ')
  return (
    <span className={styles.line}>
      {words.map((word, index) => (
        <span key={`${word}-${index}`}>
          <span className={styles.word} style={{ '--i': offset + index } as CSSProperties}>
            {word}
          </span>
          {index < words.length - 1 ? ' ' : null}
        </span>
      ))}
    </span>
  )
}

// Striped card beside the room: the card holds the day strip (the stripe band), the name, the h1, one sentence and
// the one action; the room holds Bukit Jalil's sky inside the enormous capsule, and the window form with the clause
// engine's verdict on a solid panel beside it. Server-rendered per request, readable without JavaScript.
export function LandingHero({ read }: { read: HeroRead }) {
  const { now, win, result, latestCall } = read
  const strip = result.kind === 'ok' ? stripOf(result.data.strip, win, result.data.evaluated_at) : null
  const stripSvg = heroStripSvg(strip)
  const appOrigin = process.env.APP_ORIGIN
  const signInHref = appOrigin ? new URL('/sign-in', appOrigin).toString() : '/sign-in'
  const pilot = pilotRefOf(process.env.PILOT_PROJECT)
  const line1 = t('landing-hero.heading_line_1', {}, 'en')
  const dates = datesTodayPlusSeven(now)
  return (
    <section className={styles.hero} aria-labelledby="hero-title">
      <div className={styles.card} aria-hidden="true" />
      <div className={styles.copy}>
        <span
          className={styles.wordmark}
          // biome-ignore lint/security/noDangerouslySetInnerHtml: the brand builder's own outlined wordmark.
          dangerouslySetInnerHTML={{ __html: wordmarkSvg }}
        />
        <h1 id="hero-title" className={styles.title}>
          <HeadingLine text={line1} offset={0} />
          {t('landing-hero.h1_join', {}, 'en')}
          <HeadingLine text={t('landing-hero.heading_line_2', {}, 'en')} offset={line1.split(' ').length} />
        </h1>
        <p className={styles.lead}>{t('landing-hero.lead_sentence', {}, 'en')}</p>
        <div className={styles.actions}>
          <a href={signInHref} className="landing-button">
            {t('landing-hero.sign_in', {}, 'en')}
          </a>
          <nav aria-label={t('landing-hero.links_label', {}, 'en')} className={styles.links}>
            <a href="#how">{t('landing-hero.link_how', {}, 'en')}</a>
            <a href="#record">{t('landing-hero.link_record', {}, 'en')}</a>
            <a href="#prices">{t('landing-hero.link_prices', {}, 'en')}</a>
          </nav>
        </div>
      </div>
      <HeroRoom />
      <HeroActivator
        initialResult={result}
        initialStripSvg={stripSvg}
        initialWin={win}
        dates={dates}
        latestCall={latestCall}
        pilot={pilot}
        calendarQuery={calendarPath(pilot)}
      >
        <HeroStatic
          result={result}
          stripSvg={stripSvg}
          win={win}
          dates={dates}
          latestCall={latestCall}
          calendarQuery={calendarPath(pilot)}
        />
      </HeroActivator>
    </section>
  )
}

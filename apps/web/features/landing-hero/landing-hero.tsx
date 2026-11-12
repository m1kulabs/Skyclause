/* eslint-disable @next/next/no-img-element -- the mark is a 40px inline brand SVG; plain <img> keeps the landing island light. */
import { log } from '@skyclause/config'
import { t } from './catalogue'
import { HeroActivator } from './activator'
import { HeroStatic } from './hero-static'
import {
  calendarPath,
  fetchEvaluateServer,
  fetchLatestCallServer,
  pilotRefOf,
  type EvaluateResult,
  type LatestCallRead
} from './evaluate'
import { heroStripSvg } from './strip-html'
import { datesTodayPlusSeven, nextHourWindow, parseWindowFromSearch, stripOf } from './window-model'
import styles from './hero.module.css'

type Search = Readonly<Record<string, string | string[] | undefined>>

export async function LandingHero({ searchParams }: { searchParams: Promise<Search> }) {
  const query = await searchParams
  const now = new Date()
  const serialized = new URLSearchParams({
    date: typeof query.date === 'string' ? query.date : '',
    start: typeof query.start === 'string' ? query.start : '',
    end: typeof query.end === 'string' ? query.end : ''
  }).toString()
  const win = parseWindowFromSearch(serialized, now) ?? nextHourWindow(now)
  const pilot = pilotRefOf(process.env.PILOT_PROJECT)
  let result: EvaluateResult
  let latestCall: LatestCallRead
  try {
    ;[result, latestCall] = await Promise.all([fetchEvaluateServer(win), fetchLatestCallServer(pilot)])
  } catch (error) {
    // No API origin to call: the honest error state, never a value (a hero with no pilot still reads n=0).
    log.error('landing hero cannot read the API', { error: String(error) })
    result = { kind: 'error', status: null }
    latestCall = pilot ? 'error' : null
  }
  const strip = result.kind === 'ok' ? stripOf(result.data.strip, win, result.data.evaluated_at) : null
  const stripSvg = heroStripSvg(strip)
  const appOrigin = process.env.APP_ORIGIN
  const guestHref = appOrigin ? new URL('/guest', appOrigin).toString() : '/guest'
  const signInHref = appOrigin ? new URL('/sign-in', appOrigin).toString() : '/sign-in'
  return (
    <section className={styles.hero} aria-label={t('landing-hero.picker_label', {}, 'en')}>
      <div className={styles.left}>
        <div className={styles.topRow}>
          <img src="/icon.svg" width={40} height={40} alt="" aria-hidden="true" className={styles.mark} />
          <a href={signInHref} className={styles.signIn}>
            {t('landing-hero.sign_in', {}, 'en')}
          </a>
        </div>
        <div className={styles.spacer} aria-hidden="true" />
        <h1 className={`type-landing-head ${styles.h1}`}>
          <span className={styles.hline}>
            <span className={`${styles.hlineInner} ${styles.line1}`}>{t('landing-hero.heading_line_1', {}, 'en')}</span>
          </span>
          {t('landing-hero.h1_join', {}, 'en')}
          <span className={styles.hline}>
            <span className={`${styles.hlineInner} ${styles.line2}`}>{t('landing-hero.heading_line_2', {}, 'en')}</span>
          </span>
        </h1>
        <p className={`type-landing-body ${styles.lead}`}>{t('landing-hero.lead_sentence', {}, 'en')}</p>
        <a href={guestHref} className={styles.cta}>
          {t('landing-hero.open_commons', {}, 'en')}
        </a>
      </div>
      <div className={styles.right}>
        <HeroActivator
          initialResult={result}
          initialStripSvg={stripSvg}
          initialWin={win}
          dates={datesTodayPlusSeven(now)}
          latestCall={latestCall}
          pilot={pilot}
          calendarQuery={calendarPath(pilot)}
        >
          <HeroStatic
            result={result}
            stripSvg={stripSvg}
            win={win}
            dates={datesTodayPlusSeven(now)}
            latestCall={latestCall}
            calendarQuery={calendarPath(pilot)}
          />
        </HeroActivator>
      </div>
    </section>
  )
}

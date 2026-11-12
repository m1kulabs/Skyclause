import { gsap } from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import Lenis from 'lenis'
import { motionReduced } from './motion-boot'

// The landing's scroll motion, loaded after the first interaction (motion-boot.tsx). GSAP is the animation system and
// Lenis the one smooth-scroll engine, wired to ScrollTrigger. Tweens move only transform and opacity (x, y, xPercent,
// yPercent, scale, opacity); nothing pins and nothing takes the wheel away. Only what the visitor has not reached yet
// is set back, so nothing in view ever disappears; reverting restores every element to the server's final state.

const EASE = 'expo.out'
// A finished entrance hands each element back to its stylesheet: no inline transform or opacity is left behind.
const SETTLED = 'transform,opacity'

export function startMotion(): () => void {
  gsap.registerPlugin(ScrollTrigger)
  const lenis = new Lenis({ lerp: 0.12, smoothWheel: true, anchors: true })
  lenis.on('scroll', ScrollTrigger.update)
  const tick = (time: number) => lenis.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)

  const unseen = (el: Element) => el.getBoundingClientRect().top > window.innerHeight

  const context = gsap.context(() => {
    // Every position is read before anything is set, so the page lays out once, not once per section.
    // Each plan is [section, words, parts, slots].
    const plans = [...document.querySelectorAll<HTMLElement>('[data-reveal-section]')].map(
      (section) =>
        [
          section,
          [...section.querySelectorAll<HTMLElement>('[data-words] .word')].filter(unseen),
          [...section.querySelectorAll<HTMLElement>('[data-reveal]')].filter(
            (el) => unseen(el) && !el.matches('[data-words]')
          ),
          [...section.querySelectorAll<HTMLElement>('[data-reveal-slot]')].filter(unseen)
        ] as const
    )
    const record = document.querySelector<HTMLElement>('.record-capsule')
    const recordUnseen = !!record && unseen(record)
    for (const [section, words, parts, slots] of plans) {
      if (!words.length && !parts.length && !slots.length) continue
      if (words.length) gsap.set(words, { yPercent: 60, opacity: 0 })
      if (parts.length) gsap.set(parts, { y: 28, opacity: 0 })
      if (slots.length) gsap.set(slots, { scale: 0.6, opacity: 0 })
      ScrollTrigger.create({
        trigger: section,
        start: 'top 88%',
        once: true,
        onEnter: () => {
          const timeline = gsap.timeline()
          if (words.length)
            timeline.to(
              words,
              { yPercent: 0, opacity: 1, duration: 0.8, ease: EASE, stagger: 0.07, clearProps: SETTLED },
              0
            )
          if (parts.length)
            timeline.to(
              parts,
              { y: 0, opacity: 1, duration: 0.8, ease: EASE, stagger: 0.08, clearProps: SETTLED },
              0.12
            )
          if (slots.length)
            timeline.to(
              slots,
              { scale: 1, opacity: 1, duration: 0.7, ease: EASE, stagger: 0.09, clearProps: SETTLED },
              0.3
            )
        }
      })
    }

    // The window travels: the hero's capsule drifts right as the page scrolls past it, locked to the scrollbar.
    const room = document.querySelector<HTMLElement>('[data-room-capsule]')
    const hero = room?.closest('section')
    if (room && hero) {
      gsap.to(room, {
        xPercent: 6,
        ease: 'none',
        scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true }
      })
    }
    // The record's photographs settle from a slight scale inside their capsule as it comes into view.
    if (record && recordUnseen) {
      gsap.fromTo(
        record.querySelectorAll('.record-photo'),
        { scale: 1.08 },
        {
          scale: 1,
          ease: 'none',
          scrollTrigger: { trigger: record, start: 'top bottom', end: 'center center', scrub: true }
        }
      )
    }
  })

  // The OS or the account can ask for reduced motion at any time: drop to the final states at once.
  const query = window.matchMedia('(prefers-reduced-motion: reduce)')
  const observer = new MutationObserver(() => motionReduced() && stop())
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] })
  const onQuery = () => motionReduced() && stop()
  query.addEventListener('change', onQuery)

  let stopped = false
  function stop() {
    if (stopped) return
    stopped = true
    query.removeEventListener('change', onQuery)
    observer.disconnect()
    context.revert()
    for (const trigger of ScrollTrigger.getAll()) trigger.kill()
    gsap.ticker.remove(tick)
    lenis.destroy()
  }
  return stop
}

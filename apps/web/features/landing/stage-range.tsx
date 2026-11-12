'use client'

import { useEffect, useRef, useState } from 'react'

// The range input over the stage radios. The radios are the state (CSS reads the checked one), so the section works
// without script; this control renders disabled on the server and drives the radios once it hydrates.
export function StageRange({ names }: { names: string[] }) {
  const ref = useRef<HTMLInputElement>(null)
  const [ready, setReady] = useState(false)
  const [stage, setStage] = useState(0)

  useEffect(() => {
    const section = ref.current?.closest('section')
    if (!section) return
    const checked = section.querySelector<HTMLInputElement>('input[name="stage"]:checked')
    if (checked) setStage(Number(checked.value))
    const onChange = (event: Event) => {
      const target = event.target as HTMLInputElement
      if (target.name === 'stage') setStage(Number(target.value))
    }
    section.addEventListener('change', onChange)
    setReady(true)
    return () => section.removeEventListener('change', onChange)
  }, [])

  const choose = (value: number) => {
    setStage(value)
    const radio = ref.current
      ?.closest('section')
      ?.querySelector<HTMLInputElement>(`input[name="stage"][value="${value}"]`)
    if (radio && !radio.checked) radio.checked = true
  }

  return (
    <input
      ref={ref}
      type="range"
      className="how-range"
      name="stage-range"
      aria-label="Stage"
      aria-valuetext={names[stage]}
      autoComplete="off"
      min={0}
      max={names.length - 1}
      step={1}
      value={stage}
      disabled={!ready}
      onChange={(event) => choose(Number(event.target.value))}
    />
  )
}

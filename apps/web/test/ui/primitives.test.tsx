// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, test } from 'vitest'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../../components/ui/hover-card'
import { TriageLayout, TriageRow, type TriageView } from '../../components/ui/triage-layout'
import { brandViewport } from '../../features/brand/metadata'

const labels = { list: 'Bundles', item: 'Review', details: 'Details' }
const words = { open: 'Open', back: 'Back', card: 'Details of the age' }

// Below 641px the layout hides the regions that are not showing; jsdom has no media queries, so the test hides them.
const hideList = '[data-slot="triage-list"][data-hidden], [data-slot="triage-item"][data-hidden] { display: none }'

function Harness() {
  const [view, setView] = useState<TriageView>('list')
  return (
    <>
      <style>{hideList}</style>
      <TriageLayout
        view={view}
        labels={labels}
        list={
          <TriageRow
            href="#bundle"
            onClick={(event) => {
              event.preventDefault()
              setView('item')
              document.querySelector('[data-slot="triage-list"]')?.setAttribute('data-hidden', '')
              document.querySelector('[data-slot="triage-item"]')?.removeAttribute('data-hidden')
            }}
          >
            {words.open}
          </TriageRow>
        }
        item={
          <button
            type="button"
            onClick={() => {
              document.querySelector('[data-slot="triage-list"]')?.removeAttribute('data-hidden')
              document.querySelector('[data-slot="triage-item"]')?.setAttribute('data-hidden', '')
              setView('list')
            }}
          >
            {words.back}
          </button>
        }
      />
    </>
  )
}

describe('TriageLayout', () => {
  afterEach(cleanup)

  test('moves focus to the region now showing when the one that held focus is hidden', async () => {
    render(<Harness />)
    const row = screen.getByRole('link', { name: words.open })
    row.focus()
    await act(async () => {
      fireEvent.click(row)
    })
    expect(document.activeElement).toBe(screen.getByRole('region', { name: labels.item }))
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: words.back }))
    })
    expect(document.activeElement).toBe(screen.getByRole('region', { name: labels.list }))
  })

  test('leaves focus where it is when every region stays visible', async () => {
    function Wide() {
      const [view, setView] = useState<TriageView>('list')
      return (
        <TriageLayout
          view={view}
          labels={labels}
          list={
            <TriageRow
              href="#bundle"
              onClick={(event) => {
                event.preventDefault()
                setView('item')
              }}
            >
              {words.open}
            </TriageRow>
          }
          item={<p>{words.card}</p>}
        />
      )
    }
    render(<Wide />)
    const row = screen.getByRole('link', { name: words.open })
    row.focus()
    await act(async () => {
      fireEvent.click(row)
    })
    expect(document.activeElement).toBe(row)
  })
})

describe('HoverCardTrigger', () => {
  afterEach(cleanup)

  test('is a button unless the caller renders something else, so keyboard and touch can reach it', () => {
    render(
      <HoverCard>
        <HoverCardTrigger>{words.open}</HoverCardTrigger>
        <HoverCardContent>{words.card}</HoverCardContent>
      </HoverCard>
    )
    const trigger = screen.getByRole('button', { name: words.open })
    expect(trigger.tagName).toBe('BUTTON')
    expect(trigger.getAttribute('type')).toBe('button')
  })
})

describe('the viewport', () => {
  test('runs edge to edge so the safe-area insets take effect', () => {
    expect(brandViewport.viewportFit).toBe('cover')
  })
})

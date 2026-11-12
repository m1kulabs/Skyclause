/** The event the command palette listens for, so a control can open it without faking a key press. */
export const OPEN_PALETTE_EVENT = 'skyclause:open-palette'

export interface OpenPaletteDetail {
  /** Where focus goes when the palette closes, when the control that opened it will be gone by then. */
  returnTo?: HTMLElement | null
}

export function openPalette(returnTo?: HTMLElement | null) {
  document.dispatchEvent(new CustomEvent<OpenPaletteDetail>(OPEN_PALETTE_EVENT, { detail: { returnTo } }))
}

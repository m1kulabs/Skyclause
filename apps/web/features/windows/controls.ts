import { unbuiltOperations } from '@skyclause/api'

/** Which parts of the window dialog can work. A part whose operation has no handler is not offered: it could only fail. */
export interface WindowControls {
  /** `updateWindow`: an existing window opens as a form to save; without it, as its details. */
  edit: boolean
  /** `cancelWindow`: the Cancel window control. */
  cancel: boolean
  /** `createIcsFeed`: the ICS import beside the form. */
  importIcs: boolean
  /** A recurrence on `createWindow`: the Repeat fields. */
  repeat: boolean
}

/**
 * Read from the API's own handler table on the server, so a control comes back on its own once its handler lands. A
 * recurrence has no entry of its own: `createWindow` answers 501 to one until a series is built (`services/windows`),
 * so Repeat stays off until that changes here.
 */
export function windowControls(): WindowControls {
  const unbuilt = new Set(unbuiltOperations().map((operation) => operation.operationId))
  return {
    edit: !unbuilt.has('updateWindow'),
    cancel: !unbuilt.has('cancelWindow'),
    importIcs: !unbuilt.has('createIcsFeed'),
    repeat: false
  }
}

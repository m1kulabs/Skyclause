import { windowControls } from '../../features/windows/controls'

/**
 * What the window dialog offers on this build, read from the API's handler table as the project layout reads it. A
 * test of a part the dialog does not offer is skipped until that part's handler lands, then runs again by itself.
 */
export const controls = windowControls()

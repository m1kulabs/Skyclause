import { listWindows } from './windows/listWindows'
import { createWindow } from './windows/createWindow'
import { updateWindow } from './windows/updateWindow'
import { cancelWindow } from './windows/cancelWindow'
import { createWindowReport } from './windows/createWindowReport'

export { listWindows } from './windows/listWindows'
export { createWindow } from './windows/createWindow'
export { updateWindow } from './windows/updateWindow'
export { cancelWindow } from './windows/cancelWindow'
export { createWindowReport } from './windows/createWindowReport'

export const routes = [listWindows, createWindow, updateWindow, cancelWindow, createWindowReport] as const

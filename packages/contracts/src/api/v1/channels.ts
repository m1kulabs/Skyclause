import { listChannels } from './channels/listChannels'
import { previewChannels } from './channels/previewChannels'
import { updateChannel } from './channels/updateChannel'

export { listChannels } from './channels/listChannels'
export { previewChannels } from './channels/previewChannels'
export { updateChannel } from './channels/updateChannel'

export const routes = [listChannels, previewChannels, updateChannel] as const

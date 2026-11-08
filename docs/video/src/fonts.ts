import { loadFont } from '@remotion/fonts'
import jetBrainsMono from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'
import workSans from '@fontsource-variable/work-sans/files/work-sans-latin-wght-normal.woff2'

loadFont({ family: 'Work Sans', url: workSans, weight: '300 700' })
loadFont({ family: 'JetBrains Mono', url: jetBrainsMono, weight: '400 700' })

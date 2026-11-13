import { loadFont } from '@remotion/fonts'
import jetBrainsMono from '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2'
import roundo from '../../../apps/web/fonts/roundo/Roundo-Variable.woff2'
import figuresMedium from '../../../apps/web/fonts/skyclause-figures/SkyclauseFigures-Medium.woff2'
import figuresRegular from '../../../apps/web/fonts/skyclause-figures/SkyclauseFigures-Regular.woff2'
import figuresSemiBold from '../../../apps/web/fonts/skyclause-figures/SkyclauseFigures-SemiBold.woff2'

// Roundo and Skyclause Figures come from the web app's self-hosted files (apps/web/fonts), so the video matches it.
loadFont({ family: 'Roundo', url: roundo, weight: '200 700' })
loadFont({ family: 'Skyclause Figures', url: figuresRegular, weight: '400' })
loadFont({ family: 'Skyclause Figures', url: figuresMedium, weight: '500' })
loadFont({ family: 'Skyclause Figures', url: figuresSemiBold, weight: '600' })
loadFont({ family: 'JetBrains Mono', url: jetBrainsMono, weight: '400 700' })

import { notBuilt } from '@skyclause/contracts'
import type { Backtest, Baseline, ForecastNight, Periods, Uplift } from '../types'

export const baseline: Baseline = notBuilt('b-forecast')
export const uplift: Uplift = notBuilt('b-forecast')
export const periods: Periods = notBuilt('b-forecast')
export const backtest: Backtest = notBuilt('b-forecast')
export const forecastNight: ForecastNight = notBuilt('b-forecast')

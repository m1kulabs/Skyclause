// Explicit derived glosses only. Malay-reader review is tracked in #680 and remains required for language acceptance.
const metForecastGloss: Readonly<Record<string, string>> = {
  'tiada hujan': 'No rain',
  mendung: 'Cloudy',
  menyeluruh: 'Widespread',
  hujan: 'Rain',
  'hujan di beberapa tempat': 'Rain in some places',
  'hujan di kebanyakan tempat': 'Rain in most places',
  'ribut petir': 'Thunderstorms',
  'ribut petir di beberapa tempat': 'Thunderstorms in some places',
  'ribut petir di kebanyakan tempat': 'Thunderstorms in most places',
  pagi: 'Morning',
  petang: 'Afternoon',
  malam: 'Night',
  'pagi dan petang': 'Morning and afternoon',
  'petang dan malam': 'Afternoon and night',
  'pagi dan malam': 'Morning and night',
  'sepanjang hari': 'Throughout the day'
}

export function glossMetForecastPhrase(raw: string): string | undefined {
  const key = raw.toLowerCase()
  return Object.hasOwn(metForecastGloss, key) ? metForecastGloss[key] : undefined
}

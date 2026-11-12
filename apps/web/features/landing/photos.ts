// The landing's pictures and their provenance. Every one is a Wikimedia Commons file of Bukit Jalil or Kuala Lumpur,
// downloaded on 12 November 2026, resized and re-encoded; credited in the footer. None is the product or its users.
// public/landing/provenance.json, beside the files, records the same; test/landing/photos.test.ts keeps them equal.
export const PICTURES = {
  lrtDay: {
    files: ['bukit-jalil-lrt-day.jpg', 'bukit-jalil-lrt-day-800.jpg'],
    width: 1400,
    height: 1050,
    title: 'Bukit Jalil LRT Station outview (230527) 01',
    creator: '*angys*',
    date: '2023-05-27',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Bukit_Jalil_LRT_Station_outview_(230527)_01.jpg',
    alt: 'Bukit Jalil LRT station under a blue afternoon sky with tall white clouds'
  },
  stadiumClouds: {
    files: ['stadium-clouds.jpg', 'stadium-clouds-800.jpg'],
    width: 1400,
    height: 1050,
    title: 'Bukit Jalil National Stadium (220713)',
    creator: '*angys*',
    date: '2022-07-13',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Bukit_Jalil_National_Stadium_(220713).jpg',
    alt: 'Bukit Jalil National Stadium under a grey cloud deck, its empty forecourt in front'
  },
  stadiumNight: {
    files: ['stadium-night.jpg', 'stadium-night-800.jpg'],
    width: 1400,
    height: 1050,
    title: 'Bukit Jalil National Stadium at night',
    creator: 'Pak Misai',
    date: '2021-08-17',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Bukit_Jalil_National_Stadium_at_night.jpg',
    alt: 'Bukit Jalil National Stadium lit at night under a dark sky, mirrored in its forecourt pool'
  },
  storm: {
    files: ['storm-kuala-lumpur.jpg', 'storm-kuala-lumpur-800.jpg'],
    width: 1400,
    height: 1050,
    title: 'Kuala Lumpur skyline thunderstorm 03',
    creator: 'Pradana Aumars',
    date: '2016-07-17',
    licence: 'CC BY-SA 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by-sa/4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Kuala_Lumpur_skyline_thunderstorm_03.jpg',
    alt: 'Kuala Lumpur tower blocks fading into the grey rain of a thunderstorm'
  },
  lrtPlatform: {
    files: ['lrt-platform-panorama.jpg', 'lrt-platform-panorama-1200.jpg'],
    width: 2400,
    height: 565,
    title: 'Bukit Jalil LRT Panorama',
    creator: 'Pixdoet',
    date: '2025-07-31',
    licence: 'CC BY 4.0',
    licenceUrl: 'https://creativecommons.org/licenses/by/4.0',
    page: 'https://commons.wikimedia.org/wiki/File:Bukit_Jalil_LRT_Panorama.jpg',
    alt: 'The platforms of Bukit Jalil LRT station under their red steel roof, in a wide panorama'
  },
  persiaran: {
    files: ['persiaran-jalil-utama.jpg', 'persiaran-jalil-utama-800.jpg'],
    width: 1400,
    height: 1050,
    title: 'Persiaran Jalil Utama, Bukit Jalil 20231118 112053',
    creator: 'Wiki Farazi',
    date: '2023-11-18',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/deed.en',
    page: 'https://commons.wikimedia.org/wiki/File:Persiaran_Jalil_Utama,_Bukit_Jalil_20231118_112053.jpg',
    alt: 'Persiaran Jalil Utama in Bukit Jalil on a bright morning, a motorcycle on the empty road'
  },
  rain: {
    files: ['rain-kuala-lumpur.jpg'],
    width: 960,
    height: 640,
    title: 'Rain, Kuala Lumpur (Unsplash)',
    creator: 'Eutah Mizushima',
    licence: 'CC0',
    licenceUrl: 'https://creativecommons.org/publicdomain/zero/1.0/deed.en',
    page: 'https://commons.wikimedia.org/wiki/File:Rain,_Kuala_Lumpur_(Unsplash).jpg',
    alt: 'Heavy rain splashing on a flat surface in Kuala Lumpur, in black and white'
  }
} as const

export type PhotoKey = keyof typeof PICTURES

export interface Photo {
  key: PhotoKey
  src: string
  /** A narrower file for phones and small slots, where one exists. */
  small: string | null
  width: number
  height: number
  title: string
  creator: string
  licence: string
  licenceUrl: string
  page: string
  alt: string
}

export function photo(key: PhotoKey): Photo {
  const entry = PICTURES[key]
  const [main, small] = entry.files as readonly string[]
  return {
    key,
    src: `/landing/${main}`,
    small: small ? `/landing/${small}` : null,
    width: entry.width,
    height: entry.height,
    title: entry.title,
    creator: entry.creator,
    licence: entry.licence,
    licenceUrl: entry.licenceUrl,
    page: entry.page,
    alt: entry.alt
  }
}

/** `srcset` for a picture with a phone-sized file: the small one is 800px wide (the panorama's 1200px). */
export function srcSetOf(entry: Photo): string | undefined {
  if (!entry.small) return undefined
  const smallWidth = entry.key === 'lrtPlatform' ? 1200 : 800
  return `${entry.small} ${smallWidth}w, ${entry.src} ${entry.width}w`
}

export const PHOTO_KEYS = Object.keys(PICTURES) as PhotoKey[]

import { expect, test } from 'vitest'
import { chromium } from '@playwright/test'
import { maskedCanvas } from '../../features/camera/frame'

test('SIG-8: decoded 640 px JPEG has luma <= 16 in every lower-third pixel', async () => {
  const browser = await chromium.launch({ headless: true })
  try {
    const page = await browser.newPage()
    // Exercise the production painter and real Chromium JPEG codec, with deliberately bright test pixels.
    const result = await page.evaluate(`(async () => {
      const paint = ${maskedCanvas.toString()};
      const source = document.createElement('canvas'); source.width = 1280; source.height = 731;
      const context = source.getContext('2d'); context.fillStyle = 'white'; context.fillRect(0,0,1280,731);
      context.fillStyle = 'red'; context.fillRect(0,0,640,731);
      const canvas = document.createElement('canvas'); paint(source, canvas);
      const encoded = canvas.toDataURL('image/jpeg', 0.85);
      const image = new Image(); image.src = encoded; await image.decode();
      context.canvas.width = image.width; context.canvas.height = image.height; context.drawImage(image,0,0);
      const data = context.getImageData(0,0,image.width,image.height).data;
      let max = 0;
      for (let y = Math.floor(image.height * 2/3); y < image.height; y++) for (let x=0; x<image.width; x++) {
        const i=(y*image.width+x)*4; max=Math.max(max,0.2126*data[i]+0.7152*data[i+1]+0.0722*data[i+2]);
      }
      return { max, width: image.width, jpeg: encoded.startsWith('data:image/jpeg;base64,') };
    })()`)
    expect(result).toMatchObject({ width: 640, jpeg: true })
    expect((result as { max: number }).max).toBeLessThanOrEqual(16)
  } finally {
    await browser.close()
  }
})

import { browserSession, initializedPage } from '../tests/browser.mjs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const session = await browserSession({ deviceScaleFactor: 2 });
try {
  const page = await initializedPage(session);
  await page.evaluate(() => window.__test.analyzeGlyph('F'));
  const state = await page.evaluate(() => window.__test.snapshot());
  assert.equal(state.text, 'F');
  assert.equal(await page.locator('#fontPreset').inputValue(), 'Roboto');
  assert.ok(state.contours > 0, await page.locator('#status').innerText());
  assert.equal(state.context, false);
  await page.locator('#settingsBtn').click();
  await page.locator('#harm').fill('40');
  await page.locator('#closeSettings').click();
  await page.waitForFunction(() => document.querySelector('#drawer').getBoundingClientRect().left >= innerWidth);
  const bounds = await page.evaluate(async () => {
    window.requestAnimationFrame = () => 0;
    await new Promise(resolve => setTimeout(resolve, 40));
    return window.__test.thumbnail();
  });
  const path = fileURLToPath(new URL('../assets/thumbnail.png', import.meta.url));
  assert.equal(await page.locator('#harm').inputValue(), '40');
  const padding = 32;
  const size = Math.ceil(Math.max(bounds.width, bounds.height) + padding * 2);
  const clip = { x: Math.floor(bounds.x + bounds.width / 2 - size / 2),
    y: Math.floor(bounds.y + bounds.height / 2 - size / 2), width: size, height: size };
  assert.ok(clip.x >= 0 && clip.y >= 58 && clip.x + clip.width <= 1280 && clip.y + clip.height < 490,
    `Thumbnail crop must exclude the toolbar and coefficient panel: ${JSON.stringify(clip)}`);
  await page.screenshot({ path, clip });
  console.log(`Saved ${path} (F, Fourier order 40, ${clip.width * 2} × ${clip.height * 2}, square crop, silent).`);
} finally {
  await session.close();
}

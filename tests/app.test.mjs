import test from 'node:test';
import assert from 'node:assert/strict';
import { browserSession, initializedPage } from './browser.mjs';
import { chromium } from 'playwright';

for (const [locale, language, glyph] of [['ja-JP', 'ja', 'あ'], ['en-US', 'en', 'A'], ['fr-FR', 'en', 'A']]) {
  test(`${locale}: automatic analysis, correct language, no audio`, async () => {
    const session = await browserSession({ locale });
    try {
      const page = await initializedPage(session);
      const state = await page.evaluate(() => window.__test.snapshot());
      assert.equal(await page.locator('html').getAttribute('lang'), language);
      assert.equal(await page.locator('#text').inputValue(), glyph);
      const family=language==='ja'?'Noto Sans JP':'Roboto';
      assert.equal(await page.locator('#fontPreset').inputValue(), family);
      assert.equal(state.text, glyph);
      assert.ok(state.contours > 0, await page.locator('#status').innerText());
      assert.equal(state.context, false);
      assert.equal(state.playing, false);
      assert.equal(await page.locator('#gain').inputValue(), '0.85');
      await page.locator('#language').selectOption(language === 'en' ? 'ja' : 'en');
      assert.equal(await page.locator('#text').inputValue(), glyph);
      assert.equal(await page.locator('#fontPreset').inputValue(), family);
      assert.equal(await page.locator('#mainAction').innerText(), language === 'en' ? '解析して鳴らす' : 'Analyze & play');
      await page.locator('#settingsBtn').click();
      await page.locator('#aboutBtn').click();
      const visibleText = await page.locator('#aboutOverlay').innerText();
      if (language === 'ja') assert.ok(!/[ぁ-んァ-ン一-龥]/.test(visibleText));
      else assert.ok(visibleText.includes('このデモについて'));
    } finally { await session.close(); }
  });
}

test('audio starts on click, gain zero mutes, frequency changes stay below clipping, auto-stop works', async () => {
  const session = await browserSession();
  try {
    const page = await initializedPage(session);
    await page.locator('#mainAction').click();
    await page.waitForFunction(() => window.__test.snapshot().playing);
    assert.equal(await page.locator('#mainAction').innerText(), 'Stop');
    await page.locator('#autoStop').uncheck();
    await page.locator('#settingsBtn').click();
    for (const freq of ['40', '220', '880']) {
      await page.locator('#freq').fill(freq);
      await page.locator('#gain').fill('1');
      const output = await page.evaluate(() => window.__test.output());
      assert.ok(output.peak <= 0.97001 && output.peak > 0, JSON.stringify(output));
    }
    await page.locator('#gain').fill('0');
    assert.equal((await page.evaluate(() => window.__test.output())).peak, 0);
    await page.locator('#autoStopSeconds').fill('0.5');
    await page.locator('#closeSettings').click();
    await page.locator('#autoStop').check();
    await page.waitForFunction(() => !window.__test.snapshot().playing);
    assert.equal(await page.locator('#mainAction').innerText(), 'Analyze & play');
  } finally { await session.close(); }
});

test('mobile EN/JA controls fit and custom fonts survive language changes and reloads', async () => {
  const session = await browserSession({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  try {
    const page = await initializedPage(session);
    for (const width of [320, 390]) {
      await page.setViewportSize({ width, height: 844 });
      for (const language of ['en', 'ja']) {
        await page.locator('#language').selectOption(language);
        for (const id of ['text', 'fontPreset', 'weight', 'language', 'settingsBtn', 'mainAction', 'autoStop']) {
          const box = await page.locator(`#${id}`).boundingBox();
          assert.ok(box && box.x >= 0 && box.x + box.width <= width + 1, `${width}: ${id}`);
        }
      }
    }
    await page.locator('#settingsBtn').click();
    await page.locator('#customFont').fill('Shippori Mincho');
    await page.locator('#addFont').click();
    await page.locator('#closeSettings').click();
    await page.locator('#language').selectOption('en');
    assert.equal(await page.locator('#fontPreset option:checked').innerText(), 'Added — Shippori Mincho');
    await page.locator('#settingsBtn').click();
    await page.locator('#customFont').fill('Lora');
    await page.locator('#addFont').click();
    await page.reload();
    await page.waitForFunction(() => window.__test && !window.__test.snapshot().busy);
    assert.equal(await page.locator('[data-custom-font]').count(), 2);
  } finally { await session.close(); }
});

test('font loading failures show an error and allow retry', async () => {
  const session = await browserSession();
  try {
    await session.context.route('https://fonts.googleapis.com/**', route => route.abort());
    const page = await initializedPage(session);
    assert.match(await page.locator('#status').innerText(), /Error: Could not load Google Fonts CSS/);
    assert.equal(await page.locator('#mainAction').isEnabled(), true);
    assert.equal((await page.evaluate(() => window.__test.snapshot())).context, false);
    await page.locator('#language').selectOption('ja');
    assert.match(await page.locator('#status').innerText(), /エラー: Google Fonts CSSを読み込めませんでした/);
    await page.locator('#language').selectOption('en');
    assert.match(await page.locator('#status').innerText(), /Error: Could not load Google Fonts CSS/);
    await session.context.unroute('https://fonts.googleapis.com/**');
    await page.locator('#mainAction').click();
    await page.waitForFunction(() => window.__test.snapshot().playing);
    assert.ok((await page.evaluate(() => window.__test.snapshot())).contours > 0);
    await page.locator('#mainAction').click();
  } finally { await session.close(); }
});

for(const [locale,language,glyph,family] of [
  ['ja-JP','ja','あ','Noto Sans JP'], ['en-US','en','A','Roboto'],
]) {
  test(`file:// ${locale}: unmodified page loads, detects language, draws animated epicycles without audio`, async () => {
    const browser=await chromium.launch({
      headless:true,
      ...(process.env.BROWSER_CHANNEL?{channel:process.env.BROWSER_CHANNEL}:{}),
      args:['--mute-audio'],
    });
    try {
      const context=await browser.newContext({locale});
      await context.addInitScript(()=>{
        window.__audioContexts=0;
        const AudioContext=window.AudioContext;
        window.AudioContext=class extends AudioContext {
          constructor(...args){super(...args);window.__audioContexts++}
        };
      });
      const page=await context.newPage();
      const errors=[];
      page.on('pageerror',error=>errors.push(error.message));
      await page.goto(new URL('../index.html',import.meta.url).href);
      await page.waitForFunction(family=>{
        return document.querySelector('#status').textContent.startsWith(`${family} 400 /`)
          && !document.querySelector('#mainAction').disabled;
      },family);
      assert.equal(await page.locator('html').getAttribute('lang'),language);
      assert.equal(await page.locator('#text').inputValue(),glyph);
      assert.equal(await page.locator('#fontPreset').inputValue(),family);
      assert.equal(await page.evaluate(()=>window.__audioContexts),0);
      assert.deepEqual(errors,[]);
      const animated=await page.evaluate(async()=>{
        const canvas=document.querySelector('#view');
        const before=canvas.toDataURL();
        await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
        return canvas.toDataURL()!==before;
      });
      assert.equal(animated,true);
      await page.locator('#language').selectOption(language==='ja'?'en':'ja');
      assert.equal(await page.locator('html').getAttribute('lang'),language==='ja'?'en':'ja');
    } finally {await browser.close()}
  });
}

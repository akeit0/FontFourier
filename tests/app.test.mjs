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
      assert.equal(await page.locator('#mainAction').innerText(), language === 'en' ? '再生' : 'Play');
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
    assert.equal(await page.locator('#mainAction').innerText(), 'Play');
  } finally { await session.close(); }
});

test('Fourier-to-pitch uses one full wave per contour, shared controls and sine voices; mode switching and stop release all voices', async () => {
  const session=await browserSession();
  try {
    const page=await initializedPage(session);
    await page.locator('#autoStop').uncheck();
    await page.locator('#pitchBtn').click();
    assert.equal(await page.locator('#pitchGlyph #view').count(),1);
    assert.equal(await page.locator('#soundMode').inputValue(),'pitch');
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).context,false);
    await page.locator('#pitchDepth').fill('12');
    await page.locator('#pitchSpacing').fill('8');
    await page.locator('#pitchRate').fill('0.2');
    await page.locator('#pitchPhase').fill('90');
    await page.locator('#pitchBase').fill('440');
    let snapshot=await page.evaluate(()=>window.__test.pitchSnapshot());
    assert.deepEqual(snapshot.curves.map(c=>({depth:c.depth,rate:c.rate,phase:c.phase})),
      [{depth:12,rate:.2,phase:90},{depth:12,rate:.2,phase:90}]);
    assert.deepEqual(snapshot.curves.map(c=>c.offset),[-4,4]);
    assert.equal(await page.locator('#speed').inputValue(),'0.2');
    assert.equal(await page.locator('#freq').inputValue(),'440');
    const signalA=snapshot.signals;
    assert.ok(signalA.flat().some(value=>Math.abs(value)>.99));
    assert.ok(signalA.flat().every(value=>Math.abs(value)<=1.00001));
    await page.locator('#pitchPlay').click();
    await page.waitForFunction(()=>window.__test.pitchSnapshot().voices===2);
    snapshot=await page.evaluate(()=>window.__test.pitchSnapshot());
    assert.deepEqual(snapshot.sourceTypes,['sine','sine']);
    const time=snapshot.time;
    await page.locator('#pitchDepth').fill('6');
    await page.waitForFunction(()=>window.__test.pitchSnapshot().groups===1&&window.__test.pitchSnapshot().gain>0);
    assert.ok((await page.evaluate(()=>window.__test.pitchSnapshot())).time>time);
    await page.locator('#settingsBtn').click();
    await page.locator('#soundMode').selectOption('waveform');
    assert.equal(await page.locator('#pitchOverlay').isVisible(),false);
    await page.locator('#closeSettings').click();
    await page.waitForFunction(()=>window.__test.pitchSnapshot().sourceTypes.join()==='buffer'&&window.__test.pitchSnapshot().groups===1);
    await page.locator('#pitchBtn').click();
    await page.waitForFunction(()=>window.__test.pitchSnapshot().voices===2);
    await page.locator('#closePitch').click();
    await page.locator('#settingsBtn').click();
    await page.locator('#gain').fill('0');
    await page.waitForFunction(()=>window.__test.pitchSnapshot().groups===1&&window.__test.pitchSnapshot().gain===0);
    await page.locator('#closeSettings').click();
    await page.locator('#pitchBtn').click();
    await page.locator('#pitchPlay').click();
    await page.waitForFunction(()=>!window.__test.snapshot().playing&&window.__test.pitchSnapshot().groups===0);
    await page.locator('#closePitch').click();
    assert.equal(await page.locator('.stage #view').count(),1);
    await page.locator('#text').fill('S');
    await page.waitForFunction(()=>window.__test.snapshot().text==='S'&&!window.__test.snapshot().busy);
    const signalS=(await page.evaluate(()=>window.__test.pitchSnapshot())).signals;
    assert.notDeepEqual(signalS,signalA,'changing the letter must change the pitch curves');
    await page.locator('#language').selectOption('ja');
    await page.locator('#pitchBtn').click();
    assert.equal(await page.locator('#pitchTitle').innerText(),'音高カーブ');
    assert.equal(await page.locator('#pitchMode').count(),0);
    assert.equal(await page.locator('#pitchRows .pitchRow').count(),1);
    assert.equal(await page.locator('#autoStop').isChecked(),false);
    assert.equal(await page.locator('#autoStop').isDisabled(),true);
  } finally { await session.close(); }
});

test('closing pitch curves restores the previous sound mode and auto-stop without starting or interrupting audio', async () => {
  const session=await browserSession();
  try{
    const page=await initializedPage(session);
    await page.locator('#pitchBtn').click();
    await page.locator('#closePitch').click();
    assert.equal(await page.locator('#soundMode').inputValue(),'waveform');
    assert.equal(await page.locator('#autoStop').isChecked(),true);
    assert.equal(await page.locator('#autoStop').isDisabled(),false);
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).context,false);
    await page.locator('#autoStop').uncheck();
    for(const close of ['button','escape']){
      await page.locator('#pitchBtn').click();
      if(!(await page.evaluate(()=>window.__test.snapshot())).playing)await page.locator('#pitchPlay').click();
      await page.waitForFunction(()=>window.__test.pitchSnapshot().sourceTypes.every(type=>type==='sine')&&window.__test.pitchSnapshot().voices===2);
      if(close==='button')await page.locator('#closePitch').click();
      else await page.keyboard.press('Escape');
      await page.waitForFunction(()=>window.__test.pitchSnapshot().sourceTypes.join()==='buffer'&&window.__test.pitchSnapshot().groups===1);
      assert.equal((await page.evaluate(()=>window.__test.snapshot())).playing,true);
      assert.equal(await page.locator('#pitchOverlay').isVisible(),false);
      assert.equal(await page.locator('#autoStop').isChecked(),false);
      assert.equal(await page.locator('#autoStop').isDisabled(),false);
    }
    await page.locator('#mainAction').click();
    await page.waitForFunction(()=>!window.__test.snapshot().playing&&window.__test.pitchSnapshot().groups===0);
    await page.locator('#settingsBtn').click();
    await page.locator('#soundMode').selectOption('pitch');
    await page.locator('#closeSettings').click();
    await page.locator('#pitchBtn').click();
    await page.locator('#closePitch').click();
    assert.equal(await page.locator('#soundMode').inputValue(),'pitch');
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).playing,false);
  }finally{await session.close()}
});

test('pitch view is exclusive, starts with zero spacing and repeats a fixed cycle independently of elapsed time or speed', async () => {
  const session=await browserSession({locale:'ja-JP'});
  try{
    const page=await initializedPage(session);
    await page.locator('#pitchBtn').click();
    assert.equal(await page.locator('#pitchTitle').innerText(),'音高カーブ');
    assert.equal(await page.locator('#pitchOverlay option[value="waveform"]').count(),0);
    assert.equal(await page.locator('#pitchSpacing').inputValue(),'0');
    assert.ok((await page.evaluate(()=>window.__test.pitchSnapshot())).curves.every(curve=>curve.offset===0));
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).context,false);
    await page.locator('#pitchRate').fill('0.25');
    assert.equal(await page.locator('#pitchPeriod').innerText(),'周期：4 秒');
    const first=await page.evaluate(()=>window.__test.pitchGraph(1));
    const repeated=await page.evaluate(()=>window.__test.pitchGraph(9));
    assert.ok(first===repeated,'The graph must return to the same position without advancing its axis');
    await page.locator('#pitchRate').fill('0.5');
    assert.equal(await page.locator('#pitchPeriod').innerText(),'周期：2 秒');
    const faster=await page.evaluate(()=>window.__test.pitchGraph(.5));
    assert.ok(first===faster,'Changing speed must preserve the graph of one cycle');
    await page.locator('#pitchPhase').fill('90');
    const shifted=await page.evaluate(()=>window.__test.pitchGraph(0));
    assert.ok(first===shifted,'Phase must move the playhead to the same point as the epicycles');
    await page.locator('#language').selectOption('en');
    assert.equal(await page.locator('#pitchTitle').innerText(),'Pitch curves');
    assert.equal(await page.locator('#pitchPeriod').innerText(),'Period: 2 s');
    assert.match(await page.locator('#pitchPosition').innerText(),/^Cycle position: 0\./);
    assert.match(await page.locator('[data-i18n="pitchCycleAxis"]').innerText(),/one cycle \(0–1\)/);
  }finally{await session.close()}
});

test('one contour creates exactly one tone; three contours create three tones and graph curves', async () => {
  const session=await browserSession({locale:'ja-JP'});
  try {
    const page=await initializedPage(session);
    await page.locator('#pitchBtn').click();
    let state=await page.evaluate(()=>window.__test.snapshot());
    assert.equal(state.contours,3);
    assert.equal(await page.locator('#pitchRows .pitchRow').count(),3);
    await page.locator('#pitchPlay').click();
    await page.waitForFunction(()=>window.__test.pitchSnapshot().voices===3);
    await page.locator('#text').fill('S');
    await page.waitForFunction(()=>window.__test.snapshot().text==='S'&&!window.__test.snapshot().busy);
    state=await page.evaluate(()=>window.__test.snapshot());
    assert.equal(state.contours,1);assert.equal(state.playing,true);
    const pitch=await page.evaluate(()=>window.__test.pitchSnapshot());
    assert.equal(pitch.voices,1);assert.equal(pitch.signals.length,1);
    assert.equal(pitch.curves[0].offset,0);
    assert.equal(await page.locator('#pitchRows .pitchRow').count(),1);
    await page.locator('#text').fill('O');
    await page.waitForFunction(()=>window.__test.snapshot().text==='O'&&!window.__test.snapshot().busy);
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).contours,2);
    assert.equal((await page.evaluate(()=>window.__test.pitchSnapshot())).voices,2);
    assert.equal(await page.locator('#pitchRows .pitchRow').count(),2);
    await page.locator('#pitchPlay').click();
    await page.waitForFunction(()=>window.__test.pitchSnapshot().groups===0);
  } finally { await session.close(); }
});

test('pitch plays past a full cycle, and editing the letter/font updates its contour curves without stopping', async () => {
  const session=await browserSession();
  try {
    const page=await initializedPage(session);
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    assert.equal(await page.locator('#autoStop').isChecked(),true);
    await page.locator('#pitchBtn').click();
    await page.locator('#pitchPlay').click();
    const started=await page.evaluate(()=>window.__test.pitchSnapshot().time);
    await page.waitForFunction(started=>{
      const state=window.__test.pitchSnapshot();
      return state.time-started>8.5;
    },started,{timeout:14000});
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).playing,true);
    const signalA=(await page.evaluate(()=>window.__test.pitchSnapshot())).signals;
    await page.locator('#text').fill('S');
    await page.waitForFunction(()=>window.__test.snapshot().text==='S'&&!window.__test.snapshot().busy);
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).playing,true);
    assert.notDeepEqual((await page.evaluate(()=>window.__test.pitchSnapshot())).signals,signalA);
    await page.locator('#fontPreset').selectOption('Playfair Display');
    await page.locator('#weight').selectOption('700');
    await page.waitForFunction(()=>window.__test.snapshot().key==='S\nPlayfair Display\n700'&&!window.__test.snapshot().busy);
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).playing,true);
    await page.locator('#settingsBtn').click();
    await page.locator('#closeSettings').click();
    assert.equal(await page.locator('#pitchTitle').isVisible(),true);
    await page.locator('#pitchPlay').click();
    await page.waitForFunction(()=>window.__test.pitchSnapshot().groups===0);
    assert.deepEqual(errors,[]);
  } finally { await session.close(); }
});

test('latest letter wins when typing interrupts a pending font load; IME confirmation never starts audio', async () => {
  const session=await browserSession({locale:'ja-JP'});
  let release;
  const blocked=new Promise(resolve=>{release=resolve});
  try {
    const page=await initializedPage(session);
    await page.route('https://fonts.googleapis.com/**',async route=>{
      if(new URL(route.request().url()).searchParams.get('text')?.trim()==='B')await blocked;
      await route.continue().catch(()=>{});
    });
    await page.locator('#text').fill('B');
    await page.waitForFunction(()=>window.__test.snapshot().busy);
    await page.locator('#text').fill('C');
    await page.waitForFunction(()=>window.__test.snapshot().text==='C'&&!window.__test.snapshot().busy);
    release();
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).text,'C');
    await page.locator('#text').dispatchEvent('compositionstart');
    await page.locator('#text').fill('い');
    await page.locator('#text').dispatchEvent('keydown',{key:'Enter',isComposing:true});
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).context,false);
    await page.locator('#text').dispatchEvent('compositionend');
    await page.waitForFunction(()=>window.__test.snapshot().text==='い'&&!window.__test.snapshot().busy);
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).context,false);
  } finally { release();await session.close(); }
});

function measuredFrequency(samples,at,window=.04){
  const sr=48000,start=Math.floor((at-window/2)*sr),end=Math.floor((at+window/2)*sr),crossings=[];
  for(let i=start;i<end;i++)if(samples[i]<=0&&samples[i+1]>0){
    crossings.push(i-samples[i]/(samples[i+1]-samples[i]));
  }
  return (crossings.length-1)*sr/(crossings.at(-1)-crossings[0]);
}

test('rendered sine pitch follows Fourier control samples, offsets and phase across the full cycle', async () => {
  const session=await browserSession();
  try {
    const page=await initializedPage(session);
    const values=Array.from({length:4096},(_,i)=>Math.sin(2*Math.PI*i/4096));
    const samples=await page.evaluate(args=>window.__test.renderPitch(args),{values,rate:.5,depth:12});
    assert.ok(Math.abs(measuredFrequency(samples,.5)-880)<9);
    assert.ok(Math.abs(measuredFrequency(samples,1.5)-220)<3);
    const shifted=await page.evaluate(args=>window.__test.renderPitch(args),{values,depth:12,offset:12,phase:180});
    assert.ok(Math.abs(measuredFrequency(shifted,.5)-440)<5);
    assert.ok(Math.abs(measuredFrequency(shifted,1.5)-1760)<18);
    const signals=(await page.evaluate(()=>window.__test.pitchSnapshot())).signals;
    const glyphSamples=await page.evaluate(args=>window.__test.renderPitch(args),{values:signals[0],depth:7,rate:.12,duration:2});
    for(const at of [.3,.9,1.6]){
      const index=at*.12*signals[0].length;
      const expected=440*2**(7*signals[0][Math.floor(index)]/12);
      assert.ok(Math.abs(measuredFrequency(glyphSamples,at)-expected)/expected<.04,`t=${at}: expected ${expected}`);
    }
  } finally { await session.close(); }
});

test('portrait pitch view keeps a large glyph, scrollable controls and visible playback after resizing', async () => {
  const session=await browserSession({viewport:{width:390,height:844},deviceScaleFactor:2});
  try{
    const page=await initializedPage(session);
    await page.locator('#pitchBtn').click();
    for(const viewport of [{width:320,height:568},{width:390,height:844},{width:768,height:1024}]){
      await page.setViewportSize(viewport);
      for(const language of ['en','ja']){
        await page.locator('#language').selectOption(language);
        await page.locator('.pitchWorkspace').evaluate(el=>{el.scrollTop=0});
        await page.waitForFunction(()=>{
          const canvas=document.querySelector('#view'),rect=canvas.getBoundingClientRect();
          return rect.height>=280&&Math.abs(canvas.height-rect.height*devicePixelRatio)<=1;
        });
        const glyph=await page.locator('#pitchGlyph').boundingBox();
        const graph=await page.locator('#pitchGraph').boundingBox();
        assert.ok(glyph.height>=280&&glyph.width>=viewport.width-1);
        assert.ok(graph.height>=100&&graph.y>=glyph.y+glyph.height);
        assert.equal(await page.locator('#mainAction').isVisible(),false);
        assert.equal(await page.locator('#pitchPlay').isVisible(),true);
        await page.locator('#pitchSpacing').scrollIntoViewIfNeeded();
        await page.locator('#pitchSpacing').fill('3');
        const input=await page.locator('#pitchSpacing').boundingBox();
        const header=await page.locator('.pitchHead').boundingBox();
        const footer=await page.locator('.transport').boundingBox();
        assert.ok(input.y>=header.y+header.height&&input.y+input.height<=footer.y+1,JSON.stringify({viewport,language,input,header,footer}));
        assert.ok(input.x>=0&&input.x+input.width<=viewport.width);
        assert.ok(header.y>=0&&footer.y+footer.height<=viewport.height+1);
        assert.equal((await page.evaluate(()=>window.__test.snapshot())).context,false);
      }
    }
    await page.setViewportSize({width:1280,height:720});
    assert.equal(await page.locator('#mainAction').isVisible(),true);
    await page.locator('#closePitch').click();
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.locator('#mainAction').isVisible(),true);
    assert.equal(await page.locator('#pitchBtn').isVisible(),true);
    assert.equal(await page.locator('.stage #view').count(),1);
    assert.equal(await page.locator('#soundMode').inputValue(),'waveform');
  }finally{await session.close()}
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

test('unsupported characters use fallback outlines with a translated status outside the canvas', async () => {
  const session=await browserSession();
  try{
    const page=await initializedPage(session);
    await page.locator('#text').fill('あ');
    await page.locator('#mainAction').click();
    await page.waitForFunction(()=>!window.__test.snapshot().busy);
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).playing,true);
    assert.equal(await page.locator('#notice').isVisible(),false);
    assert.match(await page.locator('#status').innerText(),/^Fallback font/);
    assert.match(await page.locator('#status').getAttribute('title'),/Roboto.*あ.*browser’s fallback font/);
    assert.ok(!/network error/i.test(await page.locator('#status').innerText()));
    assert.ok((await page.evaluate(()=>window.__test.snapshot())).contours>0);
    await page.locator('#mainAction').click();
    await page.locator('#language').selectOption('ja');
    assert.equal(await page.locator('#notice').isVisible(),false);
    assert.match(await page.locator('#status').innerText(),/^代替フォント/);
    assert.match(await page.locator('#status').getAttribute('title'),/Robotoに「あ」がないため/);
    await page.locator('#text').fill('Aあ');
    await page.locator('#mainAction').click();
    await page.waitForFunction(()=>!window.__test.snapshot().busy);
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).playing,true);
    assert.match(await page.locator('#status').getAttribute('title'),/「あ」/);
    await page.locator('#mainAction').click();
    await page.locator('#fontPreset').selectOption('Noto Sans JP');
    await page.locator('#mainAction').click();
    await page.waitForFunction(()=>!window.__test.snapshot().busy);
    assert.equal(await page.locator('#notice').isVisible(),false);
    assert.ok(!/代替フォント/.test(await page.locator('#status').innerText()));
    assert.ok((await page.evaluate(()=>window.__test.snapshot())).contours>0);
    await page.locator('#mainAction').click();
  }finally{await session.close()}
});

test('Egyptian hieroglyphs retain the browser’s native fallback outlines', async () => {
  const session=await browserSession();
  try{
    const page=await initializedPage(session);
    await page.locator('#text').fill('𓄿');
    await page.locator('#mainAction').click();
    await page.waitForFunction(()=>!window.__test.snapshot().busy);
    const state=await page.evaluate(()=>window.__test.snapshot());
    assert.equal(state.playing,true);
    assert.equal(state.text,'𓄿');
    assert.ok(state.contours>0);
    assert.equal(await page.locator('#notice').isVisible(),false);
    assert.match(await page.locator('#status').getAttribute('title'),/Roboto.*𓄿.*browser’s fallback font/);
    const nativePixelsMatch=await page.evaluate(()=>{
      const actual=document.querySelector('#raster'),ctx=actual.getContext('2d');
      const reference=document.createElement('canvas');
      reference.width=actual.width;reference.height=actual.height;
      const native=reference.getContext('2d',{willReadFrequently:true});
      native.font='400 260px "Roboto",sans-serif';
      native.fillStyle='#fff';native.textBaseline='alphabetic';
      const ascent=Math.ceil(native.measureText('𓄿').actualBoundingBoxAscent||260*.82);
      native.fillText('𓄿',34,34+ascent);
      const first=ctx.getImageData(0,0,actual.width,actual.height).data;
      const second=native.getImageData(0,0,actual.width,actual.height).data;
      return first.every((value,i)=>value===second[i]);
    });
    assert.equal(nativePixelsMatch,true);
    await page.locator('#mainAction').click();
  }finally{await session.close()}
});

test('text without visible outlines shows a prominent error, clears old contours and allows recovery', async () => {
  const session=await browserSession({viewport:{width:320,height:844}});
  try{
    const page=await initializedPage(session);
    await page.locator('#text').fill('\u200B');
    await page.locator('#mainAction').click();
    await page.waitForFunction(()=>!window.__test.snapshot().busy);
    const state=await page.evaluate(()=>window.__test.snapshot());
    assert.equal(state.playing,false);assert.equal(state.contours,0);
    assert.equal(await page.locator('#notice').getAttribute('role'),'alert');
    assert.match(await page.locator('#noticeMessage').innerText(),/No visible contours found/);
    assert.equal(await page.locator('#notice').isVisible(),true);
    const bounds=await page.locator('#notice').boundingBox();
    assert.ok(bounds.x>=0&&bounds.x+bounds.width<=320);
    await page.locator('#language').selectOption('ja');
    assert.match(await page.locator('#noticeMessage').innerText(),/表示できる輪郭がありません/);
    await page.locator('#text').fill('A');
    await page.locator('#mainAction').click();
    await page.waitForFunction(()=>!window.__test.snapshot().busy);
    assert.equal(await page.locator('#notice').isVisible(),false);
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).playing,true);
    await page.locator('#mainAction').click();
  }finally{await session.close()}
});

test('complex contours keep identical Fourier coefficients and epicycle positions', async () => {
  const session=await browserSession();
  try{
    const page=await initializedPage(session);
    await page.locator('#fontPreset').selectOption('Noto Sans JP');
    await page.evaluate(()=>window.__test.analyzeGlyph('龘鬱龍'));
    const data=await page.evaluate(()=>window.__test.fourierData());
    assert.ok(data.length>20);
    for(const {sampled,coeffs} of data)for(const c of coeffs){
      let re=0,im=0;
      for(let n=0;n<sampled.length;n++){
        const a=-2*Math.PI*c.k*n/sampled.length,ca=Math.cos(a),sa=Math.sin(a),{x,y}=sampled[n];
        re+=x*ca-y*sa;im+=x*sa+y*ca;
      }
      assert.ok(Math.abs(c.re-re/sampled.length)<1e-12);
      assert.ok(Math.abs(c.im-im/sampled.length)<1e-12);
    }
    for(const cutoff of [5.25,40,60])for(const time of [.071,.24,.8]){
      const actual=await page.evaluate(({time,cutoff})=>window.__test.chain(0,time,cutoff),{time,cutoff});
      const weight=k=>{
        if(!k)return 1;
        const u=Math.max(0,Math.min(1,(Math.abs(k)-cutoff+.55)/1.1));
        return 1-u*u*(3-2*u);
      };
      const dc=data[0].coeffs.find(c=>!c.k);
      let x=dc.re,y=dc.im;
      const active=data[0].coeffs.filter(c=>c.k&&weight(c.k)>.001)
        .sort((a,b)=>b.amp*weight(b.k)-a.amp*weight(a.k));
      assert.equal(actual.steps.length,active.length);
      for(let i=0;i<active.length;i++){
        const c=active[i],r=c.amp*weight(c.k),a=2*Math.PI*c.k*time+c.phase;
        assert.ok(Math.hypot(actual.steps[i].x-x,actual.steps[i].y-y)<1e-12);
        x+=r*Math.cos(a);y+=r*Math.sin(a);
        assert.ok(Math.hypot(actual.steps[i].x2-x,actual.steps[i].y2-y)<1e-12);
      }
      assert.ok(Math.hypot(actual.end.x-x,actual.end.y-y)<1e-12);
    }
  }finally{await session.close()}
});

test('cached rendering avoids repeated Fourier work and updates controls, sampling, language and size', async () => {
  const session=await browserSession();
  try{
    const page=await initializedPage(session);
    await page.locator('#fontPreset').selectOption('Noto Sans JP');
    await page.evaluate(()=>window.__test.analyzeGlyph('龘鬱龍'));
    const initial=await page.evaluate(()=>window.__test.render());
    const frameWork=await page.evaluate(()=>{
      const ctx=document.querySelector('#view').getContext('2d'),stroke=ctx.stroke;
      const sin=Math.sin,cos=Math.cos;let calls=0,strokes=0;
      Math.sin=x=>{calls++;return sin(x)};Math.cos=x=>{calls++;return cos(x)};
      ctx.stroke=function(...args){strokes++;return stroke.apply(this,args)};
      try{window.__test.render({time:.2})}finally{Math.sin=sin;Math.cos=cos;ctx.stroke=stroke}
      return {calls,strokes,contours:window.__test.snapshot().contours};
    });
    assert.ok(frameWork.calls<=122,`Steady frame used ${frameWork.calls} trig calls`);
    assert.ok(frameWork.strokes<=frameWork.contours,`Steady frame submitted ${frameWork.strokes} strokes`);
    await page.locator('#showCycles').evaluate(element=>{element.checked=false});
    const withoutCircles=await page.evaluate(()=>window.__test.render());
    assert.notEqual(initial.main,withoutCircles.main);
    async function matchesFresh(options={}){
      const cached=await page.evaluate(options=>window.__test.render(options),options);
      const fresh=await page.evaluate(options=>window.__test.render({...options,clear:true}),options);
      assert.ok(cached.main===fresh.main,'Cached main canvas differs from a fresh draw');
      assert.ok(cached.series===fresh.series,'Cached coefficients differ from a fresh draw');
      return cached;
    }
    await matchesFresh();
    const lowOrder=await matchesFresh({cutoff:10});
    assert.notEqual(lowOrder.main,withoutCircles.main);
    assert.notEqual(lowOrder.series,withoutCircles.series);
    for(const id of ['showGlyph','showContour','showRecon']){
      await page.locator(`#${id}`).evaluate(element=>{element.checked=!element.checked});
      await matchesFresh();
    }
    await page.locator('#cycleTarget').selectOption('largest');
    await matchesFresh();
    await page.locator('#language').selectOption('ja');
    await matchesFresh();
    assert.equal(await page.locator('#seriesCaption').innerText(),'最大輪郭のみ');
    await page.locator('#showSeries').evaluate(element=>{element.checked=false});
    await matchesFresh();
    await page.locator('#showSeries').evaluate(element=>{element.checked=true});
    await page.setViewportSize({width:390,height:844});
    await matchesFresh();
    await page.locator('#settingsBtn').click();
    await page.locator('#samples').fill('128');
    await page.waitForFunction(()=>window.__test.snapshot().samples===128&&!window.__test.snapshot().transitioning);
    await matchesFresh();
    await page.evaluate(()=>window.__test.analyzeGlyph('𓄿'));
    await matchesFresh();
  }finally{await session.close()}
});

test('font binary download failures display connection guidance rather than raw NetworkError', async () => {
  const session=await browserSession();
  try{
    const page=await initializedPage(session);
    await page.route('https://fonts.gstatic.com/**',route=>route.abort());
    await page.locator('#text').fill('Z');
    await page.locator('#mainAction').click();
    await page.waitForFunction(()=>!window.__test.snapshot().busy);
    assert.match(await page.locator('#noticeMessage').innerText(),/Could not download Roboto.*connection/);
    assert.equal((await page.evaluate(()=>window.__test.snapshot())).playing,false);
    await page.locator('#language').selectOption('ja');
    assert.match(await page.locator('#noticeMessage').innerText(),/Robotoをダウンロードできませんでした/);
  }finally{await session.close()}
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

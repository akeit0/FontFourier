import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import { serve } from '../scripts/serve.mjs';

export async function browserSession(options = {}) {
  const server = await serve(0);
  let browser;
  try {
    browser = await chromium.launch({
      headless: true,
      ...(process.env.BROWSER_CHANNEL ? { channel: process.env.BROWSER_CHANNEL } : {}),
      args: ['--mute-audio'],
    });
    const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 720 }, ...options });
    // Instrument only the test response; production code has no test globals.
    const app = await readFile(new URL('../assets/app.js', import.meta.url), 'utf8');
    await context.route('**/assets/app.js', route => route.fulfill({
      contentType: 'text/javascript',
      body: app.replace(/\}\)\(\);\s*$/, `\nwindow.__test = {
        snapshot: () => ({ text: state.rasterMeta?.text, contours: state.data.length,
          key: state.analysisKey, busy: state.busy, context: !!audio.ctx, playing: isPlaying() }),
        output: () => { const {L,R}=buildAudioCycle(); const gain=outputGainValue();
          return { peak: Math.max(...L.map(x=>Math.abs(x*gain)), ...R.map(x=>Math.abs(x*gain))),
            rms: Math.sqrt([...L,...R].reduce((sum,x)=>sum+(x*gain)**2,0)/(L.length+R.length)) }; },
        analyzeGlyph: async text => { ui.text.value=text;await analyze(); },
        thumbnail: () => {
          state.animT=.125;state.harmCurrent=40;drawMain();drawSeries();
          const {w,h,dpr}=resizeCanvas(ui.view),tf=fitTransform(w,h);
          const points=[];
          for(const data of state.data){
            points.push(...data.sampled.map(point=>P(point,tf)));
            for(const step of epicycleChain(data.coeffs,state.animT).steps){
              const center=P({x:step.x,y:step.y},tf),radius=step.r*tf.s;
              points.push({x:center.x-radius,y:center.y-radius},{x:center.x+radius,y:center.y+radius});
            }
          }
          const rect=ui.view.getBoundingClientRect();
          return { x:rect.x+Math.min(...points.map(p=>p.x))/dpr,
            y:rect.y+Math.min(...points.map(p=>p.y))/dpr,
            width:(Math.max(...points.map(p=>p.x))-Math.min(...points.map(p=>p.x)))/dpr,
            height:(Math.max(...points.map(p=>p.y))-Math.min(...points.map(p=>p.y)))/dpr };
        }
      };\n})();`),
    }));
    return {
      context,
      url: `http://127.0.0.1:${server.address().port}/`,
      close: async () => { await browser.close(); await new Promise(resolve => server.close(resolve)); },
    };
  } catch (error) {
    if (browser) await browser.close();
    await new Promise(resolve => server.close(resolve));
    throw error;
  }
}

export async function initializedPage(session) {
  const page = await session.context.newPage();
  await page.goto(session.url);
  await page.waitForFunction(() => window.__test && !window.__test.snapshot().busy, { timeout: 30000 });
  return page;
}

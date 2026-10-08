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
          key: state.analysisKey, busy: state.busy, context: !!audio.ctx, playing: isPlaying(),
          samples:state.data[0]?.sampled.length,transitioning:!!state.transitionStart }),
        output: () => { const {L,R}=buildAudioCycle(); const gain=outputGainValue();
          return { peak: Math.max(...L.map(x=>Math.abs(x*gain)), ...R.map(x=>Math.abs(x*gain))),
            rms: Math.sqrt([...L,...R].reduce((sum,x)=>sum+(x*gain)**2,0)/(L.length+R.length)) }; },
        analyzeGlyph: async text => {
          clearTimeout(state.analysisTimer);state.analysisTimer=null;state.pendingAnalysis=false;
          ui.text.value=text;await analyze();
        },
        fourierData: () => state.data.map(({sampled,coeffs})=>({sampled,coeffs})),
        chain: (index,t,cutoff) => epicycleChain(state.data[index].coeffs,t,cutoff),
        render: ({cutoff=+ui.harm.value,time=.125,clear=false}={}) => {
          state.harmCurrent=cutoff;state.animT=time;
          if(clear){mainLayerKey=[];seriesKey=[]}
          drawMain();drawSeries();
          return {main:ui.view.toDataURL(),series:ui.series.toDataURL()};
        },
        benchmark: (frames=30) => {
          state.harmCurrent=+ui.harm.value;
          drawMain();drawSeries();
          const samples=[];
          for(let i=0;i<frames;i++){
            state.animT=(state.animT+.001)%1;
            const start=performance.now();drawMain();drawSeries();samples.push(performance.now()-start);
          }
          return {contours:state.data.length,mean:samples.reduce((a,b)=>a+b,0)/frames,
            median:samples.slice().sort((a,b)=>a-b)[Math.floor(frames/2)]};
        },
        pitchSnapshot: () => ({ mode:ui.soundMode.value, time:pitchTime(), phase:pitch.phase(pitchTime()),
          signals:pitchSignals().map(values=>Array.from(values)), curves:pitch.curves().map(({values,...curve})=>curve),
          voices:audio.group?.voices.length||0, groups:audio.groups.size,
          sourceTypes:audio.group?.voices.map(({src})=>src.type||'buffer')||[],
          gain:audio.gain?.gain.value||0, cutoff:audioHarmonicLimit() }),
        pitchGraph: time => {
          const getTime=pitch.getTime;pitch.getTime=()=>time;
          try{pitch.draw();return pitch.ui.Graph.toDataURL()}finally{pitch.getTime=getTime}
        },
        renderPitch: async ({values,depth=12,rate=.5,phase=0,offset=0,epoch=0,duration=2}) => {
          const ctx=new OfflineAudioContext(1,Math.ceil(duration*48000),48000);
          const src=ctx.createOscillator();src.type='sine';src.frequency.value=440;
          window.FontFourierPitch.connectPitchCurve(ctx,src,
            {values:new Float32Array(values),depth,rate,phase,offset},epoch,0);
          src.connect(ctx.destination);src.start(0);src.stop(duration);
          const result=await ctx.startRendering();
          return Array.from(result.getChannelData(0));
        },
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

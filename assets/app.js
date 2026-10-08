(() => {
const { browserLanguage, applyLanguage, t } = window.FontFourierI18n;
let d3Contours;
async function ensureContours(){
  if(d3Contours)return;
  try{
    ({contours:d3Contours}=await import("https://cdn.jsdelivr.net/npm/d3-contour@4.0.2/+esm"));
  }catch{throw appError("contourLibraryError")}
}

const $=s=>document.querySelector(s);
const ui={
  language:$("#language"),text:$("#text"),fontPreset:$("#fontPreset"),weight:$("#weight"),
  settingsBtn:$("#settingsBtn"),closeSettings:$("#closeSettings"),backdrop:$("#backdrop"),drawer:$("#drawer"),
  aboutBtn:$("#aboutBtn"),aboutOverlay:$("#aboutOverlay"),closeAbout:$("#closeAbout"),
  customFont:$("#customFont"),addFont:$("#addFont"),fontProbe:$("#fontProbe"),
  mainAction:$("#mainAction"),status:$("#status"),playMode:$("#playMode"),
  notice:$("#notice"),noticeTitle:$("#noticeTitle"),noticeMessage:$("#noticeMessage"),
  autoStop:$("#autoStop"),autoStopLabel:$("#autoStopLabel"),autoStopSeconds:$("#autoStopSeconds"),autoStopSecondsVal:$("#autoStopSecondsVal"),
  view:$("#view"),series:$("#series"),seriesPanel:$("#seriesPanel"),seriesCaption:$("#seriesCaption"),raster:$("#raster"),
  showGlyph:$("#showGlyph"),showContour:$("#showContour"),showRecon:$("#showRecon"),showCycles:$("#showCycles"),showSeries:$("#showSeries"),
  cycleTarget:$("#cycleTarget"),cycleThickness:$("#cycleThickness"),audioTarget:$("#audioTarget"),
  harm:$("#harm"),harmVal:$("#harmVal"),samples:$("#samples"),sampleVal:$("#sampleVal"),
  speed:$("#speed"),speedVal:$("#speedVal"),freq:$("#freq"),freqVal:$("#freqVal"),
  gain:$("#gain"),gainVal:$("#gainVal"),normalizeTarget:$("#normalizeTarget"),
  normalizeVal:$("#normalizeVal"),loudnessPhon:$("#loudnessPhon")
};

let state={
  rawContours:[],data:[],prevData:[],transitionStart:0,sampleTimer:null,
  animT:0,lastTime:performance.now(),harmCurrent:+ui.harm.value,
  analysisKey:"",rasterMeta:null,busy:false,fontLoadToken:0,statusKey:"ready",statusValues:{},fontNotice:null
};
let audio={ctx:null,src:null,gain:null,stopTimer:null};

function setStatus(key, values={}){
  state.statusKey=key;state.statusValues=values;
  const rendered={...values};
  if(typeof rendered.message==="object"&&rendered.message){
    rendered.message=t(rendered.message.key,rendered.message.values);
  }
  const fallback=key!=="error"&&state.fontNotice;
  ui.status.textContent=(fallback?t("fontFallbackStatus")+" · ":"")+t(key,rendered);
  ui.status.title=fallback?t(fallback.key,fallback.values):ui.status.textContent;
  renderNotice();
}
function renderNotice(){
  const notice=state.statusKey==="error"?state.statusValues.message:null;
  ui.notice.hidden=!notice;
  if(!notice)return;
  ui.noticeTitle.textContent=t("fontErrorTitle");
  ui.noticeMessage.textContent=typeof notice==="object"?t(notice.key,notice.values):notice;
}
function appError(key,values={}){
  const error=new Error(t(key,values));
  error.translation={key,values};return error;
}
function reportError(error){
  if(error.translation?.key==="contourError"){
    state.rawContours=[];state.data=[];state.prevData=[];state.rasterMeta=null;state.analysisKey="";
  }
  setStatus("error",{message:error.translation||error.message});
}
function setLanguage(language){
  applyLanguage(language);ui.language.value=document.documentElement.lang;
  for(const option of ui.fontPreset.querySelectorAll('[data-custom-font]')){
    option.textContent=t("customFont",{family:option.value});
  }
  ui.mainAction.textContent=t(isPlaying()?"stop":"play");
  setStatus(state.statusKey,state.statusValues);
  updateNormalizeUi();updateAutoStopUi();
}
ui.language.addEventListener("change",()=>setLanguage(ui.language.value));
function smoothstep(a,b,x){
  if(a===b)return x<a?0:1;
  let t=Math.max(0,Math.min(1,(x-a)/(b-a)));
  return t*t*(3-2*t);
}
function openSettings(){document.body.classList.add("settingsOpen");ui.drawer.setAttribute("aria-hidden","false");ui.drawer.inert=false;ui.closeSettings.focus()}
function closeSettings(){document.body.classList.remove("settingsOpen");ui.drawer.setAttribute("aria-hidden","true");ui.drawer.inert=true;ui.settingsBtn.focus()}
function openAbout(){
  document.body.classList.add("aboutOpen");
  ui.aboutOverlay.setAttribute("aria-hidden","false");ui.aboutOverlay.inert=false;ui.closeAbout.focus();
}
function closeAbout(){
  document.body.classList.remove("aboutOpen");
  ui.aboutOverlay.setAttribute("aria-hidden","true");ui.aboutOverlay.inert=true;ui.aboutBtn.focus();
}
ui.settingsBtn.addEventListener("click",openSettings);
ui.closeSettings.addEventListener("click",closeSettings);
ui.backdrop.addEventListener("click",closeSettings);
ui.aboutBtn.addEventListener("click",openAbout);
ui.closeAbout.addEventListener("click",closeAbout);
ui.aboutOverlay.addEventListener("click",e=>{if(e.target===ui.aboutOverlay)closeAbout()});
document.addEventListener("keydown",e=>{
  if(e.key==="Escape"){
    if(document.body.classList.contains("aboutOpen"))closeAbout();
    else if(document.body.classList.contains("settingsOpen"))closeSettings();
  }
});

function loadCustomFonts(){
  let list=[];
  try{list=JSON.parse(localStorage.getItem("fontFourierCustomFonts")||"[]")}catch{}
  if(!Array.isArray(list))list=[];
  for(const family of list)if(typeof family==="string"&&family.trim())appendCustomFontOption(family);
}
function appendCustomFontOption(family){
  const exists=[...ui.fontPreset.options].some(o=>o.value===family);
  if(exists)return;
  const opt=document.createElement("option");
  opt.value=family;opt.dataset.customFont="true";opt.textContent=t("customFont",{family});
  ui.fontPreset.appendChild(opt);
}
ui.addFont.addEventListener("click",()=>{
  const family=ui.customFont.value.trim();
  if(!family)return;
  appendCustomFontOption(family);
  ui.fontPreset.value=family;
  const all=[...ui.fontPreset.options].filter(o=>o.dataset.customFont).map(o=>o.value);
  try{localStorage.setItem("fontFourierCustomFonts",JSON.stringify([...new Set(all)]))}catch{}
  ui.customFont.value="";
  invalidateAnalysis("fontAdded");
});

function currentFamily(){return ui.fontPreset.value}
function currentKey(){return `${ui.text.value}\n${currentFamily()}\n${ui.weight.value}`}

function googleFontsHref(family,weight,text){
  const fam=family.trim().replace(/\s+/g,"+");
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(fam).replace(/%2B/g,"+")}:wght@${weight}&display=swap&text=${encodeURIComponent(text||"A")}`;
}
function waitLinkLoad(link,token){
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>finish(appError("fontCssError")),15000);
    function finish(error){
      clearTimeout(timer);link.onload=null;link.onerror=null;
      error?reject(error):resolve();
    }
    link.onload=()=>finish(token===state.fontLoadToken?null:appError("fontCssError"));
    link.onerror=()=>finish(appError("fontCssError"));
  });
}
function twoFrames(){
  return new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
}
async function ensureFont(){
  const family=currentFamily().trim(),weight=ui.weight.value,text=ui.text.value;
  if(!family)throw appError("fontEmpty");
  if(!text.trim())throw appError("contourError");
  state.fontNotice=null;

  const token=++state.fontLoadToken;
  const old=document.querySelector("#dynamic-font");
  if(old)old.remove();

  const link=document.createElement("link");
  link.id="dynamic-font";link.rel="stylesheet";
  // A space keeps an entirely unsupported subset from producing an empty font file.
  link.href=googleFontsHref(family,weight,text+" ");
  setStatus("loadingFont");
  const loaded=waitLinkLoad(link,token);
  document.head.appendChild(link);
  await loaded;

  // iOS Safari対策:
  // 1) stylesheet load完了後にFontFaceSetへ明示ロード
  // 2) 実DOMで同じfamily/weight/textを一度レイアウト
  // 3) 2フレーム待ってからCanvasへ描画
  ui.fontProbe.textContent=text;
  ui.fontProbe.style.fontFamily=`"${family}", sans-serif`;
  ui.fontProbe.style.fontWeight=weight;
  void ui.fontProbe.offsetWidth;

  async function load(){
    try{
      await document.fonts.load(`${weight} 260px "${family}"`,text+" ");
      await document.fonts.ready;
    }catch{throw appError("fontFileError",{family})}
  }
  await load();

  let ok=document.fonts.check(`${weight} 260px "${family}"`,text);
  if(!ok){
    await new Promise(r=>setTimeout(r,80));
    await load();
    ok=document.fonts.check(`${weight} 260px "${family}"`,text);
  }
  await twoFrames();
  if(!ok)throw appError("fontLoadError",{family,weight});
  const missing=await window.FontFourierGlyphCheck.missing([family],weight,text);
  if(missing.length){
    // Detect missing primary glyphs only; leave fallback selection to the browser.
    state.fontNotice={key:"fontFallback",values:{family,characters:missing.join(" ")}};
  }
  return{family,weight,text};
}

function rasterizeText(family,weight,text){
  const c=ui.raster,ctx=c.getContext("2d",{willReadFrequently:true});
  const fontPx=260,pad=34;
  const font=`${weight} ${fontPx}px ${window.FontFourierGlyphCheck.cssFamily(family)},sans-serif`;
  ctx.font=font;
  const m=ctx.measureText(text);
  const asc=Math.ceil(m.actualBoundingBoxAscent||fontPx*.82);
  const desc=Math.ceil(m.actualBoundingBoxDescent||fontPx*.24);
  c.width=Math.max(80,Math.ceil(m.width+pad*2));
  c.height=Math.max(80,asc+desc+pad*2);

  // canvas resize resets state: set font AFTER resizing too.
  ctx.clearRect(0,0,c.width,c.height);
  ctx.fillStyle="#fff";
  ctx.textBaseline="alphabetic";
  ctx.font=font;
  const baseX=pad,baseline=pad+asc;
  ctx.fillText(text,baseX,baseline);

  const img=ctx.getImageData(0,0,c.width,c.height);
  const vals=new Float32Array(c.width*c.height);
  for(let i=0,p=0;i<img.data.length;i+=4,p++)vals[p]=img.data[i+3]/255;

  const geom=d3Contours().size([c.width,c.height]).thresholds([.5])(vals)[0];
  if(!geom)return{rings:[],meta:null};
  const rings=[];
  for(const poly of geom.coordinates)for(const ring of poly){
    if(ring.length>=8)rings.push(ring.map(([x,y])=>({x,y})));
  }
  let minX=Infinity,minY=Infinity,maxX=-Infinity,maxY=-Infinity;
  for(const ring of rings)for(const p of ring){
    minX=Math.min(minX,p.x);minY=Math.min(minY,p.y);
    maxX=Math.max(maxX,p.x);maxY=Math.max(maxY,p.y);
  }
  const cx=(minX+maxX)/2,cy=(minY+maxY)/2,scale=Math.max(maxX-minX,maxY-minY)||1;
  return{rings,meta:{cx,cy,scale,minX,minY,maxX,maxY,width:c.width,height:c.height,family,weight,text}};
}

function ringLength(pts){
  let s=0;
  for(let i=0;i<pts.length;i++){
    const a=pts[i],b=pts[(i+1)%pts.length];
    s+=Math.hypot(b.x-a.x,b.y-a.y);
  }
  return s;
}
function resampleClosed(pts,n){
  const seg=[],cum=[0];let total=0;
  for(let i=0;i<pts.length;i++){
    const a=pts[i],b=pts[(i+1)%pts.length],d=Math.hypot(b.x-a.x,b.y-a.y);
    seg.push(d);total+=d;cum.push(total);
  }
  const out=[];let j=0;
  for(let k=0;k<n;k++){
    const target=total*k/n;
    while(j<seg.length-1&&cum[j+1]<target)j++;
    const a=pts[j],b=pts[(j+1)%pts.length],t=seg[j]?(target-cum[j])/seg[j]:0;
    out.push({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
  }
  return{points:out,length:total};
}
function normalizeGlobal(p,m){return{x:(p.x-m.cx)/m.scale,y:(p.y-m.cy)/m.scale}}
function dft(points,maxH){
  const N=points.length,out=[];
  for(let k=-maxH;k<=maxH;k++){
    let re=0,im=0;
    for(let n=0;n<N;n++){
      const a=-2*Math.PI*k*n/N,ca=Math.cos(a),sa=Math.sin(a),x=points[n].x,y=points[n].y;
      re+=x*ca-y*sa;im+=x*sa+y*ca;
    }
    re/=N;im/=N;out.push({k,re,im,amp:Math.hypot(re,im),phase:Math.atan2(im,re)});
  }
  return out;
}
function coeffWeight(k,cutoff){
  const a=Math.abs(k);if(a===0)return 1;
  return 1-smoothstep(cutoff-.55,cutoff+.55,a);
}
function evalSeries(coeffs,t,cutoff=state.harmCurrent){
  let x=0,y=0;
  for(const c of coeffs){
    const w=coeffWeight(c.k,cutoff);if(w<=0)continue;
    const a=2*Math.PI*c.k*t,ca=Math.cos(a),sa=Math.sin(a);
    x+=(c.re*ca-c.im*sa)*w;y+=(c.re*sa+c.im*ca)*w;
  }
  return{x,y};
}
function epicycleChain(coeffs,t,cutoff=state.harmCurrent){
  const c0=coeffs.find(c=>c.k===0);let x=c0?.re||0,y=c0?.im||0;
  const active=coeffs.filter(c=>c.k!==0&&coeffWeight(c.k,cutoff)>.001)
    .map(c=>({...c,w:coeffWeight(c.k,cutoff)}))
    .sort((a,b)=>(b.amp*b.w)-(a.amp*a.w));
  const steps=[];
  for(const c of active){
    const r=c.amp*c.w,a=2*Math.PI*c.k*t+c.phase,x2=x+r*Math.cos(a),y2=y+r*Math.sin(a);
    steps.push({x,y,r,x2,y2});x=x2;y=y2;
  }
  return{steps,end:{x,y}};
}
function buildData(sampleCount){
  return state.rawContours.map(r=>{
    const rr=resampleClosed(r,sampleCount);
    const sampled=rr.points.map(p=>normalizeGlobal(p,state.rasterMeta));
    return{sampled,length:rr.length,coeffs:dft(sampled,Math.min(60,Math.floor((sampleCount-1)/2)))};
  }).sort((a,b)=>b.length-a.length);
}
function rebuildSamplesSmooth(){
  if(!state.rawContours.length)return;
  state.prevData=state.data;state.data=buildData(+ui.samples.value);
  state.transitionStart=performance.now();
  if(isPlaying())refreshAudioSmooth();
}

async function analyze(){
  const {family,weight,text}=await ensureFont();
  setStatus("analyzing");
  const out=rasterizeText(family,weight,text);
  if(!out.rings.length)throw appError("contourError");
  state.rawContours=out.rings;state.rasterMeta=out.meta;
  state.prevData=[];state.data=buildData(+ui.samples.value);state.transitionStart=0;
  state.analysisKey=`${text}\n${family}\n${weight}`;state.animT=0;
  setStatus("analysisReady",{family,weight,count:out.rings.length});
}

function resizeCanvas(canvas){
  const r=canvas.getBoundingClientRect(),dpr=Math.min(2,devicePixelRatio||1);
  const w=Math.max(1,Math.round(r.width*dpr)),h=Math.max(1,Math.round(r.height*dpr));
  if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h}
  return{w,h,dpr};
}
function fitTransform(w,h){
  const dpr=Math.min(2,devicePixelRatio||1);
  const reserve=(ui.showSeries.checked?(window.innerWidth<=720?132:166):16)*dpr;
  const usableH=Math.max(80,h-reserve);
  return{s:Math.min(w*.80,usableH*.80),ox:w/2,oy:usableH/2};
}
function P(p,tf){return{x:p.x*tf.s+tf.ox,y:p.y*tf.s+tf.oy}}
function drawPath(ctx,pts,tf,close=true){
  if(!pts.length)return;
  ctx.beginPath();pts.forEach((p,i)=>{const q=P(p,tf);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y)});
  if(close)ctx.closePath();ctx.stroke();
}
function drawDataReconstruction(ctx,data,tf,alpha=1){
  ctx.globalAlpha=alpha;
  for(const cd of data){
    ctx.beginPath();
    for(let i=0;i<=300;i++){
      const q=P(evalSeries(cd.coeffs,i/300),tf);i?ctx.lineTo(q.x,q.y):ctx.moveTo(q.x,q.y);
    }
    ctx.stroke();
  }
  ctx.globalAlpha=1;
}
function drawGlyphRaster(ctx,tf){
  if(!state.rasterMeta||!ui.showGlyph.checked)return;
  const m=state.rasterMeta;
  const a=P({x:(0-m.cx)/m.scale,y:(0-m.cy)/m.scale},tf);
  const b=P({x:(m.width-m.cx)/m.scale,y:(m.height-m.cy)/m.scale},tf);
  ctx.save();ctx.globalAlpha=.20;ctx.drawImage(ui.raster,a.x,a.y,b.x-a.x,b.y-a.y);ctx.restore();
}
function drawMain(){
  const {w,h}=resizeCanvas(ui.view),ctx=ui.view.getContext("2d");
  ctx.clearRect(0,0,w,h);ctx.fillStyle="#090c11";ctx.fillRect(0,0,w,h);
  if(!state.data.length){
    ctx.fillStyle="#66738b";ctx.textAlign="center";ctx.font=`${Math.max(14,w/55)}px system-ui`;
    ctx.fillText(t("emptyStage"),w/2,h/2);return;
  }
  const tf=fitTransform(w,h);drawGlyphRaster(ctx,tf);

  if(ui.showContour.checked){
    ctx.strokeStyle="#7dd3fc";ctx.lineWidth=Math.max(1,w/1000);ctx.globalAlpha=.68;
    for(const cd of state.data)drawPath(ctx,cd.sampled,tf,true);
    ctx.globalAlpha=1;
  }
  if(ui.showRecon.checked){
    ctx.strokeStyle="#c4b5fd";ctx.lineWidth=Math.max(1.35,w/760);
    let a=1;
    if(state.transitionStart){
      a=Math.min(1,(performance.now()-state.transitionStart)/260);
      if(a>=1){state.prevData=[];state.transitionStart=0}
    }
    if(state.prevData.length)drawDataReconstruction(ctx,state.prevData,tf,1-a);
    drawDataReconstruction(ctx,state.data,tf,a);
  }
  if(ui.showCycles.checked&&state.data[0]){
    const ds=ui.cycleTarget.value==="all"?state.data:state.data.slice(0,1);
    const thick=+ui.cycleThickness.value;
    ctx.strokeStyle="#94a3b8";ctx.lineWidth=Math.max(.8,w/1200)*thick;ctx.globalAlpha=.48;
    for(const cd of ds){
      const chain=epicycleChain(cd.coeffs,state.animT);
      for(const st of chain.steps){
        const c=P({x:st.x,y:st.y},tf),e=P({x:st.x2,y:st.y2},tf);
        ctx.beginPath();ctx.arc(c.x,c.y,st.r*tf.s,0,Math.PI*2);ctx.stroke();
        ctx.beginPath();ctx.moveTo(c.x,c.y);ctx.lineTo(e.x,e.y);ctx.stroke();
      }
    }
    ctx.globalAlpha=1;
    for(const cd of ds){
      const e=P(epicycleChain(cd.coeffs,state.animT).end,tf);
      ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(e.x,e.y,Math.max(2.5,2.3*thick),0,Math.PI*2);ctx.fill();
    }
  }
}

function aggregateSeries(){
  if(!state.data.length)return[];
  if(ui.cycleTarget.value==="largest")return state.data[0].coeffs.map(c=>({k:c.k,amp:c.amp}));
  const total=state.data.reduce((s,d)=>s+d.length,0)||1,byK=new Map();
  for(const cd of state.data){
    const w=cd.length/total;
    for(const c of cd.coeffs)byK.set(c.k,(byK.get(c.k)||0)+c.amp*w);
  }
  return[...byK].map(([k,amp])=>({k,amp})).sort((a,b)=>a.k-b.k);
}
function drawSeries(){
  ui.seriesPanel.style.display=ui.showSeries.checked?"block":"none";
  if(!ui.showSeries.checked)return;
  const {w,h}=resizeCanvas(ui.series),ctx=ui.series.getContext("2d");
  ctx.clearRect(0,0,w,h);
  const arr=aggregateSeries();
  ui.seriesCaption.textContent=t(ui.cycleTarget.value==="all"?"allContours":"largestContour");
  if(!arr.length)return;
  const maxAmp=Math.max(...arr.filter(d=>d.k!==0).map(d=>d.amp),1e-6),barW=w/arr.length;
  for(let i=0;i<arr.length;i++){
    const d=arr[i],active=coeffWeight(d.k,state.harmCurrent);
    const norm=Math.sqrt(Math.min(1,d.amp/maxAmp)),bh=Math.max(1,norm*(h-14));
    ctx.globalAlpha=.14+.86*active;ctx.fillStyle=active>.02?"#c4b5fd":"#6f7788";
    ctx.fillRect(i*barW+Math.max(.35,barW*.12),h-bh,Math.max(1,barW*.76),bh);
  }
  ctx.globalAlpha=1;
  const center=arr.findIndex(d=>d.k===0);
  if(center>=0){
    const x=(center+.5)*barW;
    ctx.strokeStyle="rgba(255,255,255,.38)";ctx.lineWidth=1;
    ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,h);ctx.stroke();
  }
}
function animate(now){
  const dt=Math.min(.05,(now-state.lastTime)/1000);state.lastTime=now;
  state.animT=(state.animT+dt*(+ui.speed.value))%1;
  state.harmCurrent+=(+ui.harm.value-state.harmCurrent)*(1-Math.pow(.001,dt));
  drawMain();drawSeries();requestAnimationFrame(animate);
}

function isPlaying(){return!!audio.src}
async function ensureAudio(){
  if(!audio.ctx)audio.ctx=new (window.AudioContext||window.webkitAudioContext)();
  await audio.ctx.resume();
}
function selectedAudioData(){return ui.audioTarget.value==="largest"?state.data.slice(0,1):state.data}
function audioHarmonicLimit(){
  const sr=audio.ctx?.sampleRate||48000;
  const f0=Math.max(1,+ui.freq.value);
  // Keep synthesis and loudness estimation on the same, alias-safe harmonic set.
  return Math.max(1,Math.min(60,+ui.harm.value,Math.floor((sr*0.46)/f0)));
}
function aggregateAudioCoeffs(){
  const ds=selectedAudioData();
  if(!ds.length)return new Map();
  const total=ds.reduce((s,d)=>s+d.length,0)||1;
  const map=new Map();
  const cutoff=audioHarmonicLimit();

  for(const cd of ds){
    const contourWeight=ui.audioTarget.value==="largest"?1:cd.length/total;
    for(const c of cd.coeffs){
      const spectralWeight=coeffWeight(c.k,cutoff);
      if(spectralWeight<=0)continue;
      const prev=map.get(c.k)||{re:0,im:0};
      prev.re+=c.re*contourWeight*spectralWeight;
      prev.im+=c.im*contourWeight*spectralWeight;
      map.set(c.k,prev);
    }
  }
  return map;
}

// Equal-loudness sensitivity: ISO 226:2003 parameters.
// Bark-rate approximation: Zwicker & Terhardt (1980).
// References and model notes: THIRD_PARTY_NOTICES.md.
const ISO226={
  f:[20,25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500],
  af:[0.532,0.506,0.480,0.455,0.432,0.409,0.387,0.367,0.349,0.330,0.315,0.301,0.288,0.276,0.267,0.259,0.253,0.250,0.246,0.244,0.243,0.243,0.243,0.242,0.242,0.245,0.254,0.271,0.301],
  Lu:[-31.6,-27.2,-23.0,-19.1,-15.9,-13.0,-10.3,-8.1,-6.2,-4.5,-3.1,-2.0,-1.1,-0.4,0.0,0.3,0.5,0.0,-2.7,-4.1,-1.0,1.7,2.5,1.2,-2.1,-7.1,-11.2,-10.7,-3.1],
  Tf:[78.5,68.7,59.5,51.1,44.0,37.5,31.5,26.5,22.1,17.9,14.4,11.4,8.6,6.2,4.4,3.0,2.2,2.4,3.5,1.7,-1.3,-4.2,-6.0,-5.4,-1.5,6.0,12.6,13.9,12.3]
};
const isoCurveCache=new Map();

function iso226Curve(phon){
  const key=String(phon);
  if(isoCurveCache.has(key))return isoCurveCache.get(key);
  const spl=ISO226.f.map((_,i)=>{
    const af=ISO226.af[i],Lu=ISO226.Lu[i],Tf=ISO226.Tf[i];
    const Af=4.47e-3*(Math.pow(10,0.025*phon)-1.15)
      +Math.pow(0.4*Math.pow(10,((Tf+Lu)/10)-9),af);
    return (10/af)*Math.log10(Af)-Lu+94;
  });
  const curve={f:ISO226.f,spl};
  isoCurveCache.set(key,curve);
  return curve;
}
function logInterp(xs,ys,x){
  if(x<=xs[0])return ys[0];
  if(x>=xs[xs.length-1])return ys[ys.length-1];
  const lx=Math.log(x);
  for(let i=0;i<xs.length-1;i++){
    if(x>=xs[i]&&x<=xs[i+1]){
      const a=Math.log(xs[i]),b=Math.log(xs[i+1]);
      const t=(lx-a)/(b-a);
      return ys[i]+(ys[i+1]-ys[i])*t;
    }
  }
  return ys[ys.length-1];
}
function equalLoudnessSensitivityPower(freq,phon){
  const curve=iso226Curve(phon);
  const ref=logInterp(curve.f,curve.spl,1000);
  const spl=logInterp(curve.f,curve.spl,Math.max(20,Math.min(12500,freq)));
  return Math.pow(10,-(spl-ref)/10);
}
function barkRate(freq){
  const f=Math.max(0,freq);
  return 13*Math.atan(0.00076*f)+3.5*Math.atan(Math.pow(f/7500,2));
}
function harmonicStereoPower(coeffs,k){
  const cp=coeffs.get(k)||{re:0,im:0};
  const cn=coeffs.get(-k)||{re:0,im:0};
  // Mean power across x/y stereo channels for harmonic ±k.
  return (cp.re*cp.re+cp.im*cp.im+cn.re*cn.re+cn.im*cn.im)/2;
}
function perceptualLoudnessScore(){
  const coeffs=aggregateAudioCoeffs();
  if(!coeffs.size)return 0;

  const f0=+ui.freq.value;
  const phon=+ui.loudnessPhon.value;
  const maxK=Math.floor(audioHarmonicLimit());
  const bands=new Float64Array(25);

  for(let k=1;k<=maxK;k++){
    const power=harmonicStereoPower(coeffs,k);
    if(power<=0)continue;
    const freq=k*f0;
    const weighted=power*equalLoudnessSensitivityPower(freq,phon);
    const b=Math.max(0,Math.min(24,Math.floor(barkRate(freq))));
    bands[b]+=weighted;
  }

  let maxBand=0;
  for(const p of bands)maxBand=Math.max(maxBand,p);
  if(maxBand<=1e-18)return 0;

  // Suppress numerically tiny partials, then use compressive loudness growth.
  // The exponent is intentionally close to Zwicker/Stevens-style loudness growth.
  const floor=maxBand*Math.pow(10,-48/10);
  const alpha=0.23;
  let score=0;
  for(const p of bands){
    if(p<=floor)continue;
    score+=Math.pow(p-floor,alpha);
  }
  return score;
}
function normalizationScale(){
  const current=perceptualLoudnessScore();
  if(!(current>1e-12))return 1;

  const alpha=0.23;
  const targetRms=Math.pow(10,(+ui.normalizeTarget.value)/20);

  // Reference is a 1 kHz stereo sine whose RMS equals the target.
  // At 1 kHz equal-loudness sensitivity is normalized to 1 and it occupies one Bark band.
  const targetScore=Math.pow(targetRms*targetRms,alpha);
  const scale=Math.pow(targetScore/current,1/(2*alpha));

  // The Bark-band loudness score is intentionally relative rather than SPL-calibrated.
  // A fixed perceptual calibration restores a practical browser playback level
  // without changing the relative leveling between different glyph spectra.
  const calibration=Math.pow(10,10/20); // +10 dB global calibration
  return Math.max(0.01,Math.min(80,scale*calibration));
}
function buildAudioCycle(len=4096){
  const L=new Float32Array(len),R=new Float32Array(len),ds=selectedAudioData();
  if(!ds.length)return{L,R};
  const total=ds.reduce((s,d)=>s+d.length,0)||1;
  const cutoff=audioHarmonicLimit();

  for(let i=0;i<len;i++){
    const t=i/len;let x=0,y=0;
    for(const cd of ds){
      const w=ui.audioTarget.value==="largest"?1:cd.length/total;
      const p=evalSeries(cd.coeffs,t,cutoff);
      x+=p.x*w;y+=p.y*w;
    }
    L[i]=x;R[i]=y;
  }

  let meanL=0,meanR=0;
  for(let i=0;i<len;i++){meanL+=L[i];meanR+=R[i]}
  meanL/=len;meanR/=len;

  let peak=1e-9;
  for(let i=0;i<len;i++){
    L[i]-=meanL;R[i]-=meanR;
    peak=Math.max(peak,Math.abs(L[i]),Math.abs(R[i]));
  }

  let scale=normalizationScale();

  // Limit only when the FINAL output (after the user's output gain) could clip.
  // This avoids crest-factor differences undoing the perceptual normalization.
  const outGain=Math.max(.0001,+ui.gain.value);
  if(peak*scale*outGain>.97)scale=.97/(peak*outGain);

  for(let i=0;i<len;i++){L[i]*=scale;R[i]*=scale}
  return{L,R};
}
function outputGainValue(){
  return Math.max(0,+ui.gain.value);
}
function updatePlayMode(){
  ui.playMode.textContent=`${ui.freq.value} Hz / EL ${ui.loudnessPhon.value} phon`;
}
function clearStopTimer(){if(audio.stopTimer){clearTimeout(audio.stopTimer);audio.stopTimer=null}}
function scheduleAutoStop(){
  clearStopTimer();
  if(!isPlaying()||!ui.autoStop.checked)return;
  const ms=(+ui.autoStopSeconds.value)*1000;
  audio.stopTimer=setTimeout(()=>stopAudio(.16),Math.max(80,ms-150));
}
function stopAudio(fade=.09){
  clearStopTimer();
  if(!audio.src)return;
  const src=audio.src,g=audio.gain,ctx=audio.ctx;
  audio.src=null;audio.gain=null;
  try{
    const now=ctx.currentTime;
    g.gain.cancelScheduledValues(now);
    g.gain.setValueAtTime(Math.max(.0001,g.gain.value),now);
    g.gain.exponentialRampToValueAtTime(.0001,now+fade);
    src.stop(now+fade+.02);
  }catch{}
  ui.mainAction.textContent=t("play");
  if(!state.busy)setStatus("stopped");
}
async function playAudio(){
  await ensureAudio();clearStopTimer();
  const len=4096,{L,R}=buildAudioCycle(len);
  const buf=audio.ctx.createBuffer(2,len,audio.ctx.sampleRate);
  buf.copyToChannel(L,0);buf.copyToChannel(R,1);

  const src=audio.ctx.createBufferSource();src.buffer=buf;src.loop=true;
  src.playbackRate.value=(+ui.freq.value)*len/audio.ctx.sampleRate;

  const gain=audio.ctx.createGain(),now=audio.ctx.currentTime,target=outputGainValue();
  gain.gain.setValueAtTime(.0001,now);gain.gain.linearRampToValueAtTime(target,now+.035);
  src.connect(gain).connect(audio.ctx.destination);src.start();
  audio.src=src;audio.gain=gain;
  ui.mainAction.textContent=t("stop");updatePlayMode();
  setStatus("playing",{phon:ui.loudnessPhon.value});
  scheduleAutoStop();
}
async function refreshAudioSmooth(){
  if(!isPlaying())return;
  const oldSrc=audio.src,oldGain=audio.gain;
  const len=4096,{L,R}=buildAudioCycle(len);
  const buf=audio.ctx.createBuffer(2,len,audio.ctx.sampleRate);
  buf.copyToChannel(L,0);buf.copyToChannel(R,1);

  const src=audio.ctx.createBufferSource();src.buffer=buf;src.loop=true;
  src.playbackRate.value=(+ui.freq.value)*len/audio.ctx.sampleRate;
  const g=audio.ctx.createGain(),now=audio.ctx.currentTime,target=outputGainValue();
  g.gain.setValueAtTime(.0001,now);g.gain.linearRampToValueAtTime(target,now+.07);
  src.connect(g).connect(audio.ctx.destination);src.start();

  try{
    oldGain.gain.cancelScheduledValues(now);
    oldGain.gain.setValueAtTime(Math.max(.0001,oldGain.gain.value),now);
    oldGain.gain.exponentialRampToValueAtTime(.0001,now+.07);
    oldSrc.stop(now+.09);
  }catch{}
  audio.src=src;audio.gain=g;updatePlayMode();
}
async function mainAction(){
  if(state.busy)return;
  if(isPlaying()){stopAudio();return}
  state.busy=true;ui.mainAction.disabled=true;
  try{
    await ensureContours();
    await ensureAudio();
    if(state.analysisKey!==currentKey()||!state.data.length)await analyze();
    await playAudio();
  }catch(e){
    console.error(e);reportError(e);
  }finally{
    state.busy=false;ui.mainAction.disabled=false;
    if(!isPlaying())ui.mainAction.textContent=t("play");
  }
}
function invalidateAnalysis(message){
  if(isPlaying())stopAudio();
  state.analysisKey="";
  state.fontNotice=null;
  setStatus(message||"changed");
}

ui.mainAction.addEventListener("click",mainAction);
ui.text.addEventListener("keydown",e=>{if(e.key==="Enter")mainAction()});
ui.customFont.addEventListener("keydown",e=>{if(e.key==="Enter")ui.addFont.click()});
for(const el of [ui.text,ui.fontPreset,ui.weight])el.addEventListener("input",()=>invalidateAnalysis());

ui.harm.addEventListener("input",()=>{
  ui.harmVal.textContent=Math.round(+ui.harm.value);
  if(isPlaying()){clearTimeout(ui.harm._t);ui.harm._t=setTimeout(refreshAudioSmooth,65)}
});
ui.samples.addEventListener("input",()=>{
  ui.sampleVal.textContent=Math.round(+ui.samples.value);
  if(!state.rawContours.length)return;
  clearTimeout(state.sampleTimer);state.sampleTimer=setTimeout(rebuildSamplesSmooth,110);
});
ui.speed.addEventListener("input",()=>ui.speedVal.textContent=(+ui.speed.value).toFixed(2));
ui.freq.addEventListener("input",()=>{
  ui.freqVal.textContent=`${ui.freq.value} Hz`;updatePlayMode();
  if(isPlaying()){clearTimeout(ui.freq._t);ui.freq._t=setTimeout(refreshAudioSmooth,70)}
});
ui.gain.addEventListener("input",()=>{
  ui.gainVal.textContent=(+ui.gain.value).toFixed(2);
  if(isPlaying()){clearTimeout(ui.gain._t);ui.gain._t=setTimeout(refreshAudioSmooth,70)}
});
function updateNormalizeUi(){
  ui.normalizeVal.textContent=t("dbfs",{value:ui.normalizeTarget.value.replace("-","−")});
  updatePlayMode();
}
for(const el of [ui.audioTarget,ui.normalizeTarget,ui.loudnessPhon]){
  el.addEventListener("input",()=>{
    updateNormalizeUi();
    if(isPlaying()){clearTimeout(el._t);el._t=setTimeout(refreshAudioSmooth,70)}
  });
}
function updateAutoStopUi(){
  const value=(+ui.autoStopSeconds.value).toFixed(1);
  ui.autoStopSecondsVal.textContent=t("secondsSpaced",{value});
  ui.autoStopLabel.textContent=ui.autoStop.checked?t("seconds",{value}):t("off");
}
ui.autoStop.addEventListener("change",()=>{updateAutoStopUi();scheduleAutoStop()});
ui.autoStopSeconds.addEventListener("input",()=>{updateAutoStopUi();scheduleAutoStop()});
ui.showSeries.addEventListener("change",()=>{ui.seriesPanel.style.display=ui.showSeries.checked?"block":"none"});

loadCustomFonts();
ui.text.value=browserLanguage==="ja"?"あ":"A";
ui.fontPreset.value=browserLanguage==="ja"?"Noto Sans JP":"Roboto";
ui.harmVal.textContent=Math.round(+ui.harm.value);
ui.sampleVal.textContent=Math.round(+ui.samples.value);
ui.speedVal.textContent=(+ui.speed.value).toFixed(2);
ui.freqVal.textContent=`${ui.freq.value} Hz`;
ui.gainVal.textContent=(+ui.gain.value).toFixed(2);
setLanguage(browserLanguage);
requestAnimationFrame(animate);

// Initial visualization never creates or resumes an AudioContext.
async function initialize(){
  state.busy=true;ui.mainAction.disabled=true;
  try{await ensureContours();await analyze()}
  catch(e){console.error(e);reportError(e)}
  finally{state.busy=false;ui.mainAction.disabled=false}
}
initialize();
})();

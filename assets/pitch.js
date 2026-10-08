(() => {
const {t}=window.FontFourierI18n;
const colors=['#88cbbd','#d6b779','#b7a3d4','#d69da5','#8db4d5','#b6c88b'];

function connectPitchCurve(ctx,src,curve,time,now){
  src.detune.value=curve.offset*100;
  if(!curve.depth)return null;
  const buffer=ctx.createBuffer(1,curve.values.length,ctx.sampleRate);
  buffer.copyToChannel(curve.values,0);
  const source=ctx.createBufferSource(),depth=ctx.createGain();
  source.buffer=buffer;source.loop=true;
  source.playbackRate.value=curve.rate*buffer.duration;
  depth.gain.value=curve.depth*100;source.connect(depth).connect(src.detune);
  const phase=((time*curve.rate+curve.phase/360)%1+1)%1;
  source.start(now,phase*buffer.duration);
  return {source,depth};
}

class PitchCurves {
  constructor({onChange,onPlay,getTime,isPlaying,isBusy,getFrequency,setFrequency,getSignals,getRate,setRate,getMode,setMode,getMaximumFrequency}){
    Object.assign(this,{onChange,onPlay,getTime,isPlaying,isBusy,getFrequency,setFrequency,getSignals,getRate,setRate,getMode,setMode,getMaximumFrequency});
    this.settings={depth:7,phase:0,spacing:0};
    this.lastUpdate=0;
    this.ui=Object.fromEntries(['Btn','Overlay','Glyph','Base','Depth','Rate','Phase','Spacing','Rows','Play','AxisLabel','Period','Graph','Position'].map(key=>[key,document.querySelector('#pitch'+key)]));
    this.view=document.querySelector('#view');this.stage=this.view.parentElement;
    this.stage.append(this.ui.Overlay);
    this.ui.Close=document.querySelector('#closePitch');
    this.ui.Btn.addEventListener('click',()=>this.open());
    this.ui.Close.addEventListener('click',()=>this.close());
    this.ui.Overlay.addEventListener('click',e=>{if(e.target===this.ui.Overlay)this.close()});
    document.addEventListener('keydown',e=>{
      if(e.key==='Escape'&&this.isOpen()&&!document.body.matches('.settingsOpen,.aboutOpen'))this.close();
    });
    for(const key of ['depth','phase','spacing']){
      const el=this.ui[key[0].toUpperCase()+key.slice(1)];
      el.addEventListener('input',()=>{
        if(!el.value||!Number.isFinite(el.valueAsNumber))return;
        const value=Math.max(+el.min,Math.min(+el.max,el.valueAsNumber));
        this.settings[key]=value;
        this.updateLabels();this.onChange();
      });
      el.addEventListener('change',()=>{el.value=this.settings[key]});
    }
    this.ui.Rate.addEventListener('input',()=>{
      if(!this.ui.Rate.value||!Number.isFinite(this.ui.Rate.valueAsNumber))return;
      this.setRate(Math.max(.02,Math.min(.5,this.ui.Rate.valueAsNumber)));
    });
    this.ui.Rate.addEventListener('change',()=>{this.ui.Rate.value=this.getRate()});
    this.ui.Base.addEventListener('input',()=>{
      if(!this.ui.Base.value||!Number.isFinite(this.ui.Base.valueAsNumber))return;
      this.setFrequency(Math.round(Math.max(40,Math.min(880,this.ui.Base.valueAsNumber))));
    });
    this.ui.Base.addEventListener('change',()=>{this.ui.Base.value=this.getFrequency()});
    this.ui.Play.addEventListener('click',()=>{
      this.onPlay();
    });
    this.renderRows();
  }
  get enabled(){return this.getMode()==='pitch'}
  color(index){return colors[index%colors.length]}
  spacing(count){
    const headroom=Math.max(0,12*Math.log2(this.getMaximumFrequency()/this.getFrequency())-this.settings.depth);
    return count>1?Math.min(this.settings.spacing,headroom*2/(count-1)):0;
  }
  curves(){
    const {depth,phase}=this.settings,signals=this.getSignals(),spacing=this.spacing(signals.length);
    return signals.map((values,i)=>({values,depth,rate:this.getRate(),phase,offset:spacing?(i-(signals.length-1)/2)*spacing:0}));
  }
  activeCurves(){return this.enabled?this.curves():[{offset:0,depth:0,rate:0,phase:0}]}
  phase(time){return ((time*this.getRate()+this.settings.phase/360)%1+1)%1}
  value(curve,time){
    return this.valueAtPhase(curve,time*curve.rate+curve.phase/360);
  }
  valueAtPhase(curve,phase){
    const x=((phase%1+1)%1)*curve.values.length;
    const index=Math.floor(x),fraction=x-index;
    return curve.offset+curve.depth*((1-fraction)*curve.values[index]+fraction*curve.values[(index+1)%curve.values.length]);
  }
  isOpen(){return document.body.classList.contains('pitchOpen')}
  open(){
    if(this.isOpen())return;
    this.modeBeforeOpen=this.getMode();
    if(!this.enabled)this.setMode('pitch');
    document.body.classList.add('pitchOpen');this.ui.Overlay.inert=false;
    this.ui.Overlay.setAttribute('aria-hidden','false');
    this.ui.Glyph.append(this.view);
    this.ui.Close.focus();this.updateLabels();this.draw();
  }
  close({restoreMode=true}={}){
    if(!this.isOpen())return;
    document.body.classList.remove('pitchOpen');this.ui.Overlay.inert=true;
    this.ui.Overlay.setAttribute('aria-hidden','true');
    this.stage.prepend(this.view);
    if(restoreMode&&this.getMode()!==this.modeBeforeOpen)this.setMode(this.modeBeforeOpen);
    this.ui.Btn.focus();
  }
  renderRows(){
    this.ui.Rows.replaceChildren();
    for(let i=0;i<this.getSignals().length;i++){
      const row=document.createElement('div');row.className='pitchRow';
      row.style.setProperty('--curve-color',this.color(i));
      const name=document.createElement('strong');name.className='pitchRowName';
      const formula=document.createElement('div');formula.className='pitchFormula';
      const value=document.createElement('output');value.className='pitchReadout';
      row.append(name,formula,value);this.ui.Rows.append(row);
    }
  }
  updateLabels(){
    const curves=this.curves();
    if(this.ui.Rows.children.length!==curves.length)this.renderRows();
    [...this.ui.Rows.children].forEach((row,i)=>{
      const curve=curves[i];
      row.querySelector('strong').textContent=t('pitchCurve',{number:i+1});
      row.querySelector('.pitchFormula').textContent=`p${i+1}(t) = ${+curve.offset.toFixed(2)} + ${curve.depth} · F${i+1}(τ)\nτ = ${curve.rate}t + ${curve.phase/360}`;
    });
    this.ui.AxisLabel.textContent=t('pitchAxis',{frequency:this.getFrequency()});
    if(document.activeElement!==this.ui.Rate)this.ui.Rate.value=this.getRate();
    if(document.activeElement!==this.ui.Base)this.ui.Base.value=this.getFrequency();
    this.ui.Period.textContent=t('pitchPeriod',{value:+(1/this.getRate()).toFixed(2)});
    this.ui.Position.textContent=t('pitchPosition',{value:this.phase(this.getTime()).toFixed(2)});
    this.updateTransport();
  }
  updateTransport(){
    this.ui.Play.textContent=t(this.isPlaying()?'stop':'pitchPlay');
    this.ui.Play.disabled=this.isBusy()&&!this.isPlaying();
  }
  tick(now){
    if(!this.isOpen())return;
    this.draw();
    if(now-this.lastUpdate<100)return;
    this.lastUpdate=now;const time=this.getTime();
    const curves=this.curves();
    if(curves.length!==this.ui.Rows.children.length)this.updateLabels();
    this.ui.Position.textContent=t('pitchPosition',{value:this.phase(time).toFixed(2)});
    [...this.ui.Rows.children].forEach((row,i)=>{
      const f=this.getFrequency()*2**(this.value(curves[i],time)/12);
      row.querySelector('output').textContent=`${f.toFixed(1)} Hz`;
    });
    this.updateTransport();
  }
  draw(){
    const canvas=this.ui.Graph,rect=canvas.getBoundingClientRect(),dpr=window.devicePixelRatio||1;
    if(!rect.width||!rect.height)return;
    const width=Math.round(rect.width*dpr),height=Math.round(rect.height*dpr);
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height}
    const ctx=canvas.getContext('2d');ctx.setTransform(dpr,0,0,dpr,0,0);
    const w=rect.width,h=rect.height,left=38,right=w-12,top=12,bottom=h-28;
    if(right<=left||bottom<=top)return;
    ctx.clearRect(0,0,w,h);ctx.fillStyle='#0b1018';ctx.fillRect(0,0,w,h);
    const curves=this.curves(),time=this.getTime(),phase=this.phase(time);
    const {depth}=this.settings;
    const bound=Math.max(12,Math.ceil((depth+Math.max(0,curves.length-1)*this.spacing(curves.length)/2+3)/6)*6);
    const x=phase=>left+phase*(right-left),y=p=>bottom-(p+bound)/(bound*2)*(bottom-top);
    ctx.font='11px system-ui';ctx.textBaseline='middle';
    const pitchStep=bottom-top<120?bound:bound>30?12:6;
    for(let p=-bound;p<=bound;p+=pitchStep){
      ctx.strokeStyle=p===0?'#536072':'#253041';ctx.lineWidth=1;
      ctx.beginPath();ctx.moveTo(left,y(p));ctx.lineTo(right,y(p));ctx.stroke();
      ctx.fillStyle='#9ba7bd';ctx.textAlign='right';ctx.fillText(String(p),left-7,y(p));
    }
    const divisions=right-left<420?4:8;
    for(let i=0;i<=divisions;i++){
      const position=i/divisions;
      ctx.strokeStyle='#253041';ctx.beginPath();ctx.moveTo(x(position),top);ctx.lineTo(x(position),bottom);ctx.stroke();
      ctx.fillStyle='#9ba7bd';ctx.textAlign='center';ctx.fillText(String(position),x(position),bottom+16);
    }
    ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
    curves.forEach((curve,i)=>{
      ctx.strokeStyle=this.color(i);ctx.lineWidth=2;ctx.beginPath();
      const segments=Math.ceil(right-left);
      for(let j=0;j<=segments;j++){
        const position=j/segments;
        j?ctx.lineTo(x(position),y(this.valueAtPhase(curve,position))):ctx.moveTo(x(position),y(this.valueAtPhase(curve,position)));
      }
      ctx.stroke();
    });
    if(this.enabled){
      ctx.strokeStyle='#d7dfed';ctx.lineWidth=1;ctx.setLineDash([4,4]);
      ctx.beginPath();ctx.moveTo(x(phase),top);ctx.lineTo(x(phase),bottom);ctx.stroke();ctx.setLineDash([]);
      curves.forEach((curve,i)=>{
        ctx.fillStyle=this.color(i);ctx.beginPath();ctx.arc(x(phase),y(this.value(curve,time)),4,0,Math.PI*2);ctx.fill();
      });
    }
    ctx.restore();
  }
}
window.FontFourierPitch={PitchCurves,connectPitchCurve};
})();

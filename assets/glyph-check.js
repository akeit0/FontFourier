(() => {
let ready,key='',active=[];
const probeNames=['FontFourierProbeA','FontFourierProbeB'];
function cssFamily(family){return /^(?:serif|sans-serif|system-ui)$/.test(family)?family:JSON.stringify(family)}
function checksum(bytes){
  let sum=0;
  for(let i=0;i<bytes.length;i+=4)sum=(sum+((bytes[i]||0)*2**24+(bytes[i+1]||0)*2**16+(bytes[i+2]||0)*256+(bytes[i+3]||0)))>>>0;
  return sum;
}
// cmap format 12 maps each requested character to the probe's single visible glyph.
function withCharacters(bytes,characters){
  const codes=[...new Set(characters.map(character=>character.codePointAt(0)))].sort((a,b)=>a-b);
  const cmap=new Uint8Array(28+codes.length*12),cv=new DataView(cmap.buffer);
  cv.setUint16(2,1);cv.setUint16(4,3);cv.setUint16(6,10);cv.setUint32(8,12);
  cv.setUint16(12,12);cv.setUint32(16,cmap.length-12);cv.setUint32(24,codes.length);
  codes.forEach((code,i)=>{const p=28+i*12;cv.setUint32(p,code);cv.setUint32(p+4,code);cv.setUint32(p+8,1)});
  const source=new DataView(bytes.buffer),count=source.getUint16(4),tables=[];
  let size=12+16*count;
  for(let i=0;i<count;i++){
    const entry=12+16*i,tag=source.getUint32(entry),offset=source.getUint32(entry+8),length=source.getUint32(entry+12);
    const data=tag===0x636d6170?cmap:bytes.slice(offset,offset+length);
    if(tag===0x68656164)data.fill(0,8,12);
    tables.push({tag,data,offset:size});size+=Math.ceil(data.length/4)*4;
  }
  const result=new Uint8Array(size),view=new DataView(result.buffer);result.set(bytes.subarray(0,12));
  let head;
  tables.forEach(({tag,data,offset},i)=>{
    const entry=12+16*i;
    view.setUint32(entry,tag);view.setUint32(entry+4,checksum(data));
    view.setUint32(entry+8,offset);view.setUint32(entry+12,data.length);result.set(data,offset);
    if(tag===0x68656164)head=offset;
  });
  view.setUint32(head+8,(0xb1b0afba-checksum(result))>>>0);
  return result;
}
function prepare(text){
  const characters=visibleCharacters(text),next=characters.slice().sort().join('');
  if(!characters.length)return Promise.resolve();
  if(!ready||next!==key){
    key=next;for(const face of active)document.fonts.delete(face);active=[];
    ready=Promise.all(window.FontFourierGlyphProbes.map(async (data,index)=>{
    const bytes=Uint8Array.from(atob(data),character=>character.charCodeAt(0));
    const face=await new FontFace(probeNames[index],withCharacters(bytes,characters)).load();
    document.fonts.add(face);active.push(face);
    })).catch(error=>{ready=null;throw error});
  }
  return ready;
}
function visibleCharacters(text){
  return [...new Set([...text].filter(character=>!/[\p{White_Space}\p{Default_Ignorable_Code_Point}]/u.test(character)))];
}
async function missing(families,weight,text){
  await prepare(text);
  const canvas=document.createElement('canvas');canvas.width=canvas.height=192;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  const stack=families.map(cssFamily).join(',');
  function pixels(character,probe){
    ctx.clearRect(0,0,192,192);ctx.fillStyle='#fff';
    ctx.font=`${weight} 96px ${stack},"${probe}"`;ctx.fillText(character,40,130);
    return ctx.getImageData(0,0,192,192).data;
  }
  return visibleCharacters(text).filter(character=>{
    const first=pixels(character,probeNames[0]),second=pixels(character,probeNames[1]);
    for(let i=3;i<first.length;i+=4)if(first[i]!==second[i])return true;
    return false;
  });
}
window.FontFourierGlyphCheck={missing,cssFamily};
})();

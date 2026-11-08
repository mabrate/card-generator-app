// Small, bounded photo corrections. Every render starts from the source pixels.
export const PHOTO_LIMITS={exposure:.25,contrast:10,whites:6,highlights:6,vibrance:10,saturation:8,warmth:6,tint:6};
export const CURVE_LIMITS={light:.04,red:.025,green:.025,blue:.025};
const clamp=(v,min,max)=>Math.max(min,Math.min(max,v));
const finite=v=>Number.isFinite(v)?v:0;
export function photoSettings(value={}){
  const result={};
  for(const [key,max] of Object.entries(PHOTO_LIMITS))result[key]=clamp(finite(value?.[key]),-max,max);
  result.curves={};
  for(const [key,max] of Object.entries(CURVE_LIMITS))result.curves[key]=Array.from({length:3},(_,i)=>clamp(finite(value?.curves?.[key]?.[i]),-max,max));
  return result;
}

// Monotone cubic interpolation: fixed endpoints, no inversions or overshoot.
export function curveTable(offsets){
  const y=[0,...offsets.map((v,i)=>(i+1)/4+v),1],d=y.slice(1).map((v,i)=>(v-y[i])*4);
  const slopes=[d[0],...d.slice(1).map((v,i)=>d[i]*v<=0?0:2*d[i]*v/(d[i]+v)),d[3]];
  return Float32Array.from({length:1025},(_,i)=>{
    const x=i/1024,segment=Math.min(3,Math.floor(x*4)),t=x*4-segment,t2=t*t,t3=t2*t;
    return (2*t3-3*t2+1)*y[segment]+(t3-2*t2+t)*slopes[segment]/4+(-2*t3+3*t2)*y[segment+1]+(t3-t2)*slopes[segment+1]/4;
  });
}
const lookup=(table,x)=>{const n=clamp(x,0,1)*1024,i=Math.min(1023,Math.floor(n));return table[i]+(table[i+1]-table[i])*(n-i);};
const luminance=(r,g,b)=>.2126*r+.7152*g+.0722*b;
export function photoTransform(value){
  const s=photoSettings(value),tables=Object.fromEntries(Object.entries(s.curves).map(([key,values])=>[key,curveTable(values)]));
  const warmth=s.warmth/100,tint=s.tint/100;
  const gainR=1+clamp(warmth+tint/2,-.06,.06),gainG=1-clamp(tint,-.06,.06),gainB=1+clamp(-warmth+tint/2,-.06,.06);
  const exposure=2**s.exposure;
  return (data,start=0,end=data.length)=>{
    for(let i=start;i<end;i+=4){
      if(!data[i+3])continue;
      const originalR=data[i]/255,originalG=data[i+1]/255,originalB=data[i+2]/255;
      let r=originalR*gainR,g=originalG*gainG,b=originalB*gainB;
      const before=luminance(r,g,b),x=clamp(before,0,1);
      let light=x*exposure/(1+x*(exposure-1));
      light+=s.contrast/100*(light-.5)*4*light*(1-light);
      light+=(s.whites/100*light**3+s.highlights/100*light**2)*4*(1-light);
      light=lookup(tables.light,light);
      // Scale toward the new luminance, preserving hue. Compress chroma to fit the gamut.
      const ratio=before>1e-8?light/before:0;r*=ratio;g*=ratio;b*=ratio;
      const spread=Math.max(r,g,b)-Math.min(r,g,b);
      const saturation=clamp(1+s.saturation/100+s.vibrance/100*(1-clamp(spread,0,1)),.88,1.12);
      const cr=(r-light)*saturation,cg=(g-light)*saturation,cb=(b-light)*saturation;
      let gamut=1;
      if(cr>0)gamut=Math.min(gamut,(1-light)/cr);else if(cr<0)gamut=Math.min(gamut,-light/cr);
      if(cg>0)gamut=Math.min(gamut,(1-light)/cg);else if(cg<0)gamut=Math.min(gamut,-light/cg);
      if(cb>0)gamut=Math.min(gamut,(1-light)/cb);else if(cb<0)gamut=Math.min(gamut,-light/cb);
      const correctedR=lookup(tables.red,light+cr*gamut),correctedG=lookup(tables.green,light+cg*gamut),correctedB=lookup(tables.blue,light+cb*gamut);
      // A shared strength limit preserves the correction direction even with all controls combined.
      const change=Math.max(Math.abs(correctedR-originalR),Math.abs(correctedG-originalG),Math.abs(correctedB-originalB)),strength=change>.1?.1/change:1;
      data[i]=(originalR+(correctedR-originalR)*strength)*255;
      data[i+1]=(originalG+(correctedG-originalG)*strength)*255;
      data[i+2]=(originalB+(correctedB-originalB)*strength)*255;
    }
    return data;
  };
}

export function samplePaper(data,width,height,x,y){
  const sum=[0,0,0];let count=0;
  for(let py=Math.max(0,y-3);py<=Math.min(height-1,y+3);py++)for(let px=Math.max(0,x-3);px<=Math.min(width-1,x+3);px++){
    const i=(py*width+px)*4;if(data[i+3]<250)continue;
    for(let c=0;c<3;c++)sum[c]+=data[i+c]/255;count++;
  }
  const rgb=sum.map(v=>v/Math.max(1,count)),light=luminance(...rgb);
  if(!count || light<.45 || Math.max(...rgb)-Math.min(...rgb)>.18 || Math.min(...rgb)>.985)throw Error('Choose a blank, uncolored area of white paper, away from glare and deep shadow.');
  const [r,g,b]=rgb,average=(r+g+b)/3,rawWarmth=(average/r-average/b)*50,rawTint=(1-average/g)*100;
  return {warmth:clamp(rawWarmth,-6,6),tint:clamp(rawTint,-6,6),limited:Math.abs(rawWarmth)>6 || Math.abs(rawTint)>6};
}

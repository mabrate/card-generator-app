import assert from 'node:assert/strict';
import {PHOTO_LIMITS,CURVE_LIMITS,photoSettings,photoTransform,curveTable,samplePaper} from '../static-app/photo-color.js';

const source=new Uint8ClampedArray(4*4096);
let seed=381;for(let i=0;i<source.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;source[i]=seed>>>24;}
const identity=source.slice();photoTransform({})(identity);assert.deepEqual(identity,source,'neutral adjustments are pixel-identical, including alpha');
for(let combination=0;combination<256;combination++){
  const settings=Object.fromEntries(Object.keys(PHOTO_LIMITS).map((key,i)=>[key,(combination&(1<<i)?1:-1)*1e6]));settings.curves={};
  for(const [key,limit] of Object.entries(CURVE_LIMITS)){
    settings.curves[key]=Array.from({length:3},(_,i)=>(combination&(1<<i)?1:-1)*limit);
    const table=curveTable(settings.curves[key]);assert.equal(table[0],0);assert.equal(table.at(-1),1);
    for(let i=1;i<table.length;i++)assert.ok(table[i]>=table[i-1],'bounded curves cannot invert or overshoot');
  }
  const output=source.slice();photoTransform(settings)(output);
  for(let i=0;i<output.length;i++){
    if(i%4===3 || source[i-i%4+3]===0)assert.equal(output[i],source[i],'alpha and transparent pixels stay unchanged');
    else assert.ok(Math.abs(output[i]-source[i])<=26,'combined corrections stay within 10 percent plus rounding');
  }
}
const clamped=photoSettings({exposure:500,contrast:-500,warmth:NaN,curves:{light:[100,-100,Infinity]}});
assert.equal(clamped.exposure,.25);assert.equal(clamped.contrast,-10);assert.equal(clamped.warmth,0);assert.deepEqual(clamped.curves.light,[.04,-.04,0]);
const bright=new Uint8ClampedArray([80,120,160,255]);photoTransform({curves:{light:[0,.04,0]}})(bright);
assert.ok(bright[0]>80);assert.ok(Math.abs(bright[0]/bright[1]-80/120)<.012);assert.ok(Math.abs(bright[1]/bright[2]-120/160)<.012,'brightness curves preserve hue');
const patch=(r,g,b,a=255)=>new Uint8ClampedArray(Array.from({length:49},()=>[r,g,b,a]).flat());
const warm=samplePaper(patch(232,223,214),7,7,3,3);assert.ok(warm.warmth<0,'warm paper calls for cooling');assert.ok(warm.warmth>=-6);
const neutral=samplePaper(patch(225,225,225),7,7,3,3);assert.equal(neutral.warmth,0);assert.equal(neutral.tint,0);
for(const rgba of [[230,40,20],[30,30,30],[255,255,255],[220,220,220,0]])assert.throws(()=>samplePaper(patch(...rgba),7,7,3,3),/blank, uncolored/);
const mixed=patch(225,225,225);mixed.set([190,190,190,255],24*4);assert.ok(Math.abs(samplePaper(mixed,7,7,3,3).warmth)<.001,'sampling averages a patch rather than a single pencil speck');
console.log('PASS: identity/alpha, all 256 combined limit combinations, monotone bounded curves, settings clamps, hue-preserving brightness curves, averaged white-paper balance and invalid-sample guards.');

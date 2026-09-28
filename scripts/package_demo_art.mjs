// Copy generated artwork unchanged; set PNG physical-size metadata only.
// Pixel data is not resized, redrawn, cropped, or recompressed.
import fs from 'node:fs';
import path from 'node:path';
const root=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(fs.readFileSync(path.join(root,'demo/v2/graphics/prompts.json'),'utf8'));
function crc32(b){let c=0xffffffff;for(const byte of b){c^=byte;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0;}
const requested=new Set(process.argv.slice(2));
for(const item of manifest.assets){
 if(requested.size && !requested.has(item.slug))continue;
 const source=fs.readFileSync(item.source),width=source.readUInt32BE(16),height=source.readUInt32BE(20);
 const physical=Buffer.alloc(21);physical.writeUInt32BE(9);physical.write('pHYs',4);physical.writeUInt32BE(Math.round(width/(2.13*0.0254)),8);physical.writeUInt32BE(Math.round(height/(1.48*0.0254)),12);physical[16]=1;physical.writeUInt32BE(crc32(physical.subarray(4,17)),17);
 const chunks=[source.subarray(0,8)];let offset=8;
 while(offset<source.length){const length=source.readUInt32BE(offset),type=source.toString('ascii',offset+4,offset+8);if(type!=='pHYs')chunks.push(source.subarray(offset,offset+length+12));if(type==='IHDR')chunks.push(physical);offset+=length+12;}
 const destination=path.join(root,'demo/v2/graphics',item.slug+'.png');fs.writeFileSync(destination,Buffer.concat(chunks));console.log(item.slug,width,height,'2.13 × 1.48 inches');
}


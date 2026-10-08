"""Copy built-in generated artwork, add print metadata, and embed SVG wrappers.

Pixel data is preserved byte-for-byte: only the PNG pHYs metadata is changed.
Source JSON entries contain slug, prompt, and the generated local source path.
"""
import argparse
import base64
import json
import struct
import zlib
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PACK = ROOT / 'static-app/projects/houston-foundation-garden'

def png_chunk(kind, data):
 return struct.pack('>I',len(data))+kind+data+struct.pack('>I',zlib.crc32(kind+data)&0xffffffff)

def sized_png(data):
 assert data[:8] == b'\x89PNG\r\n\x1a\n'
 width, height = struct.unpack('>II',data[16:24])
 chunks=[]; offset=8
 while offset < len(data):
  size=struct.unpack('>I',data[offset:offset+4])[0]
  kind=data[offset+4:offset+8]
  if kind != b'pHYs':
   chunks.append(data[offset:offset+size+12])
  if kind == b'IHDR':
   chunks.append(png_chunk(b'pHYs',struct.pack('>IIB',round(width/.054),round(height/.034),1)))
  offset += size+12
 return data[:8]+b''.join(chunks), width, height

def package(entries):
 destination=PACK/'graphics'
 provenance_path=destination/'prompts.json'
 provenance=json.loads(provenance_path.read_text()) if provenance_path.exists() else {
  'version':1,'projectId':'houston-foundation-garden','generator':'built-in image_gen.imagegen',
  'generatedAt':'2026-10-07','style':'Scientific botanical watercolor with ecological action',
  'artworkSizeMm':{'width':54,'height':34},'pixelProcessing':'None. PNG pixel data preserved; physical-size metadata added.',
  'artworks':[]}
 existing={item['slug']:item for item in provenance['artworks']}
 for entry in entries:
  slug=entry['slug']
  data,width,height=sized_png(Path(entry['source']).read_bytes())
  (destination/(slug+'.png')).write_bytes(data)
  href='data:image/png;base64,'+base64.b64encode(data).decode()
  svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="54mm" height="34mm" viewBox="0 0 54 34"><title>{slug.replace("-"," ")}: botanical watercolor artwork</title><image width="54" height="34" preserveAspectRatio="xMidYMid meet" href="{href}"/></svg>\n'
  (destination/(slug+'-54x34mm.svg')).write_text(svg)
  existing[slug]={'slug':slug,'file':slug+'.png','printArtwork':slug+'-54x34mm.svg','widthPixels':width,'heightPixels':height,'widthMm':54,'heightMm':34,'prompt':entry['prompt'],'generatedFile':Path(entry['source']).name,'attribution':'AI-generated with the built-in image generation tool.'}
 provenance['artworks']=sorted(existing.values(),key=lambda item:item['slug'])
 provenance_path.write_text(json.dumps(provenance,indent=2,ensure_ascii=False)+'\n')
 print(f'Packaged {len(entries)} artworks; {len(existing)} total.')

if __name__ == '__main__':
 parser=argparse.ArgumentParser();parser.add_argument('sources',type=Path)
 package(json.loads(parser.parse_args().sources.read_text()))

"""Build the Foundation Garden content package; artwork is generated separately.

Canonical CSV follows the existing project schema. Re-running retains card UUIDs.
"""
import csv
import json
import shutil
import uuid
import xml.etree.ElementTree as ET
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BASE = ROOT / 'static-app/projects/houston-food-web'
EXAMPLE = ROOT / 'static-app/projects/houston-food-web-expansion'
PACK = ROOT / 'static-app/projects/houston-foundation-garden'
GROW = 'Grow: In Plant Growth, spend 1 Light + 1 Water for +1 Population. Repeat up to maximum 3.'
DEFAULT = 'Enter with 1 Population; maximum 3. Choose one action when activated.'

# slug, common name, scientific name, family, category, first/second action, note
CARDS = [
 ('inland-sea-oats', 'Inland sea oats', 'Chasmanthium latifolium', 'Poaceae', 'plant · grass', GROW, '', 'Seeds feed Northern cardinal; leaves feed Grasshopper. Maximum 3 Population.'),
 ('pink-evening-primrose', 'Pink evening primrose', 'Oenothera speciosa', 'Onagraceae', 'plant · flowering', GROW, 'Spread Underground: Once per Plant Growth, spend 2 Water for +1 Population without Light.', 'Spreads by underground stems. Hoverfly visits its flowers. Maximum 3 Population.'),
 ('firewheel', 'Firewheel', 'Gaillardia pulchella', 'Asteraceae', 'plant · flowering', GROW, '', 'Phaon crescent and Hoverfly visit its flowers. Maximum 3 Population.'),
 ('sunflower', 'Sunflower', 'Helianthus annuus', 'Asteraceae', 'plant · flowering', GROW, '', 'Seeds feed Northern cardinal. Flowers feed Phaon crescent and Hoverfly. Maximum 3.'),
 ('crape-myrtle', 'Crape myrtle', 'Lagerstroemia indica', 'Lythraceae', 'plant · tree · shelter', GROW, 'Shelter: Activate to shelter your Green anole or Northern cardinal. Block its next loss of 1 Population before your next turn.', 'One Shelter per animal. Crape myrtle aphid feeds on this tree. Maximum 3.'),
 ('frogfruit', 'Frogfruit', 'Phyla nodiflora', 'Verbenaceae', 'plant · flowering · host', GROW, '', 'Phaon crescent host plant; flowers feed adult crescents and Hoverflies. Maximum 3.'),
 ('sideoats-grama', 'Sideoats grama', 'Bouteloua curtipendula', 'Poaceae', 'plant · grass', GROW, '', 'Seeds feed Northern cardinal; leaves feed Grasshopper. Maximum 3 Population.'),
 ('mealy-blue-sage', 'Mealy blue sage', 'Salvia farinacea', 'Lamiaceae', 'plant · flowering', GROW, 'Pollinator Invitation: Activate; spend 1 Light to add Bloom. Next Hoverfly visit gives it an extra +1 Population. Remove Bloom.', 'One Bloom per plant; expires at your next turn. Maximum 3 Population.'),
 ('phaon-crescent', 'Phaon crescent', 'Phyciodes phaon', 'Nymphalidae', 'pollinator · butterfly · herbivore', 'Caterpillar Munch: Feed on Frogfruit anywhere. Crescent +1 Population; Frogfruit -1 Population.', 'Butterfly Visit: Pollinate Frogfruit, Firewheel, or Sunflower anywhere. Both gain +1 Population.', 'One card represents both life stages. Enter with 1 Population; maximum 3.'),
 ('northern-cardinal', 'Northern cardinal', 'Cardinalis cardinalis', 'Cardinalidae', 'bird · omnivore', 'Crack Seeds: Feed on Sunflower, Inland sea oats, or Sideoats grama anywhere. Cardinal +1 Population; plant -1 Population.', 'Catch Insects: Hunt Grasshopper, Phaon crescent, or Hoverfly anywhere. Cardinal +1 Population; prey -1 Population.', DEFAULT),
 ('hoverfly', 'Hoverfly', 'Allograpta obliqua', 'Syrphidae', 'pollinator · fly · predator', 'Flower Visit: Pollinate Frogfruit, Firewheel, Sunflower, Pink evening primrose, or Mealy blue sage anywhere. Both +1 Population.', 'Hungry Larva: Hunt Crape myrtle aphid anywhere. Hoverfly +1 Population; aphid -1 Population.', 'Adults visit flowers; larvae eat aphids. Enter with 1 Population; maximum 3.'),
 ('pillbug', 'Pillbug', 'Armadillidium vulgare', 'Armadillidiidae', 'detritivore · crustacean', 'Shred Leaf Litter: Turn one face-up plant in Compost face down; move it to the bottom. Give one of your plants +1 Population.', 'Hide in Mulch: After Shred Leaf Litter, shelter this Pillbug. Block its next loss of 1 Population before your next turn.', 'Always playable. Shredding gives Pillbug no Population. Enter with 1; maximum 3.'),
 ('grasshopper', 'Grasshopper', 'Melanoplus differentialis', 'Acrididae', 'herbivore · insect', 'Munch Leaves: Feed on Inland sea oats, Sideoats grama, Sunflower, or Pink evening primrose anywhere. Hopper +1; plant -1 Population.', 'Jump Away: When hunted, if at 2+ Population, spend 1 Population to cancel the hunt. Hunter gains nothing. Once per round.', 'Jump Away is a reaction, not an activation. Enter with 1 Population; maximum 3.'),
 ('green-anole', 'Green anole', 'Anolis carolinensis', 'Dactyloidae', 'predator · reptile', 'Snap Up Insects: Hunt Grasshopper, Hoverfly, or Phaon crescent anywhere. Anole +1 Population; prey -1 Population.', 'Territorial Display: Choose an opponent\'s Green anole. It cannot hunt until your next turn. Each target: once per round.', 'Use a Territory marker. Enter with 1 Population; maximum 3.'),
 ('crape-myrtle-aphid', 'Crape myrtle aphid', 'Tinocallis kahawaluokalani', 'Aphididae', 'herbivore · sap feeder', 'Sip Sap: Feed on Crape myrtle anywhere. Aphid +1 Population; tree -1 Population.', '', 'Prey for Hoverfly larvae. Enter with 1 Population; maximum 3.'),
]

def build():
 PACK.mkdir(parents=True, exist_ok=True)
 (PACK / 'graphics').mkdir(exist_ok=True)
 (PACK / 'templates').mkdir(exist_ok=True)
 previous = {}
 csv_path = PACK / 'cards.csv'
 if csv_path.exists():
  with csv_path.open(encoding='utf-8-sig', newline='') as f:
   previous = {r['image_filename']: r['card_id'] for r in csv.DictReader(f)}
 headers = ['common_name','scientific_name','family','categories','image_filename','mechanic_1','mechanic_2','extra_info','card_id','card_kind','copies','theme']
 with csv_path.open('w', encoding='utf-8-sig', newline='') as f:
  writer = csv.DictWriter(f, fieldnames=headers, quoting=csv.QUOTE_ALL)
  writer.writeheader()
  for slug, name, scientific, family, category, one, two, note in CARDS:
   image = slug + '.png'
   writer.writerow(dict(zip(headers, [name,scientific,family,category,image,one,two,note,previous.get(image) or str(uuid.uuid4()),'organism',3 if category.startswith('plant') else 2,'sage' if category.startswith('plant') else 'sky' if 'bird' in category else 'sand'])))
 manifest = json.loads((EXAMPLE / 'manifest.json').read_text())
 manifest.update(id='houston-foundation-garden', name='Houston Foundation Garden', description='15 garden organisms, 38 printable cards, and ecological abilities. Play alone or add to Houston Food Web.', csv='cards.csv', workspace='workspace.json')
 manifest['templates'] = [{'id':'foundation-garden','title':'Foundation Garden (54 × 34 mm artwork)','svg':'templates/foundation-garden.svg'}]
 manifest['starter']['template'] = 'foundation-garden'
 manifest['files'] = [
  {'type':'markdown','title':'Garden expansion guide','path':'README.md'},
  {'type':'markdown','title':'Garden rules and special moves','path':'garden-rules.md'},
  {'type':'markdown','title':'Base game rules (1.0.0)','path':'game-rules.md'},
  {'type':'download','title':'Garden card data CSV','path':'cards.csv'},
  {'type':'download','title':'Artwork prompts and provenance','path':'graphics/prompts.json'},
 ]
 (PACK / 'manifest.json').write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+'\n')
 shutil.copyfile(EXAMPLE / 'card-back.png', PACK / 'card-back.png')
 shutil.copyfile(BASE / 'campus-food-web-turn-guide.md', PACK / 'game-rules.md')
 # Preserve the established editable template, adjusting only this pack's panel.
 ns = 'http://www.w3.org/2000/svg'
 ET.register_namespace('', ns)
 root = ET.fromstring((EXAMPLE / 'templates/food-web.svg').read_text())
 root.set('data-title', 'Foundation Garden')
 root.find('{'+ns+'}title').text = 'Foundation Garden'
 by_id = {el.get('id'): el for el in root.iter() if el.get('id')}
 scale = 180 / 63.5  # card width: 2.5 inches / 63.5 mm
 art = by_id['artwork']
 art.set('width', str(54*scale)); art.set('height', str(34*scale))
 art.set('x', str((180-54*scale)/2)); art.set('y', '31.360512')
 for key, y in [('mechanic_1','157'),('mechanic_2','191')]:
  el = by_id[key]
  el.set('y',y); el.set('font-size','7px'); el.set('data-line-height','7.7')
  el.set('data-lines','4'); el.set('data-max-chars','220')
 # First action max 4 lines ends at 180.1; second ends at 214.1.
 (PACK / 'templates/foundation-garden.svg').write_text(ET.tostring(root, encoding='unicode', xml_declaration=True)+'\n')
 with csv_path.open(encoding='utf-8-sig', newline='') as f:
  rows = list(csv.DictReader(f))
 workspace = {'version':1,'activeCardId':rows[0]['card_id'],'cards':{r['card_id']:{'expansion':'Houston Foundation Garden','sourceProjectId':'houston-foundation-garden','attribution':'AI-generated scientific watercolor artwork; prompts and ecological sources included in the project.'} for r in rows}}
 (PACK / 'workspace.json').write_text(json.dumps(workspace, indent=2)+'\n')
 base_manifest_path = BASE / 'manifest.json'
 base_manifest = json.loads(base_manifest_path.read_text())
 if not any(p['id']=='houston-foundation-garden' for p in base_manifest.get('expansions',[])):
  base_manifest.setdefault('expansions',[]).append({'id':'houston-foundation-garden','name':'Houston Foundation Garden'})
 base_manifest_path.write_text(json.dumps(base_manifest, indent=2, ensure_ascii=False)+'\n')
 print(f'Created {len(rows)} organisms / {sum(int(r["copies"]) for r in rows)} copies in {PACK}')

if __name__ == '__main__':
 build()

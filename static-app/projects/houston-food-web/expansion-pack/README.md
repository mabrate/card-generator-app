# Campus Food Web expansion pack

This eight-card pack is designed to be added to the original [Campus Food Web v1 deck](../README.md). It adds **16 physical cards**: two copies of each organism.

## Add it to a saved project folder

The static app opens complete project folders or ZIPs. It has no standalone CSV import, teacher studio, or Skip existing cards control.

1. Use **Save project** for your base deck, then unzip it into a working folder.
2. Locate the canonical CSV specified by `manifest.json` → `csv`. Append the expansion's eight rows to that CSV, matching its column headers to the saved project's headers. Preserve all existing rows and use the distinct `exp-` card IDs for the new ones. Set each new row's `copies` to 2 and a valid named/custom theme.
3. Copy the expansion's eight PNGs into the project's `graphics/` folder. Set each appended row's `image_filename` to its project-relative path, such as `graphics/coopers-hawk.png`, using the actual filename. Keep prompt/provenance JSON separate from images.
4. Keep the manifest's `csv` path pointing to the combined CSV. Do not rely on automatic detection when several CSVs are present. Existing `workspace.json` settings remain valid for the base card IDs; new cards use default crops and no saved drawing.
5. Use **Open project folder** beside the preview and choose the working folder or a ZIP containing it. Verify eight added cards, each with two copies, and check their artwork and field text before printing.
6. **Save project** creates the updated editable ZIP. **Print all cards** adds the expansion's 16 physical copies to the base deck, subject to the 600-copy sheet limit.

The expansion uses the original v1 card-data vocabulary. Map those columns to the selected template's field keys when preparing the combined CSV; the app retains extra columns, but extra data is printed only when the template has a matching field.

## Cards and food-web gaps

| Card | Copies | Role in the expanded web |
| --- | ---: | --- |
| Cooper's Hawk | 2 | Eats Carolina Wrens and small reptiles, adding a predator above the wren. |
| Texas Leafcutting Ant | 2 | Adds a native plant-feeding ant and fungus-farming relationship. |
| Pyramid Ant | 2 | Adds a native ant that competes with imported fire ants and hunts small prey. |
| Red Harvester Ant | 2 | Links plant seeds to an ant specialist and the Texas Horned Lizard. |
| Springtails | 2 | Graze fungi and bacteria, adding something that eats the decomposers. |
| Convergent Lady Beetle | 2 | Adds another native aphid predator. |
| Rabid Wolf Spider | 2 | Adds a ground predator for insects and springtails, plus prey for wrens. |
| Texas Horned Lizard | 2 | Adds an ant specialist and prey for the Cooper's Hawk. |

The mechanics are classroom play-test abstractions. In particular, the Pyramid Ant population transfer represents competition with imported fire ants rather than a claim of direct predation. Review balance after playing with the larger deck.

## Files

- `campus-food-web-expansion.csv`: UTF-8 CSV in the v1 import format.
- `graphics/*.png`: eight natural-history illustrations, 1503 × 1046 pixels with physical-size metadata matching the v1 artwork.
- `graphics/prompts.json`: image prompts and generation provenance.

Artwork is AI-generated educational illustration and is not a diagnostic identification guide.

## Ecology references

These links require internet; the cards and app do not.

- [Texas A&M AgriLife: native ants compared with imported fire ants](https://fireant.tamu.edu/learn/native-ants/)
- [Texas A&M AgriLife: Texas leafcutting ant](https://texasinsects.tamu.edu/texas-leafcutting-ant/)
- [Texas A&M AgriLife: red harvester ant](https://texasinsects.tamu.edu/red-harvester-ant/)
- [Texas Parks and Wildlife: ants, animals, and Texas Horned Lizards](https://tpwd.texas.gov/education/resources/keep-texas-wild/awesome-ants/student-research-pages-ants-animals-and-us)
- [Texas A&M AgriLife: springtails](https://agrilifeextension.tamu.edu/library/gardening/springtails/)
- [Oregon State Extension: soil organisms and springtail feeding](https://extension.oregonstate.edu/catalog/em-9409-understanding-soil-health-biota-farms-gardens)
- [NC State Extension: convergent lady beetle](https://entomology.ces.ncsu.edu/biological-control-information-center/beneficial-predators/convergent-ladybeetle/)
- [Cornell Lab: Cooper's Hawk life history and diet](https://www.allaboutbirds.org/guide/Coopers_Hawk/lifehistory)

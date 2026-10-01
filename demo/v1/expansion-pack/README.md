# Campus Food Web expansion pack

This eight-card pack is designed to be added to the original [Campus Food Web v1 deck](../README.md). It adds **16 physical cards**: two copies of each organism.

## Import it into an existing v1 project

1. Open the v1 project and choose **Layout & CSV**.
2. Click **Import cards from CSV** near the top of the page.
3. Choose `campus-food-web-expansion.csv` and select all eight PNG files in `graphics/`. Do not select `prompts.json`.
4. Keep the suggested column matches and validate the import.
5. Confirm **8 rows ready · 16 copies**, then import the reviewed rows.

The `exp-` card IDs are distinct from the original v1 IDs, so the default **Skip existing cards** setting safely adds the pack. The expansion uses the v1 field guide layout and the same CSV columns, themes, image dimensions, and gameplay vocabulary.

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

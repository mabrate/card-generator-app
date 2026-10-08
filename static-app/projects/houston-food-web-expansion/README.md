# Houston Food Web expansion pack

This eight-card pack is designed to be added to the original Houston Food Web base deck. It adds **16 physical cards**: two copies of each organism.

## Open or add this pack

This is a complete, self-contained project containing only the expansion's eight cards. Its manifest identifies `houston-food-web-expansion` version `1.0.0`, designed for the `houston-food-web` base game version `1.0.0`. The base deck is required for gameplay. The packaged [game rules](game-rules.md) are a snapshot for that version.

- **Edit the pack:** open `?project=houston-food-web-expansion`, or use **Open project folder** with this folder or its saved ZIP. Use **Save project** to share the complete editable pack.
- **Add to your game:** open your base project, choose **Add expansion**, and select this folder or ZIP. The published Houston project also offers **Add Houston Food Web Expansion** directly. Review the eight cards and import them into the prefilled expansion group.
- Cards are appended to the current project. Existing IDs are checked; repeated cards default to Skip and changed cards require an explicit conflict choice. Keep the original `exp-` IDs when updating this pack.
- **Save project** exports the combined deck, artwork, expansion labels, and imported-pack version records. **Print all cards** prints the base and accepted expansion cards using their copy counts.

The app reads the manifest's canonical CSV; no manual row merging or image copying is needed. Artwork, a local editable template, and the card back are included inside the package. SVG submissions from students still use **Import cards**.

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

- `manifest.json`: project identity, version, base-game compatibility, resources, and canonical CSV.
- `templates/food-web.svg`: local editable layout.
- `card-back.png`: matching game back.
- `game-rules.md`: packaged base-game rules.
- `campus-food-web-expansion.csv`: canonical UTF-8 card data.
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

# Houston Foundation Garden

A complete, editable expansion for **Houston Food Web 1.0.0** that can also be played as its own garden game. It contains **15 organism types and 38 physical cards**: three copies of each of eight plants and two copies of each of seven animals.

## Open, add, or share

- Open `?project=houston-foundation-garden` to edit only this garden deck. You can also use **Open project folder** with this folder or its saved ZIP.
- From Houston Food Web, choose **Add Houston Foundation Garden**. For another saved base project, choose **Add expansion** and select this folder or ZIP. Review the cards before importing.
- Use **Save project** to share the editable project, including artwork, template, attribution, rules, and expansion identity. Use **Print all cards** for the 38-card garden deck or your combined game.
- Keep card IDs when revising cards. These garden variants have fresh UUIDs, including Frogfruit and Sunflower, whose actions or artwork differ from the original deck. Adding the garden preserves the base versions. Repeated imports skip unchanged cards; changed cards require an explicit conflict choice.

Read [Garden rules and special moves](garden-rules.md) before playing. The packaged [base rules](game-rules.md) explain the original game's counters and turn structure. Garden rules take precedence for this standalone set.

## Organisms

| Plant (3 copies each) | Animal (2 copies each) |
| --- | --- |
| Inland sea oats | Phaon crescent |
| Pink evening primrose | Northern cardinal |
| Firewheel | Hoverfly |
| Sunflower | Pillbug |
| Crape myrtle | Grasshopper |
| Frogfruit | Green anole |
| Sideoats grama | Crape myrtle aphid |
| Mealy blue sage | |

Selected abilities include underground spreading, tree shelter, pollinator invitation, contrasting insect life stages, omnivory, litter recycling, predator escape, and territorial competition. The other plants use the familiar Grow action. Crape myrtle aphid supplies a food target for Hoverfly larvae.

## Artwork

Each card has its own scientific botanical watercolor vignette showing an ecological action. Artwork is AI-generated with the built-in image-generation tool; prompts, dimensions, and generation provenance are recorded in [graphics/prompts.json](graphics/prompts.json). It is an educational illustration, not a diagnostic identification plate.

The local template's picture area is exactly **54 × 34 mm** within a **63.5 × 88.9 mm** card. PNGs include physical-size metadata for 54 × 34 mm. Each matching `graphics/*-54x34mm.svg` is a self-contained artwork-only file with the exact physical dimensions and an embedded copy of the PNG. Print at 100% for that size. The app uses the PNGs, so saving and individual card SVG export follow the existing raster-asset workflow.

## Package contents

- `manifest.json`: project version, base-project compatibility, CSV, template, and reference documents.
- `cards.csv`: canonical editable card data with stable UUIDs and copy counts.
- `workspace.json`: expansion labels, source-project identity, and artwork attribution.
- `templates/foundation-garden.svg`: local editable card layout.
- `card-back.png`: the original matching Houston Food Web back.
- `garden-rules.md` and `game-rules.md`: standalone rules and base-game reference.
- `graphics/`: 15 PNG artworks, physical-size artwork SVGs, and prompt provenance.

## Ecology sources

The numeric costs and bonuses are classroom game abstractions. For example, Spread Underground trades water for growth; it does not claim that primroses grow without sunlight. Shelter limits a single population loss rather than making an animal invulnerable. Flower visits represent pollination at a broad classroom level, not a measured species-specific pollination rate.

- [Phaon crescent host plants and adult feeding](https://www.butterfliesandmoths.org/species/Phyciodes-phaon)
- [Houston–Galveston hoverflies and aphid-eating larvae](https://txmg.org/galveston/beneficials-in-the-garden-and-landscape/hover-syrphid-flower-flies/)
- [Northern cardinal seeds and insect prey](https://www.audubon.org/field-guide/bird/northern-cardinal)
- [Local green anole natural history](https://txmg.org/galveston/beneficials-in-the-garden-and-landscape/green-anole/)
- [Texas pillbugs and decaying plant material](https://citybugs.tamu.edu/factsheets/landscape/veggie/ent-1006/)
- [Differential grasshopper](https://texasinsects.tamu.edu/differential-grasshopper/)
- [Crape myrtle aphid and sap feeding](https://ask.ifas.ufl.edu/publication/IN663)
- [Pink evening primrose](https://plants.ces.ncsu.edu/plants/oenothera-speciosa/)

The sources require internet. The complete project and its artwork work offline after loading or folder/ZIP import.

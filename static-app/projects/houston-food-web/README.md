# Campus Food Web demo

An optional [eight-card food-web expansion](expansion-pack/README.md) adds native ants, consumers of decomposers, ground predators, and a predator above the Carolina Wren.

## Open it in the static app

Opening `?project=houston-food-web` gives you a blank card and project resources, not a populated deck. There is no teacher sign-in, approval queue, or standalone CSV import screen in this app.

To edit the full base deck:

1. Copy this project folder to a working folder on your device.
2. In its `manifest.json`, add `"csv": "campus-food-web-cards.csv"`. This folder also contains the expansion CSV, so the importer needs an explicit choice.
3. Ensure the base CSV's `image_filename` values reference the included `graphics/` images. Unique basenames are accepted on import; export writes the actual saved relative paths.
4. Choose **Open project folder** beside the preview, then **Choose folder** or **Choose ZIP**. Include the manifest, selected CSV, images, and project documents together. A folder containing a CSV alone or the artwork ZIP alone is not a complete project.
5. Edit cards, quantities, artwork, and colors. **Save project** downloads a complete editable ZIP and updates `campus-food-web-cards.csv` inside it. It does not change your source folder. Reopen the saved ZIP using the same project-open button.
6. Use **Print all cards** to print each card's saved quantity. The manifest supplies the game back; **Define card back** beside printing can replace it, and **Remove card back** switches to front-only printing. Print double-sided, landscape, flip on the short edge.

Each import opens a separate browser workspace. Reopening edited CSV data supplies the card values; saved settings retain image crops and drawings by stable card ID. To add the expansion, follow its [folder-based instructions](expansion-pack/README.md).

## Files and content

- `campus-food-web-cards.csv`: the ready-to-import, UTF-8 data file.
- `graphics/*.png`: generated natural-history illustrations for all 15 organisms and seven effect cards; no SVG substitutes. PNG physical-size metadata is 2.13 × 1.48 inches (rounding tolerance below 0.001 inch). Original generated pixels are retained at roughly 706 DPI; the app uses the physical image-box size when rendering.
- `graphics/prompts.json`: built-in image-generator prompt set and generation provenance, one call per card.
- `campus-food-web-turn-guide.md`: current play-tested shared game rules. Earlier prototype sources are retained in the repository’s demo archives.

Printed content is Common Name → Binomial Name → Family → Categories → Image → Mechanic 1 → Mechanic 2 → Fun facts / extra gameplay. `card_id`, `card_kind`, `copies`, and `theme` are metadata, not additional printed content boxes. The renderer supplies the `Family: ` prefix, so enter only the family name in that column.

The consolidated demo deliberately shortens prose and folds labels into complete mechanics sentences. **This is an editorial change to the demo, not automatic import behavior.** Earlier source wording remains in the repository’s demo archives. Cards with fewer than two original abilities use an existing shared rule (plant growth, population cap, or play eligibility) for their second box. Short names such as Mistflower, Bluebonnet, Carpenter Bee, and Fire Ants refer to the corresponding cards in this deck. Mulch retains its delayed-discard exception. The seven effect cards have blank scientific-name/family cells and their own event illustrations. Compost Addition and the decomposers' text changed materially to fit the new card-based Compost rule.

No new biological fun facts were invented to fill space: most final boxes contain supplemental gameplay information. Artwork is AI-generated teaching material, not a diagnostic identification guide. The bacterium is a conceptual microscope illustration.

## Rule changes in this play-test revision

The guide now uses two marked black-eyed peas for Hot / Clear / Cloudy weather, repeatable plant growth with a 3-Water cap, face-up organism cards as decomposable Compost, no Nutrient counters, and a 20-point Population-plus-distinct-organisms win condition. All demo card text follows those rules. For this prototype, Native Plant Boom may target any of the five Plant card types; the deck does not store a separate native-status flag.

Two card abilities needed substantial redesign: **Compost Addition** now discards one organism card from hand face up onto Compost instead of adding two counters, and **Soil Bacterium's Rapid Recycling** now uses two face-up organism cards in one activation without a 2-Population prerequisite. Each card consumed gives one of your plants +1 Population, subject to its cap. Decomposers no longer gain Population by decomposing. This may affect their power and the pace of the game; play-test again before treating the new balance as final. The two-pea toss makes Cloudy occur half the time, which may also slow the race to 20.

## Layout and file organization

Choose the template under **Your cards**. The adjacent download icon saves its SVG (hover for **Download template SVG**). Edit the SVG in Inkscape and open it through **Open template SVG** in the unrestricted editor; project-specific template restrictions still apply. Save project packages the layout separately from card data.

New artwork, drawings, and chosen backs use `graphics/`. Imported images retain their existing folder paths, without duplicate root files created from short-name aliases. Named or custom colors live in the CSV `theme` column. `workspace.json` stores image positioning, drawings, and the active card. Keep stable `card_id` values when editing the CSV outside the app.

The turn guide describes gameplay and is unchanged by these editor updates. Project documents are displayed only when the manifest lists resources; an empty resource section is hidden.

## Family references

Family values were checked against these reference records. These links require internet; the app and demo do not.

- Milkweed — [Florida Museum: Asclepias perennis](https://www.floridamuseum.ufl.edu/wildflowers/flowers/white-swamp-milkweed/), Apocynaceae.
- Frogfruit — [Kew: Phyla nodiflora](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A194567-2/general-information), Verbenaceae.
- Mistflower — [Kew: Conoclinium coelestinum](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A197044-1), Asteraceae.
- Bluebonnet — [Kew: Lupinus texensis](https://powo.science.kew.org/taxon/urn%3Alsid%3Aipni.org%3Anames%3A279946-2), Fabaceae.
- Sunflower — [Kew: Helianthus annuus](https://www.kew.org/plants/sunflower), Asteraceae.
- Monarch — [Finnish Biodiversity Information Facility: Danaus plexippus](https://laji.fi/en/taxon/gbif%3A5133088/taxonomy), Nymphalidae.
- Carpenter bee — [NCBI: Xylocopa virginica](https://www.ncbi.nlm.nih.gov/datasets/taxonomy/28638/), Apidae.
- Aphids — [Aphis phylogeny study](https://pubmed.ncbi.nlm.nih.gov/17113793/), Aphididae.
- Assassin bug — [UF/IFAS: Zelus longipes](https://ask.ifas.ufl.edu/publication/IN883), Reduviidae.
- Parasitoid wasp — [GBIF: Lysiphlebus testaceipes](https://www.gbif.org/species/1260918), Braconidae.
- Fire ant — [NCBI: Solenopsis invicta](https://www.ncbi.nlm.nih.gov/datasets/taxonomy/13686/), Formicidae.
- Anole — [Harvard MCZ: Anolis sagrei](https://mczbase.mcz.harvard.edu/name/Anolis%20sagrei), Dactyloidae.
- Wren — [Cornell Lab: Carolina Wren](https://www.allaboutbirds.org/guide/Carolina_Wren/id), Troglodytidae.
- Turkey tail — [NCBI: Trametes versicolor](https://www.ncbi.nlm.nih.gov/datasets/taxonomy/5325/), Polyporaceae.
- Soil bacterium — [NCBI taxonomy via PubChem: Bacillus subtilis](https://pubchem.ncbi.nlm.nih.gov/taxonomy/Bacillus-subtilis), Bacillaceae.

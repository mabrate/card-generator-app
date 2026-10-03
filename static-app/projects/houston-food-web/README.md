# Campus Food Web demo

An optional [eight-card food-web expansion](expansion-pack/README.md) adds native ants, consumers of decomposers, ground predators, and a predator above the Carolina Wren.

## Import it

1. Start the app, sign in as teacher, and open **Layout & CSV studio**.
2. In **Card style and corners**, choose **Field guide · square corners** and click **Create from template**. Give the new project a title, then select `v1/campus-food-web-cards.csv`.
3. Select all **22 PNG files** inside `v1/graphics/` using the image-assets picker. Do not select `prompts.json`. Each filename matches its CSV cell exactly.
4. Check the column matches, select different CSV rows to preview, and adjust boxes/fonts if desired. The field guide template provides the v1 card layout and image area.
5. Save the layout, validate, review the rows, then import. Expected result: **22 created, 48 copies, 0 rejected, 0 needing text/layout review** with the unmodified default layout.
6. Open Teacher review. To change the layout later, use **Edit this project's layout**, or reopen the saved project in the studio and choose **Preview a saved card**.

If you imported this set before, select the v1 CSV and all 22 PNGs, then choose **Update existing cards** to replace its card text and images. This resets those cards' approval and image crops. Existing cards are never silently changed just because files in `demo/` changed.

Repeated imports with the default **Skip existing cards** option create nothing and skip all 22 matching IDs. Updating replaces the matching card's data and resets its approval and image crop. Creating another copy assigns a new external ID; it does not change the `copies` count on the original card.

## Files and content

- `campus-food-web-cards.csv`: the ready-to-import, UTF-8 data file.
- `campus-food-web-cards.xlsx`: editable workbook containing the same cards plus field instructions. Save the **Cards** sheet as UTF-8 CSV before importing.
- `campus-food-web-cards.json`: the same consolidated data in a readable structured form.
- `graphics/*.png`: generated natural-history illustrations for all 15 organisms and seven effect cards; no SVG substitutes. PNG physical-size metadata is 2.13 × 1.48 inches (rounding tolerance below 0.001 inch). Original generated pixels are retained at roughly 706 DPI; the app uses the physical image-box size when rendering.
- `graphics/prompts.json`: built-in image-generator prompt set and generation provenance, one call per card.
- `campus-food-web-turn-guide.md`: current play-tested shared game rules. The unedited prototype source remains under `../source/`.
- `../source/`: the **unedited original CSV, JSON, and prototype PDF**, moved here for reference. The PDF has not been regenerated to show the new card design.

Printed content is Common Name → Binomial Name → Family → Categories → Image → Mechanic 1 → Mechanic 2 → Fun facts / extra gameplay. `card_id`, `card_kind`, `copies`, and `theme` are metadata, not additional printed content boxes. The renderer supplies the `Family: ` prefix, so enter only the family name in that column.

The consolidated demo deliberately shortens prose and folds labels into complete mechanics sentences. **This is an editorial change to the demo, not automatic import behavior.** Source wording remains in `../source/`. Cards with fewer than two original abilities use an existing shared rule (plant growth, population cap, or play eligibility) for their second box. Short names such as Mistflower, Bluebonnet, Carpenter Bee, and Fire Ants refer to the corresponding cards in this deck. Mulch retains its delayed-discard exception. The seven effect cards have blank scientific-name/family cells and their own event illustrations. Compost Addition and the decomposers' text changed materially to fit the new card-based Compost rule.

No new biological fun facts were invented to fill space: most final boxes contain supplemental gameplay information. Artwork is AI-generated teaching material, not a diagnostic identification guide. The bacterium is a conceptual microscope illustration.

## Rule changes in this play-test revision

The guide now uses two marked black-eyed peas for Hot / Clear / Cloudy weather, repeatable plant growth with a 3-Water cap, face-up organism cards as decomposable Compost, no Nutrient counters, and a 20-point Population-plus-distinct-organisms win condition. All demo card text follows those rules. For this prototype, Native Plant Boom may target any of the five Plant card types; the deck does not store a separate native-status flag.

Two card abilities needed substantial redesign: **Compost Addition** now discards one organism card from hand face up onto Compost instead of adding two counters, and **Soil Bacterium's Rapid Recycling** now uses two face-up organism cards in one activation without a 2-Population prerequisite. Each card consumed gives one of your plants +1 Population, subject to its cap. Decomposers no longer gain Population by decomposing. This may affect their power and the pace of the game; play-test again before treating the new balance as final. The two-pea toss makes Cloudy occur half the time, which may also slow the race to 20.

## Layout-first workflow

Save a layout in the studio and download **Excel template (.xlsx)** or **spreadsheet template (.csv)**. Fill one row per card. The Excel template includes a Field guide explaining each box, required fields, character limits, and image matching. CSV imports preserve full source values and flag layout overflow instead of shrinking or truncating text.

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

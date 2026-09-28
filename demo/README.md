# Campus Food Web demo

## Current version

Use **v2** for new imports and play. Its card text keeps card-specific abilities and special interactions while shared turn rules stay in the guide.

- [Cards CSV](v2/campus-food-web-cards.csv) — UTF-8 import file.
- [Cards workbook](v2/campus-food-web-cards.xlsx) — editable cards plus a field guide.
- [Cards JSON](v2/campus-food-web-cards.json) — structured copy of the CSV.
- [V2 turn guide](v2/campus-food-web-turn-guide.md) — shared rules and turn sequence.
- [Illustrations](v2/graphics/) — 22 PNG images, one for each card.

The deck has 22 card types and 48 total copies. The illustrations have 2.13 × 1.48 inch physical-size metadata. The v2 workbook and JSON match the CSV. Soil Bacterium’s second ability is preserved exactly as provided: “Multiply: turn 1 face-up organism in Compost face down on bottom. Give this organism +1 Population.”

## Import v2

1. Start the app, sign in as teacher, and open **Layout & CSV studio**.
2. Keep **New organism layout** and select demo/v2/campus-food-web-cards.csv.
3. Select the 22 PNGs in demo/v2/graphics/. Filenames match the CSV.
4. Check column matches, adjust boxes and font sizes, save the layout, and validate the rows.
5. Import. Expected result: 22 card types / 48 copies.

## Versions

- [v1](v1/) preserves the previous card CSV, JSON, workbook, turn guide, illustrations, and print sheets.
- [source](source/) contains the original prototype CSV, JSON, and PDF.

Card content is Common Name, Binomial Name, Family, Categories, Image, two mechanic fields, and Extra info. The renderer prints the Family prefix; enter only the family name. The Extra info field is for unique gameplay information or biological/ecological facts, not reminders of shared rules. It may be left blank.

Artwork is AI-generated for teaching, not a scientific identification guide. Each version includes its own graphics folder so the card data and images can be used together.

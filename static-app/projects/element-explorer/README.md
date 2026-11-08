# Element Explorer

Two editable example cards: **Hydrogen (1)** and **Ytterbium (70)**. Each card has an Ink body, a family-colored strip, and a photograph of a real use. Hydrogen starts first; use the card arrows or title picker to switch examples. Use **New card** to research another element, or **Import cards** to collect classmates' SVGs into a printable set.

If this browser still shows the older examples, save any work you want to keep, then choose **Restore starter examples** to load these two cards and their photos. Saved student work is not replaced automatically.

## Automatic family colors

Editing **Element family** changes the strip immediately. The rest of the card stays Ink: white background, dark text, gray facts/image panels, and gray border. Family names stay visible so color is not the only clue.

- Nonmetal: `#326c48`
- Noble Gas: `#70448c`
- Alkali Metal: `#a84b16`
- Alkaline Earth Metal: `#8b641c`
- Metalloid: `#236c7b`
- Post-Transition Metal: `#405e91`
- Halogen: `#a23860`
- Transition Metal: `#80513b`
- Lanthanide: `#6f577d`
- Actinide: `#814447`

The list includes rules for families beyond these examples, so you can add more elements. These are broad classroom categories; the Group field gives the numbered periodic-table column where applicable. Hydrogen is classified as a nonmetal even though it is in group 1. Ytterbium is a lanthanide in period 6; its Group is shown as “—” because it has no standard numbered group.

Open **Change colors** to see whether automatic colors or a manual override is active. Choosing a theme or an individual color creates a manual override. **Use automatic colors** restores the project rules. Blank/unrecognized families use the gray default strip. Matching ignores capitalization and surrounding whitespace.

## Save and edit

**Save project** preserves the readable manifest, CSV, template, and artwork in a ZIP. Automatic cards have a blank CSV `theme`; named/custom themes are explicit overrides. Reopen the ZIP or its extracted folder to keep editing. Change `colorRules` in `manifest.json` to adjust the family colors; no scripts or formulas are needed.

## Classroom ideas

- Arrange cards by atomic number, then by group and period.
- Sort by family or room-temperature state.
- Compare neighbors and explain which properties repeat.
- Add a photograph that clearly shows one use of each researched element.

## Data and artwork

Atomic numbers, rounded relative atomic masses, groups, periods, states at 20°C, and short facts were checked against the Royal Society of Chemistry periodic table. Atomic mass is not the mass number of one isotope. Uses include specialized technology: ytterbium's photograph shows an experimental atomic clock, not an ordinary household clock. The broad family categories are the project's classroom convention.

Source pages:
- [Hydrogen](https://periodic-table.rsc.org/element/1/hydrogen)
- [Ytterbium](https://periodic-table.rsc.org/element/70/ytterbium)
- [Fuel-cell vehicles — U.S. Department of Energy](https://www.fueleconomy.gov/feg/fuelcell.shtml)
- [Ytterbium optical lattice clocks — NIST](https://www.nist.gov/programs-projects/yb-optical-lattice-clock)

### Photo credits

- **Hydrogen:** [Toyota Mirai 140054.jpg](https://commons.wikimedia.org/wiki/File:Toyota_Mirai_140054.jpg), photographed by **Trop86**, 22 June 2025. [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). The Toyota Mirai is a hydrogen fuel-cell car.
- **Ytterbium:** [Ytterbium Clock](https://www.nist.gov/image/16pml015ytterbiumclocknphillipshrjpeg), **N. Phillips/NIST**, 2016. U.S. government work, public domain. NIST describes this as a composite of photographs that reveal the laser paths in an experimental ytterbium lattice atomic clock.

Both photographs are included locally in `graphics/`. The saved crops in `workspace.json` frame the car and the clock's central apparatus in the small 48 × 53 artwork box. The original photos remain available for adjusting the crop. Photo credits also travel in each card's SVG metadata and saved project. No online image service is needed to edit, share, or print the cards.

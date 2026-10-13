# Field Guide Starter

This starter uses one simple layout for all organisms. Each demo has a replaceable artistic colored-pencil scene on the front and a separate, simple identification sketch on the back. Both use a deliberately loose middle-school drawing style: uneven outlines, scribbly coloring, and simplified shapes. The drawings are observation models, not precise scientific diagrams. The front has a large, unlabeled drawing space for a student's identification sketch. The back has a colored-pencil reference plate plus three open fields: Adult Size, What clues help you identify it?, and Adaptations & Ecology. Campus observations, ecosystem services, and student questions fit inside these fields.

## Make a card

1. Choose **Front** to edit the example artwork, draw the organism, or add a photo. The binomial name and family appear together as *Genus species* (Family).
2. Choose **Back** to study the reference plate and add your field notes. Each card has its own back graphic; changing it does not replace the front drawing.
3. Use **Download template SVG** to save the selected layout. Open it in Inkscape, keep the `data-field` and `data-image` tags, then use **Open template SVG** while that side is selected.
4. Save the project ZIP to keep the CSV, both layouts, reference art, and edits together. Print double-sided, landscape, and flip on the short edge.

The usual Classroom Cards workflow remains unchanged: projects without an SVG `cardBack` continue to use one shared back image, or no back. The Field Guide manifest opts into editable per-card back fields with `cardBack.svg` and separate back graphics with the CSV's `back_image_filename` column.

## Demo organisms and reference sources

- Ladybug (`Coccinella septempunctata`): the adult back pattern and dark, orange-marked larva are shown together. Adults and larvae prey on aphids and other small insects. [NC State Extension](https://entomology.ces.ncsu.edu/biological-control-information-center/beneficial-predators/c-7-ladybeetle/)
- Green anole (`Anolis carolinensis`): the plate highlights the male's pink throat fan (dewlap). [Davidson College](https://bio.davidson.edu/herpcons/herps_of_NC/lizards/Anocar/Ano_car.html)
- Texas bluebonnet (`Lupinus texensis`): the plate shows the upright growth habit, palmately divided leaf, and alternate leaf arrangement, and pea-shaped flowers in a raceme. [University of Texas at Austin](https://w3.biosci.utexas.edu/prc/K12/pages/Lupinus%20texensis.html)

The back reference plates are colored-pencil classroom illustrations. Students can replace them with their own reference graphic, while the front drawing area stays independent.

## Restore the examples

Choose **Restore starter examples** below the editor to reload all four demo cards, their graphics, and both original SVG layouts. Save your project first to keep your edits. Opening the starter link normally recovers your browser workspace; it does not replace saved work. An earlier saved Field Guide shows a notice explaining how to restore the updated starter.

The plant example explicitly describes growth habit, leaf arrangement, and inflorescence in the open identification notes. Students can draw these features in the unlabeled artwork area without choosing a more complex plant-only template. Suggested campus locations are search prompts, not records of organisms actually observed at your school.

Both layouts have white backgrounds, sharp corners, and a 2 mm border. Images have no separate outline and meet the inner left, right, and bottom card border. Images fill their area by default; open image adjustments and reduce Zoom to show more of the original. Front and back image positions are saved separately in workspace.json.

- Field madder (`Sherardia arvensis`, Rubiaceae): a low spreading annual with whorled leaves and small pink-lilac flowers. [UC IPM identification guide](https://ipm.ucanr.edu/weeds-identification-gallery/field-madder/). Native Plant Society of Texas lists it as a naturalized annual in the [Garey Park species list](https://cms3.revize.com/revize/georgetowntx/Documents/Parks/Garey%20Park/Visit/Garey%20Park%20Species%20List/Species-List-for-Garey-Park-Plants.pdf).

## Native marker

The Native checkbox controls a fixed green N badge at the upper right on both layouts. It means native to our Texas campus region. The starter checks green anole and Texas bluebonnet, and leaves the introduced seven-spotted ladybug and field madder unchecked. CSV stores this as a `native` column with `true` or `false`; imports also recognize yes/no and 1/0. SVG templates keep the checkbox definition on a text element with `data-input="checkbox"`, `data-checked-text="N"`, and a wrapping group with `data-visible-if="native"`. All badge artwork stays editable in the SVG.

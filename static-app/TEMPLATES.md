# Building and editing SVG templates

## Visual template builder

Choose **Edit template** in Template layout. The builder opens the selected front or back; a card with its own imported layout edits that card's layout. A project that fixes its allowed templates disables this action.

Select an element on the canvas or in **Elements**. Drag to move it, use the corner handle to resize, or enter precise positions and sizes. All measurements use points (72 pt = 1 inch); the card is 180 × 252 pt, or 2.5 × 3.5 inches. Hold **Shift or Ctrl** while dragging a resize corner to scale the whole element proportionally, including text. Without a modifier, shapes resize freely and text blocks change their wrapping box. Arrow keys move the selected element by 1 pt; hold Shift for 10 pt. Existing SVG artwork and transforms are retained. Use **+ Field**, **+ Label**, or **+ Rectangle** to add elements, and the inspector to set fonts, colors, alignment, and layer order. A field's Data key identifies its CSV column; its Field name labels the card-data input. Renaming a Data key changes the binding, so use an existing column name to retain its values.

Text fields offer **Wrap**, **Shrink to one line**, and **Wrap, then shrink to box**. Set width, optional box height, maximum lines, minimum font size, and line spacing. **Line spacing (× font size)** is a multiplier: 1.2 gives 12 pt between baselines at a 10 pt font, or 18 pt at 15 pt. It follows both font-size edits and automatic shrinking. Existing absolute spacing is shown as its equivalent multiplier and converted when you edit spacing or font size. Fit-to-box without a height uses the maximum line count as its limit. Text that still cannot fit is reported rather than shortened or hidden. **Bottom limit** reports text extending below a chosen vertical coordinate, such as the top of the illustration.

Use **Position & size → Relative to** with **Below** to position a field below another field's actual rendered height, using the chosen gap. This allows a common name to wrap while moving the scientific-name line and categories down. Existing templates with `data-flow-after` remain supported and show their target and gap in these same controls. Moving a field manually detaches it from automatic placement. The image frame stays fixed.

**Append field** combines another data field into the selected text block. For example, select Scientific name, append Family, and use ` (` before the appended value and `)` after it. The scientific-name style is preserved and the appended family defaults to regular, upright type. Empty appended values omit their punctuation. If the appended field had its own text element, that element is merged into this block; its data remains separately editable in Card data. Undo reverses the merge.

Labels also have **Append field**. For example, add a label with **Label text → Family:** and choose **Append field → Family**. Set the text before/after the value to control spaces and punctuation. The label stays visible when the field is empty; the appended value uses regular type, so a bold or italic label can accompany an upright value. The combined label supports the same width, fitting, line spacing, and vertical flow settings as fields. References share one Card data input, and existing standalone field elements stay in place; delete an unwanted standalone element if you want only the labeled version. Detaching the field with None restores a plain label. Template SVGs and project ZIPs retain the label text and binding.

**Appended field style** controls the value separately: font family, optional font size, bold, italic, and color. A blank font size matches the main text; an explicitly chosen size scales along with the main text during automatic shrinking. Wrapping uses the larger font size for line spacing so mixed-size lines have room. **Appended color source** can match the main text, use a fixed color, follow a theme role, or define a new role. Shared role defaults update both ordinary fills/strokes and appended values using that role. Independent font and color settings are retained in template SVGs, card SVGs, project ZIPs, and print sheets.

For any label or text field, **Position & size → Relative to** chooses another element, including text blocks, artwork frames, shapes, and badge groups. Choose Below, Above, Right of, Left of, or Align with, then set alignment, gap, and horizontal/vertical offsets in card points. Start/center/end alignment applies across the placement direction; Align with aligns both axes and ignores gap. Relative positions follow actual rendered bounds, including wrapped text and transformed groups. Plain labels do not need an appended field to use this feature. Chains are supported, and circular dependencies are rejected. Fixed position, manual dragging, or entering X/Y detaches a label while keeping its visible position. Clicking to select, including slight pointer movement, preserves the relative link; dragging begins after 4 screen pixels. Delete a referenced element only after detaching its dependent labels. References use ordinary SVG IDs generated by the builder when needed, and travel inside the SVG with the rest of the template.

**Current card** previews actual card data and artwork using template colors. **Placeholders** previews field keys and makes optional badges visible. **Fill theme role** and **Stroke theme role** show the SVG's existing variable names, such as `text`, `accent`, `background`, or `panel`. Choose a role to follow card themes, **Fixed color** for a color independent of themes, or **New theme role…** to define a custom name. Changing **Default for text** (or another role) updates all fills and strokes using that role in this template and retains the role binding. Fixed-color edits affect only the selected element. No fill/stroke keeps the role assignment while disabling that paint. Role names and defaults are saved in the SVG and project ZIP. Custom roles fall back to the template default when a named theme does not define them. Liberation Sans is bundled in finished card SVGs; other font choices require the receiving computer to have that font installed.

**Upload template** opens an existing compatible template SVG, including older templates. **Download template** writes one reusable SVG containing its fields, layout, and fitting settings; no companion settings file is required. Finished card SVGs are opened with Import cards, not with the template builder. **New template** starts a blank card with a name field and artwork frame.

**Apply to front/back template** updates that side in the current project. Other cards with their own imported front layouts retain those layouts. Close or Escape leaves the project unchanged; unfinished edits are saved as a separate browser draft, with **Restore draft** offered the next time the builder opens. Undo/redo is available during the builder session. Download templates or save the project ZIP for permanent copies; clearing browser storage also clears drafts. **Save project** carries the edited templates, their settings, CSV, and graphics together. The studio, print sheets, individual SVGs, and SVG sets all use the same text layout engine.

To replace a hosted starter layout, download the edited template from inside the builder, then replace the exact SVG named in the project's `manifest.json`. The Field Guide back uses `projects/field-guide/templates/field-guide-back.svg`. **Reload project layouts** reads the project layouts while retaining card data and artwork; **Restore starter examples** also resets the cards and artwork. The main page's **Download template SVG** exports the applied layout, so apply builder edits first when using that button.

## Editing in Inkscape

The built-in SVG files in `templates/` are ordinary, visible SVG drawings. Their text shows placeholder values such as `{{common_name}}`. All colors are real hex colors so the artwork is usable in Inkscape. Small `data-*` attributes identify what the editor should replace.

## Tune an existing template

1. In **Your cards**, choose a **Template layout** and click the download icon beside it (tooltip: **Download template SVG**), or open its file in `templates/`.
2. In Inkscape, move or restyle the existing text objects, image rectangle, backgrounds, borders, and other artwork. Keep the page at 2.5 × 3.5 inches and its SVG viewBox at `0 0 180 252`.
3. Keep the placeholder text objects as **text**, rather than converting them to paths. Keep their `data-*` attributes. Use Inkscape's XML Editor to adjust field limits or add new tagged fields.
4. Save as SVG or Plain SVG. Use **Open template SVG** in Your cards to open the edited SVG and check the preview with your actual content. Groups and transforms, inline styles, local gradients, and local clipping paths are supported. External images, scripts, animation, and CSS style blocks are removed on import. Inline styles created by Inkscape are preserved.

The browser uses the geometry and font styling in the SVG. If you change a font, it must exist on the student's device or be bundled locally into the site; the provided Liberation Sans font is bundled for consistent offline previews.

## Text placeholders

A text object looks like this:

```xml
<text id="common_name"
      data-field="common_name" data-label="Common name"
      data-width="154" data-lines="2" data-max-chars="48"
      data-line-spacing="1.2" data-required="true"
      x="13" y="22" font-family="Liberation Sans, sans-serif"
      font-size="11" font-weight="bold"
      fill="#244734" data-color-fill="text">{{common_name}}</text>
```

- `data-field` is the CSV column key and editor field identifier. Use a unique lowercase key (letters, numbers, underscores; start with a letter).
- `data-label` is the field's visible name in the editor.
- `data-width` is the text's wrapping width in SVG units. `data-lines` is its allowed line count. These limits stay explicit so moving an object in Inkscape does not silently change how much text fits.
- `data-max-chars` is a content limit; imported content is preserved even if it exceeds this limit.
- `data-line-spacing` is baseline spacing as a multiple of the current font size. Omit it for 1.2. Older templates using `data-line-height` in SVG units keep their existing spacing; the multiplier takes precedence if both are present.
- `data-required="true"` requires text before finished-card export.
- The editor uses the text object's `x`, `y`, transforms, font size, family, weight, style, and alignment. Inkscape's first `tspan` can also supply its position and font styling. Keep the text as one placeholder object; the editor replaces its lines with measured text.

Use 1–12 text fields. The field list in the editor and saved project CSV are generated from these attributes. Adding a new field to the SVG adds it to both.

## Image placeholder

```xml
<rect id="artwork" data-image="artwork"
      x="13" y="64" width="154" height="66" rx="4"
      fill="#ffffff" data-color-fill="picture"/>
```

Move or resize this rectangle in Inkscape to adjust the image frame. Rounded corners and transforms are retained. The browser inserts the user's image over this rectangle and clips it to its geometry. Add `data-image-fit="contain"` to keep the entire image visible; otherwise artwork fills/crops the frame by default. Add `data-placeholder="true"` to a label such as `{{image}}` if that label should disappear from a finished card. Use one image frame per template. Image zoom and position are preserved in project workspace settings; this does not remove white pixels from an image.

## Color placeholders

Add `data-color-fill="background"` or `data-color-stroke="accent"` to elements that should use an editor color. Keep a normal SVG color in the actual fill/stroke or inline style; hex, RGB, HSL, and named colors are accepted, including colors serialized by Inkscape. The color picker converts these to hex. Transparency and fill/stroke opacity are preserved. Paints set to `none` or a local gradient stay as authored and are not replaced by a solid editor color.

```xml
<rect width="180" height="252" fill="#eef3e8"
      data-color-fill="background"/>
```

The template defines the role names; the app discovers them from these attributes. Use lowercase names starting with a letter, followed by letters, digits, hyphens, or underscores (up to 30 characters). The first tagged element with a usable solid fill/stroke for each role sets its default. If other elements share that role but have different colors, the first color wins without a warning. Give them separate roles if their colors should differ. The editor replaces all tagged elements for that role with the chosen color. Untagged colors retain your Inkscape edits. Changing default colors in Inkscape therefore changes what the editor starts with.

## Add a built-in template

1. Duplicate a template SVG in `templates/` and edit it. Set the root's `data-title` to the new template name.
2. Add an entry to `templates/catalog.json`, for example:

```json
{"id":"pond-guide","title":"Pond guide","svg":"pond-guide.svg"}
```

3. Publish the updated static-app folder. Keep the versioned `studio.js` URL in `index.html` and the service-worker precache list aligned. Increment the cache name in `sw.js` when publishing template or application changes so existing browsers install the revised offline files.

Students select built-in templates without uploading a layout. You can also open an edited template SVG locally before publishing it. Each template needs only its SVG and catalog entry. The editor reads fields from the SVG and generates the card-data CSV when you save a project. To open existing card data, include its CSV in a project folder with a manifest and referenced artwork, then open the complete folder or ZIP.

## Template SVG versus finished card SVG

The download icon exports the tagged layout with placeholders and original template colors. **Download card** exports the current finished card with text, chosen colors, image, and fonts embedded. The app rejects finished cards through Open template SVG; use a project folder/ZIP to resume editing card data. Save project includes the selected template SVG as a separate readable file and current card data in CSV.

Named palettes and custom per-card colors are stored in the CSV `theme` column. A custom value such as `custom:background=#ffffff;accent=#244734` uses this template's role names. Changing a color in the editor affects the current card. Untagged colors remain part of the SVG layout.

## Element Explorer

Choose **Element Explorer** in the Template layout picker for periodic-table cards. Atomic number, chemical symbol, and element name are required. Optional fields are atomic mass, element family, group, period, state at room temperature, everyday use, and a short fun fact. The image frame is for a familiar object or illustration connected to the element.

Use the accent color for element families and write the family name in the strip, so meaning remains clear in grayscale. Keep everyday uses to three short lines and fun facts to two. Group may be left blank when it does not apply. Image filename, copies, and theme are supplied by the app when saving the project CSV.

## Two-sided Field Guide

Open `?project=field-guide` for the opt-in two-sided editor. Its `manifest.json` uses `cardBack.svg` to name an editable back layout and `editableTemplates: true` to let students reopen edited SVGs in the studio. That layout's `data-field` keys appear as additional CSV columns and are edited when **Back** is selected. A `back_image_filename` CSV column can provide separate artwork for each card's back; when absent, the front image is reused. A project with `cardBack.image` continues to use a shared back image and does not show side controls.

The Field Guide project keeps its front SVG at `templates/field-guide-front.svg` and its back SVG at `templates/field-guide-back.svg`. Students can download and reopen each side separately. Keep front/back field keys distinct except for a shared key such as `common_name`; each SVG must remain a 2.5 × 3.5 inch card and retain its `data-field` / `data-image` tags. Its scientific name and family fields share a line through `data-after-field`, `data-prefix`, and `data-suffix` on the family text. Print sheets render each back from that card's values and reference graphic, and mirror the columns for short-edge duplex.

Images always cover their SVG image area by default, including templates that previously used `data-image-fit="contain"`. Students can reduce Zoom below 1 to show more of the image. Field Guide saves separate front and back image adjustments in `workspace.json`.

### Checkbox fields

A `text[data-field]` can set `data-input="checkbox"` and `data-checked-text="N"` to show a checkbox in Card data and a symbol when checked. Store values as `true`/`false` in CSV; `yes`, `1`, and `on` are also recognized as checked. Wrap its icon in `g data-visible-if="field_key"` to hide the full icon when unchecked. The Field Guide native badge is an editable example.

In the builder, select **Native badge** in Elements to move or resize its circle and letter as a group. Its indented child elements let you change the circle's colors or the letter's font. The checkbox field's **Input type** is Checkbox, and **Checked symbol** sets the displayed letter or symbol; an empty symbol draws no text. **Show when → Native is checked** controls the whole group. Other elements can also use Show when to follow a checkbox. Inside a conditional group, Always applies only within that group; the parent condition still controls its children. **Edit conditional group** selects that parent directly.

Hidden elements stay listed in Elements. Selecting one temporarily shows its required checkbox values as checked in the builder, with a notice that card data is unchanged. **Show conditional elements** reveals all such elements for editing; uncheck it and select an unconditional element to return to the current card's actual appearance. Neither this preview switch nor selecting a hidden badge changes card values or exported visibility.

**+ Badge** creates a circle, checkbox-symbol field, and conditional group together. Rename its field and data key, set its checked symbol, and style its circle. Applying the template adds the new checkbox to Card data. Renaming a checkbox's data key updates visibility conditions in that template. Deleting a checkbox used by another element, or converting it to Text, requires first setting those elements' Show when to Always. Undo/redo, template downloads, and project ZIPs retain badge geometry and conditions.

# Editing SVG templates in Inkscape

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
      data-line-height="13.2" data-required="true"
      x="13" y="22" font-family="Liberation Sans, sans-serif"
      font-size="11" font-weight="bold"
      fill="#244734" data-color-fill="text">{{common_name}}</text>
```

- `data-field` is the CSV column key and editor field identifier. Use a unique lowercase key (letters, numbers, underscores; start with a letter).
- `data-label` is the field's visible name in the editor.
- `data-width` is the text's wrapping width in SVG units. `data-lines` is its allowed line count. These limits stay explicit so moving an object in Inkscape does not silently change how much text fits.
- `data-max-chars` is a content limit; imported content is preserved even if it exceeds this limit.
- `data-line-height` is baseline spacing in SVG units. Omit it for 1.2 × the font size.
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

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

Move or resize this rectangle in Inkscape to adjust the image frame. Rounded corners and transforms are retained. The browser inserts the user's image over this rectangle and clips it to its geometry. Add `data-placeholder="true"` to a label such as `{{image}}` if that label should disappear from a finished card. Use one image frame per template. Uploaded artwork fills/crops the frame by default. Image zoom and position are preserved in project workspace settings; this does not remove white pixels from an image.

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

3. Create `templates/pond-guide.csv` with the SVG field keys plus `image_filename`, `copies`, and `theme` as headers and one blank starting row (`copies` = 1). The offline cache expects this companion CSV. There is no template-CSV download control in the editor.
4. Publish the updated static-app folder. Keep the versioned `studio.js` URL in `index.html` and the service-worker precache list aligned. Increment the cache name in `sw.js` when publishing template or application changes so existing browsers install the revised offline files.

Students select built-in templates without uploading a layout. You can also open an edited template SVG locally before publishing it. The provided companion CSV files contain headers and a blank row. To use one as project data, fill in rows and include it in a project folder with a manifest and its referenced artwork, then open the complete folder or ZIP.

## Template SVG versus finished card SVG

The download icon exports the tagged layout with placeholders and original template colors. **Download card** exports the current finished card with text, chosen colors, image, and fonts embedded. The app rejects finished cards through Open template SVG; use a project folder/ZIP to resume editing card data. Save project includes the selected template SVG as a separate readable file and current card data in CSV.

Named palettes and custom per-card colors are stored in the CSV `theme` column. A custom value such as `custom:background=#ffffff;accent=#244734` uses this template's role names. Changing a color in the editor affects the current card. Untagged colors remain part of the SVG layout.

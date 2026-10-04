# Static projects

Publish each project in `projects/<slug>/manifest.json` under the static site's root. Open `?project=<slug>` (for example `?project=houston-food-web`). Slugs use lowercase letters, digits, hyphens, and underscores. All paths are relative, so deployment under a site subdirectory works too.

```json
{
  "version": 1,
  "name": "My classroom project",
  "description": "Make a card for our game.",
  "templates": [
    "food-web",
    {"id": "local-card", "title": "Our card", "svg": "templates/card.svg"}
  ],
  "colorSchemes": [
    "Template", "Sage",
    {"name": "Ocean", "colors": {"background": "#eef6ff", "accent": "#246699"}}
  ],
  "starter": {
    "template": "food-web", "scheme": "Sage",
    "values": {"common_name": "Your organism"}
  },
  "placeholders": {"mechanic_1": "Describe an ecosystem action"},
  "cardBack": {"image": "card-back.png", "description": "Game card back"},
  "files": [
    {"type": "markdown", "title": "Rules", "path": "rules.md"},
    {"type": "download", "title": "Card data", "path": "cards.csv"}
  ]
}
```

- `templates`: allowed built-in catalog IDs or project-local SVG descriptors with unique IDs. Local SVGs use the same conventions as [TEMPLATES.md](TEMPLATES.md). Omit to allow all built-in templates.
- `colorSchemes`: allowed built-in names (`Template`, Sage, Sky, Sand, Rose, Lavender, Ink) or custom objects with unique names and six-digit hex colors keyed by SVG color role. Unspecified roles retain the template's colors. Omit to allow all standard schemes. Individual color editing is hidden in project mode.
- `starter`: initial template, scheme, and text values. Defaults are applied on first opening; values also populate new cards and Start over. The first allowed template/scheme is used when unspecified. Defaults never replace recovered student edits.
- `placeholders`: input hints keyed by the SVG's `data-field` names. Hints are not card text and are not exported.
- `cardBack`: optional object with a project-relative `image` path (PNG, JPG, or WebP; under 12 MB and 25 megapixels) and optional `description`. Printing includes alternating front/back pages with mirrored columns for landscape short-edge duplex. Each used slot receives the same back, including copies; unused slots stay blank. Images fit inside the 2.5 × 3.5 inch card without cropping or stretching, so a 5:7 image is ideal. The image is embedded in the print document and loaded before the print button is enabled. Missing/unreadable images stop printing with an error. Omit this option for front-only sheets.
- `files`: an extensible resource list. Markdown entries render inside the editor; other types download their file. Paths stay inside the project folder. Subfolders work. Additional descriptor metadata and additional manifest keys are preserved for future consumers, and unlisted files may live alongside these resources.

Markdown supports headings, paragraphs, ordered/unordered lists, tables, bold, italics, inline code, fenced code, links relative to the document, and `:::pagebreak` as a divider. Raw HTML renders as text; active link protocols are restricted to HTTP/HTTPS. This is a small built-in renderer with no CDN dependency. Documents load when opened; download entries do not automatically import cards or images.

Projects use separate localStorage checkpoints and IndexedDB image databases. Normal editor recovery keeps its original keys. Saved editable copies and shared starter links must use an allowed template and scheme when opened within a project. Starter links preserve the `project` query parameter. Missing or invalid projects show an error rather than loading unrelated defaults. If browser recovery is incompatible with the current project or damaged, the editor offers **Download saved work** and **Start fresh**. The saved checkpoint stays untouched until Start fresh initializes the current project defaults. Other workspaces are unaffected.

The service worker caches project manifests, templates, and resources as they are fetched. Open needed documents and download resources while connected before expecting them offline; copying a folder to the host does not pre-cache every file in it.

## Private folder and ZIP imports

In **More tools → Import a local project**, use **Choose project folder** or **Open project ZIP**. Files are read on your device and stored in IndexedDB in this browser. They are never uploaded or added to Git. The app opens a separate local workspace for each import and leaves your previous cards intact. Local workspace URLs work only in the browser where you imported the project.

Select a folder containing exactly one `manifest.json`, or ZIP that folder with standard ZIP compression. A ZIP may contain the files at its root or inside one enclosing folder. Paths in the manifest and image filenames may start with `./` (for example `./templates/card.svg` or `./graphics/leaf.png`). Parent-directory paths (`../`) remain unsupported. Keep the manifest's relative directory structure, including custom templates, documents, CSV files, images, and any card back. Built-in template IDs remain supported. ZIP import supports stored and deflated entries, verifies checksums, and rejects encrypted, multipart, ZIP64, damaged, or unsafe archives. It requires browser support for `DecompressionStream('deflate-raw')`; folder import is the fallback.

A single CSV is imported automatically. If you include several CSV files, add a root manifest property such as `"csv": "data/cards.csv"` to select the card data. A CSV does not have to appear in the manifest's resource list. Existing field-name/label column matching, quantities, and allowed color themes apply; you can adjust column matches after importing. Images in `image_filename` match a full path relative to the manifest (for example `graphics/leaf.png`), or a basename such as `leaf.png` when that basename is unique. Missing or ambiguous image names stop the import. PNG, JPG, and WebP assets are included automatically. Markdown resources and their relative file links use the imported files.

Validation completes before the new workspace is saved or opened. Limits: 2,000 files, 100 MB total unpacked files, CSV under 2 MB with at most 500 card rows, and each image under 12 MB / 25 megapixels. Browser storage must have room for the project; failure leaves your current workspace unchanged. Once the app's service worker has installed, local projects can recover offline, including documents and card backs.

**Save editable copy** includes your edited cards, image data, manifest, and original project files in one JSON backup. **Open saved work** can restore that backup in another browser or on another device without hosting the project. Keep a downloaded backup because clearing browser storage removes local recovery. Folder-picker availability varies by device; ZIP import provides a single-file option for tablets.

Run the import browser checks with:

```bash
.venv/bin/python scripts/local_projects_smoke.py
```

## Houston Food Web Game

Open `?project=houston-food-web`. The project uses `templates/food-web.svg` and contains unchanged copies of the v1 turn guide, card CSV, graphics folder, and complete expansion pack from `demo/v1/`. The editor offers rendered rules and expansion instructions, CSV downloads, and ZIP downloads of the original graphics and expansion pack. The expansion guide is the original demo guide and describes the older teacher app; in this static editor, import CSV using **More tools → Cards from a spreadsheet**, then upload matching PNGs using **Choose an image**. Match `binomial_name` to Scientific name and `categories` to Category in the CSV column controls.

## Validation

From the repository root, with development dependencies and Chrome installed:

```bash
.venv/bin/python scripts/static_projects_smoke.py
```

Checks ordinary editor behavior, project recovery isolation, rendered rule tables, missing/invalid projects, project-local templates, custom schemes, starter values, and editable-copy round trips.

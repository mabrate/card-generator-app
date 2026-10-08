# Static projects

Publish each project in `projects/<slug>/manifest.json` under the static site's root. Open `?project=<slug>` (for example `?project=houston-food-web`). Slugs use lowercase letters, digits, hyphens, and underscores. All paths are relative, so deployment under a site subdirectory works too.

```json
{
  "version": 1,
  "name": "My classroom project",
  "description": "Make a card for our game.",
  "csv": "cards.csv",
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
  "cardBack": {"image": "graphics/card-back.png", "description": "Game card back"},
  "files": [
    {"type": "markdown", "title": "Rules", "path": "rules.md"},
    {"type": "download", "title": "Card data", "path": "cards.csv"}
  ]
}
```

- `csv`: canonical card-data path. Local folder/ZIP import detects a single CSV when omitted; several CSVs require an explicit path. Save project preserves the selected CSV filename/path and writes it into the exported manifest. A new workspace uses `cards.csv`. Hosted project URLs automatically load this CSV and its referenced artwork when no edited workspace is recovered. Untouched blank checkpoints from older versions are seeded once. Saved edits and explicit Start fresh resets are preserved.
- `imageDirectory`: artwork directory for bare CSV filenames on hosted project URLs; defaults to `graphics`. Full relative image paths are used as written. Local folder/ZIP imports resolve unique basenames against included images.
- `workspace`: optional relative path to version-1 editor settings, normally `workspace.json`. Starter projects can omit it.
- `templates`: allowed built-in catalog IDs or project-local SVG descriptors with unique IDs. Local SVGs use the same conventions as [TEMPLATES.md](TEMPLATES.md). Omit to allow all built-in templates.
- `colorSchemes`: allowed built-in names (`Template`, Sage, Sky, Sand, Rose, Lavender, Ink) or custom objects with unique names and six-digit hex colors keyed by SVG color role. Unspecified roles retain the template's colors. Omit to allow all standard schemes. Individual color editing is available for the current card. CSV `theme` values may also specify validated custom colors; see the saved-workspace section below.
- `starter`: initial template, scheme, and text values. Defaults are applied on first opening; values also populate new cards and Start fresh. The first allowed template/scheme is used when unspecified. Defaults never replace recovered student edits.
- `placeholders`: input hints keyed by the SVG's `data-field` names. Hints are not card text and are not exported.
- `cardBack`: optional object with a project-relative `image` path (PNG, JPG, or WebP; under 12 MB and 25 megapixels) and optional `description`. Printing includes alternating front/back pages with mirrored columns for landscape short-edge duplex. Each used slot receives the same back, including copies; unused slots stay blank. Images fit inside the 2.5 × 3.5 inch card without cropping or stretching, so a 5:7 image is ideal. The image is embedded in the print document and loaded before the print button is enabled. Missing/unreadable images stop printing with an error. Omit this option for front-only sheets.
- `files`: an extensible resource list. The Project documents and files section is hidden when this list is empty. Markdown entries render inside the editor; other types download their file. Paths stay inside the project folder. Subfolders work. Additional descriptor metadata and additional manifest keys are preserved for future consumers, and unlisted files may live alongside these resources.

Markdown supports headings, paragraphs, ordered/unordered lists, tables, bold, italics, inline code, fenced code, links relative to the document, and `:::pagebreak` as a divider. Raw HTML renders as text; active link protocols are restricted to HTTP/HTTPS. This is a small built-in renderer with no CDN dependency. Documents load when opened; download entries do not automatically import cards or images.

Projects use separate localStorage checkpoints and IndexedDB image databases. Normal editor recovery keeps its original keys. Saved editable ZIPs open as separate local projects. Shared starter links must use an allowed template and scheme when opened within a project. Starter links preserve the `project` query parameter. Missing or invalid projects show an error rather than loading unrelated defaults. If browser recovery is incompatible with the current project or damaged, the editor offers **Download saved work** and **Start fresh**. The saved checkpoint stays untouched until Start fresh initializes the current project defaults. Other workspaces are unaffected.

The service worker caches project manifests, templates, and resources as they are fetched. Open needed documents and download resources while connected before expecting them offline; copying a folder to the host does not pre-cache every file in it.

## Private folder and ZIP imports

Beside the preview, use **Open project folder**, then choose a folder or ZIP. Files are read on your device and stored in IndexedDB in this browser. They are never uploaded or added to Git. The app opens a separate local workspace for each import and leaves your previous cards intact. Local workspace URLs work only in the browser where you imported the project.

Select a folder containing exactly one `manifest.json`, or ZIP that folder with standard ZIP compression. A ZIP may contain the files at its root or inside one enclosing folder. Paths in the manifest and image filenames may start with `./` (for example `./templates/card.svg` or `./graphics/leaf.png`). Parent-directory paths (`../`) remain unsupported. Keep the manifest's relative directory structure, including custom templates, documents, CSV files, images, and any card back. Built-in template IDs remain supported. ZIP import supports stored and deflated entries, verifies checksums, and rejects encrypted, multipart, ZIP64, damaged, or unsafe archives. Compressed ZIP import requires browser support for `DecompressionStream('deflate-raw')`; folder import is the fallback. ZIPs saved by the app use uncompressed entries and do not require that decompressor.

A single CSV is imported automatically. If you include several CSV files, add a root manifest property such as `"csv": "data/cards.csv"` to select the card data. A CSV does not have to appear in the manifest's resource list. Automatic field-name/label column matching, quantities, and allowed color themes apply. Images in `image_filename` match a full path relative to the manifest (for example `graphics/leaf.png`), or a basename such as `leaf.png` when that basename is unique. Missing or ambiguous image names stop the import. PNG, JPG, and WebP assets are included automatically. Markdown resources and their relative file links use the imported files.

Validation completes before the new workspace is saved or opened. Limits: 2,000 files, 250 MB total unpacked files, CSV under 2 MB with at most 500 card rows, and each image under 12 MB / 25 megapixels. Browser storage must have room for the project; failure leaves your current workspace unchanged. Once the app's service worker has installed, local projects can recover offline, including documents and card backs.

**Save project** includes your current CSV card data, images, template SVGs, manifest, workspace settings, and original project resources in one ZIP. **Open project folder** can restore that ZIP in another browser or on another device without hosting the project. Keep a downloaded backup because clearing browser storage removes local recovery. Folder-picker availability varies by device; ZIP import provides a single-file option for tablets.

Run the import browser checks with:

```bash
.venv/bin/python scripts/local_projects_smoke.py
```

## Houston Food Web Game

Open `?project=houston-food-web` to load the base deck automatically: 22 card types, 48 copies, artwork, rules, and the game back. Its manifest selects `cards.csv` and `graphics/`. Existing saved edits take precedence. The expansion is a separate project at `?project=houston-food-web-expansion`; it is not added automatically. Houston offers Open and Add actions for the linked pack. See the project's [README](projects/houston-food-web/README.md) for the complete workflow.

## Validation

From the repository root, with development dependencies and Chrome installed:

```bash
.venv/bin/python scripts/static_projects_smoke.py
.venv/bin/python scripts/published_projects_smoke.py
```

The published-project check covers automatic CSV/artwork loading, 22 cards/48 copies, upgrading untouched blank checkpoints, retaining edits, ZIP export paths, first-visit offline recovery, and reset preservation. The layout check covers template selection/download and recovery, the project-open dialog, card-back control placement, bottom reset confirmation, and desktop/mobile layout. The local-project check above covers folder/ZIP imports, updated CSV data and original filenames, graphics paths without root aliases, documents, quantities, custom themes, crops/drawings, card backs, fresh-browser reopening, offline recovery/printing, and invalid import preservation.

## Saved-workspace structure

```text
manifest.json
campus-food-web-cards.csv     # original CSV filename is retained
workspace.json
templates/card.svg
graphics/organism.png
graphics/drawing-<card-id>.png
graphics/card-back.png
rules.md
```

Save project writes one uncompressed ZIP containing current edits and project resources. The original folder remains untouched. Newly added images, drawings, and card backs use `graphics/`; existing artwork keeps its folder path. Basename aliases are for lookup only, so exporting does not create duplicate root images. CSV image references and manifest image/resource references are updated to the exported paths.

The CSV is canonical for text, stable unique `card_id` values, copies, artwork filenames, and themes. Extra imported columns survive. If a recognized alias column is also present, export updates it alongside the canonical column. Copies must be integers from 1 to 600. A theme can be a named allowed scheme or a custom string such as `custom:background=#ffffff;accent=#244734`. Custom role names must exist in the selected template; duplicate roles and invalid colors stop import. Exports include all effective role colors when no named palette matches.

The manifest sets `workspace` to `workspace.json`. Its `version` is 1, with `activeCardId`, `workspaceColors`, `workspaceScheme`, and `cards` keyed by CSV card ID. Per-card settings hold `crop` (`x`/`y` from 0 to 1 and `zoom` from 1 to 4), optional `drawingFile`, `drawingActive`, and `csvImportId`. It contains no embedded image data, SVG XML, or duplicate card text/quantities/themes. Without settings, the importer uses defaults.

Define card back in the preview selects/replaces an image; Remove card back switches to front-only printing. Save project includes the selected image and writes `cardBack.image` into the manifest, or removes the setting when the back was removed. Old single-file JSON backup import/export has been removed. A recovery-error ZIP is a troubleshooting checkpoint, not a guaranteed reopenable project.

CSV columns match SVG `data-field` keys; `data-label` controls the editor label. Scientific names use `scientific_name` in the built-in food-web project. Imports also recognize `binomial_name`; an exact field-key match takes priority. A loading banner appears while the workspace, project cards, and artwork open.

## Expansion projects

Store published expansions as sibling projects, such as `projects/houston-food-web-expansion/`, with exactly one manifest per package. Each package contains only its additional cards and all required local artwork, templates, and any chosen back or rules snapshot. Preserve card IDs when releasing updates; keep base cards out of expansion CSVs.

Expansion manifests use the normal version-1 project format plus:

```json
{
  "id": "houston-food-web-expansion",
  "packageVersion": "1.0.0",
  "expansion": {
    "baseProjectId": "houston-food-web",
    "basePackageVersion": "1.0.0"
  }
}
```

`version` identifies the manifest format; `packageVersion` identifies the content release using major.minor.patch. Base projects should also declare `id` and `packageVersion`. Compatibility records the intended exact base release; different or unknown projects/versions show a review notice, without silently treating the pack as compatible.

A base manifest can link published packs using `"expansions": [{"id": "houston-food-web-expansion", "name": "Houston Food Web Expansion"}]`. These IDs resolve to sibling project URLs, not files outside the base package. Resource paths under `files` still stay inside their own package. Linked packs are not automatically bundled into a base-project ZIP.

**Open project folder** opens a pack in its own workspace for editing. **Add expansion** reads a folder or ZIP and opens the same review used by individual SVG imports. It preselects the pack's name as the expansion group, checks existing/batch IDs, offers explicit conflicts, and appends accepted cards. The current project, template defaults, card back, and documents remain the destination's. Published base projects also offer a direct Add action for linked packs. Repeated imports default to Skip; Undo last import restores the preceding workspace.

Save project packages all accepted cards, editable layouts, and artwork. `workspace.json` includes per-card expansion labels and an `expansionPacks` registry keyed by imported pack ID, recording its name, package version, and intended base project/version. This registry is saved only when cards are accepted. The manifest and CSV remain normal project files, so the combined output can be reopened or used as the static site's project files. Expansion documents and a separate nested manifest are not inserted into the combined package.

Expansion browser coverage: `.venv/bin/python scripts/expansion_projects_smoke.py` checks standalone pack loading, hosted/folder/ZIP append, repeat/conflict handling, undo, stable base IDs, combined ZIPs, and rejected invalid packages.

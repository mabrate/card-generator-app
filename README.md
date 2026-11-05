# Classroom Cards

A browser-based card editor for classroom projects. The application lives in [`static-app/`](static-app/), which is the complete deployable site. There is no account system, database, teacher backend, API, or JavaScript build step. Work is recovered in the browser and saved as a portable project ZIP.

## Run locally

Python 3.10+ is sufficient; no packages or virtual environment are required:

```bash
python3 run.py
```

Open **http://127.0.0.1:8765/**. Stop with Ctrl+C. The server serves only `static-app/`, regardless of your working directory. Repository files and former server data are outside its document root.

For other devices on your classroom LAN:

```bash
python3 run.py --host 0.0.0.0 --port 8765
```

Open `http://<the server computer's LAN IP>:8765/` on each device. The app does not change network settings. `CARD_APP_HOST` and `CARD_APP_PORT` also set the defaults. The server must be reachable to initially load the app. HTTPS or localhost installs the offline service-worker cache; plain HTTP LAN addresses support browser recovery while connected but do not install that cache.

## Make and save cards

1. In **Template layout**, choose a default template layout. The adjacent download icon saves its template SVG; hover for **Download template SVG**. Use **Open template SVG** for your own edited layout where project restrictions allow it.
   **Edit template** opens the visual builder: drag/resize elements, set fonts and colors, add fields and labels, and configure wrapping, shrinking, or text that follows the field above. Upload/download a reusable template SVG in the builder, then apply it to the selected front or back. Unapplied work is recovered as a separate browser draft.
2. Add text, artwork, colors, and copy quantities. Use New card and the card selector for multiple cards.
3. The preview contains Download card, Print this card, Print all cards, and Define card back. Print sheets use saved quantities and include backs when selected. Save as PDF through the browser print dialog.
4. **Save project** creates an editable ZIP. **Open project folder** opens a dialog with a folder picker and a ZIP picker. Importing opens a separate browser workspace and does not overwrite the original folder.
5. **Start fresh** is a separate button at the page bottom and asks for confirmation.

The project CSV is canonical for card data. Saves preserve its imported filename/path; a new workspace uses `cards.csv`. The manifest identifies the CSV, templates, documents, and card back. `workspace.json` stores crop/drawing settings and the active card. New artwork goes under `graphics/`; imported folder paths are retained without duplicate files from short-name aliases. No images or SVG XML are embedded in the settings JSON.

Open `http://127.0.0.1:8765/?project=houston-food-web` to automatically load the base deck and artwork (22 card types, 48 copies). Published projects opt into loading with a manifest `csv` path and optional `imageDirectory`. Existing browser edits are preserved.

## Reference guides

The app footer opens readable Markdown references in new tabs:

- [App guide](static-app/README.md)
- [Project folders and ZIP format](static-app/PROJECTS.md)
- [SVG templates and Inkscape](static-app/TEMPLATES.md)
- [Houston Food Web project](static-app/projects/houston-food-web/README.md)
- [Game rules](static-app/projects/houston-food-web/campus-food-web-turn-guide.md)
- [Expansion guide](static-app/projects/houston-food-web-expansion/README.md)
- [Card-back artwork](static-app/projects/houston-food-web/card-back-artwork.md)

## Static hosting

Publish **only `static-app/`** as the site root. The existing GitHub Pages workflow uses that directory. Paths are relative, so hosting in a subdirectory is supported. No Python process is needed on a static host.

Keep the versioned studio script URL in `index.html` aligned with the service-worker precache list; bump the cache name in `sw.js` when releasing application changes. Browser recovery is tied to browser profile and site address. Download project ZIPs before moving hosts or clearing site data.

## Development checks

Browser checks use Playwright and Pillow, which are development dependencies only:

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m playwright install chromium
.venv/bin/python scripts/static_projects_smoke.py
.venv/bin/python scripts/local_projects_smoke.py
.venv/bin/python scripts/published_projects_smoke.py
```

The scripts use installed Google Chrome when available, otherwise Playwright's Chromium. They start the main `run.py` server on temporary localhost ports and check layout, reference pages, static serving, template controls, project import/export, filenames, artwork, colors, drawings, quantities, card backs, printing, offline recovery, and invalid-input preservation. They do not verify physical iPad or printer behavior.

The optional bulk SVG check uses Node.js with the Playwright npm package: `node scripts/bulk_svg_smoke.cjs`. It starts a temporary localhost server and checks the three export modes, numbered filenames, embedded artwork/fonts, current layouts and colors, missing-asset errors, ZIP reopening, and offline export. It uses Google Chrome by default; set `CHROME_BIN` to another Chromium executable if needed.

`node scripts/template_builder_smoke.cjs` uses the same browser setup to check template editing, pointer and keyboard movement, text fitting/flow, inline fields, undo/redo, draft recovery, template and card downloads, front/back editing, project ZIP reopening, and narrow layouts.

`node scripts/image_replacement_smoke.cjs` checks automatic image replacement on both sides, crop resets, drawing replacement, same-name shared-image isolation, invalid/cancel preservation, multi-file imports, browser recovery, and project ZIP reopening.

`node scripts/template_colors_smoke.cjs` checks theme-role bindings and shared defaults, fixed colors, custom roles, transparency and gradients, and template/project round trips.

`node scripts/template_badges_smoke.cjs` checks conditional groups, hidden-element editing without changing card values, badge styling and new checkboxes, saved visibility rules, checked/unchecked SVGs, printing, and ZIP/recovery round trips.

`node scripts/template_labels_resize_smoke.cjs` checks fields appended to labels, shared field bindings, empty values, proportional Shift/Ctrl resizing, point units, and SVG/print/project round trips.

`node scripts/template_relative_style_smoke.cjs` checks relative placements and wrapped-text chains, transformed targets, dependency guards, separate appended typography/theme colors, and SVG/print/project round trips.

`demo/` contains classroom content and historical source archives. It is not served by the app. `scripts/package_demo_art.mjs` is an optional archive-artwork utility, not a runtime requirement. The former server database/uploads (`data/`) and generated exports (`output/`) have been removed. Current work lives in browser storage and downloaded project ZIPs. The previous FastAPI/SQLite application, migrations, and backend-specific tests have been removed. Git history retains the earlier implementation.

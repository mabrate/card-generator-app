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

`demo/` contains classroom content and historical source archives. It is not served by the app. `scripts/package_demo_art.mjs` is an optional archive-artwork utility, not a runtime requirement. The former server database/uploads (`data/`) and generated exports (`output/`) have been removed. Current work lives in browser storage and downloaded project ZIPs. The previous FastAPI/SQLite application, migrations, and backend-specific tests have been removed. Git history retains the earlier implementation.

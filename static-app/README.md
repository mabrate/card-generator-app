# Classroom Cards app guide

This directory is the main and only application. Serve it as the site root on a static host, or run `python3 run.py` from the repository root. No Python application, database server, student account, or build step is required. Python below is only a convenient local file server.

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory static-app
```

From the repository root, run that command and open http://localhost:8765. When hosting under a subdirectory, all asset paths stay relative to that directory. Use HTTPS on a public host. On HTTPS or localhost, the service worker caches the app, fonts, and built-in templates after the first visit so it can reload without internet. Other plain-HTTP hosts support normal use and browser recovery while connected, but do not install an offline cache.

## Student view

Choose a starter in **Template layout**, then add words and artwork. Use **New card** to add cards and the arrows, dots, or title menu above the preview to select a card. Each card has its own copy count and colors.

The preview groups **Download card**, **Print this card**, **Print all cards**, and **Define card back**. Card-back preview and removal appear only when a back is selected. Save project and Open project folder sit below the print controls. Open project folder offers a folder picker or a saved ZIP picker. Project imports create separate browser workspaces.

**Template layout** includes template controls: choose a default starter, download the current template SVG using the icon beside the layout selector (hover for **Download template SVG**), or open an edited template SVG. Project-specific template restrictions still apply. Layout changes keep card text and artwork. Use Inkscape to edit the SVG's tagged elements, then reopen it here. See [TEMPLATES.md](TEMPLATES.md).

**Start fresh** stands alone at the bottom and asks for confirmation. Save your project before clearing work.

## Project data

CSV is the canonical card data file. Edit it in the project folder and reopen the folder or ZIP through **Open project folder**. Changes made in the editor are saved in browser recovery immediately; **Save project** writes those current values into the downloaded CSV. Opening a folder does not write changes back to your original files. There are no standalone CSV import/export controls. Save project writes all current edits to the project's CSV. Images referenced by the CSV must be included in the folder or ZIP.

## Card print sheets

Use **Print this card** for the current card using its saved quantity, or use **Print all cards** directly below it to print the whole workspace using each card’s saved quantity. The button opens a new browser tab containing the card SVGs, images, and fonts. Choose **Print / Save as PDF** in that tab. No HTML download is needed, and the editor stays open in its original tab. This also works offline after the app has been cached. If the browser blocks the new tab, allow pop-ups for the site and try again.

Sheets are Letter landscape (11 × 8.5 inches), with six 2.5 × 3.5 inch cards per page and square crop marks. Card order follows the workspace list; repeated copies follow each card. Print sheets are limited to 600 total card copies. Every selected card must have required text, fit the template's text limits, and have its referenced image available before export succeeds.

Choose Letter, landscape, actual size / 100%, no margins, and turn off headers and footers in the print dialog. Save as PDF there if you need a PDF file. Test your printer's physical dimensions before printing the full set. Print sheets contain fronts only when no card back is selected. A back chosen through **Define card back**, or provided by the project's manifest, adds alternating fronts and backs; use double-sided printing with **flip on the short edge** and test the first pair of pages.

The app preserves complete text and reports when it exceeds the template's character or line limits. It blocks finished-card export until text fits and referenced images are available. Image files are resized to a maximum of 1600 pixels on the longest side for browser storage. The original files stay on your device; the app's saved project contains the resized versions. The drawing canvas is saved as PNG.

The card SVG declares 2.5 × 3.5 inches and embeds its image and bundled Liberation Sans fonts. Print at 100% / actual size. Confirm physical size on your printer. Inkscape may use its installed fonts instead of SVG font embedding; install Liberation Sans if you want its text measurements to match the browser exactly.

## Browser recovery

Text, template, colors, selected card, and image positions are checkpointed in localStorage. Uploaded images and drawings live in IndexedDB. Recovery works on the same browser and site address, including after a reload. Clearing site data removes this workspace. Storage errors appear in the app; download a project backup to carry your work to another device or keep it permanently. Images are saved before their references are checkpointed. If saved work is incompatible with the current project or damaged, use the recovery panel to **Download saved work** or **Start fresh**. The recovery download is a troubleshooting ZIP containing the original checkpoint and available assets; it may need repair before reopening. Starting fresh uses the current workspace defaults and leaves other workspaces alone.

## Templates

The SVG is the complete layout, including text positions, fonts, shapes, color roles, and image geometry. There is no JavaScript field-guide layout overlay. Download a template, edit its existing elements in Inkscape, then reopen it in the editor. See [TEMPLATES.md](TEMPLATES.md) for the placeholder conventions and how to publish additional built-in templates.

Classroom Cards is browser-only. Share downloaded project ZIPs with your teacher; there are no server submissions or shared review queue. The former FastAPI/SQLite app has been removed. Nothing is uploaded to a service when students open project folders, ZIPs, or images.

## Project URLs

Open `?project=houston-food-web` for **Houston Food Web Game**. On first opening it automatically loads the base deck’s 22 card types, 48 copies, and artwork, alongside rules and the game back. Previously edited workspaces are recovered instead; untouched blank checkpoints from the earlier editor load the deck once. Expansion cards remain optional resources. Publish more project folders using [PROJECTS.md](PROJECTS.md). Without a project parameter, the normal editor and its existing browser recovery behave as before.

Project CSVs match `copies` (also `card_count`, `count`, or `quantity`) and `theme` (also `color_theme` or `color_scheme`). Blank counts default to 1, and counts must be whole numbers from 1 to 600. Invalid quantities or themes stop project import before changing the workspace. Save project preserves current quantities and colors in the CSV.

## File purposes

| File | Purpose |
| --- | --- |
| Project ZIP | Complete editable workspace for reopening or sharing; replaces the old JSON backup download. |
| `manifest.json` | Project name, template choices, palettes, CSV/settings paths, documents, and card-back reference. |
| Project CSV | Current card text, IDs, artwork references, quantities, themes, and extra columns. |
| `workspace.json` | Active card, image crops, drawing references/selection, and defaults for new cards. No embedded SVG XML or images. |
| Template SVG | Reusable tagged layout; edit in Inkscape and open through Template layout. |
| Finished card SVG | Current card's rendered appearance, including embedded artwork and fonts; cannot be reopened as a project or template. |
| PDF | Print-ready output saved from the browser's print dialog. |

Old JSON workspace backups are no longer accepted by the project opener. Empty **Project documents and files** sections are hidden.

## Editable project ZIP format

Save project generates a standard ZIP of readable project files. The manifest identifies the canonical CSV with `csv`, and editor settings with `workspace`. The CSV contains current text, stable `card_id` values, image filenames, copy quantities, themes, and extra imported columns. The imported CSV keeps its filename and folder path, including when it was detected automatically without a manifest `csv` setting. New workspaces use `cards.csv`. Export records the chosen path in the manifest. Editing the CSV before reopening changes the cards; card data is not duplicated in workspace settings.

The `theme` column accepts a named scheme or `custom:background=#ffffff;accent=#244734`. Custom colors use the selected SVG template's color roles; exports include every role so colors reproduce exactly. Invalid or duplicate roles and malformed colors stop import.

`workspace.json` version 1 stores `activeCardId`, default workspace colors for new cards, and a `cards` object keyed by card ID. Each card's settings contain `crop` (x/y from 0 to 1 and zoom from 1 to 4), `drawingFile`, `drawingActive`, and import provenance (`csvImportId`). Drawings and uploaded artwork are ordinary image files. Newly added artwork, drawings, and chosen card backs are saved under `graphics/`. Imported artwork keeps its original folder path. Unique short image filenames are lookup aliases only; they are not saved as duplicate root files. Exported CSV image references use the actual saved paths. Templates are ordinary SVG files. Projects without workspace settings use defaults.

Use **Define card back** beside the print controls to choose and preview a PNG, JPG, or WebP back. Replace it by choosing another image, or use Remove card back. Save project writes its relative image path into `manifest.json` as `cardBack.image` and includes the image. Print sheets include alternating fronts and backs; print double-sided with flip on the short edge.

## Footer references

Small links at the bottom of the editor open readable reference pages in new tabs: this app guide, project format, SVG templates, Houston project instructions, game rules, expansion guide, and card-back notes. Each page also offers Download Markdown. References are included in the offline cache; they are separate from project resources, whose section remains hidden when empty.

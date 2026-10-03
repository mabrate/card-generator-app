# Classroom Cards: static-first student app

Serve this directory as the site root on a static host. No Python application, database server, student account, or build step is required. Python below is only a convenient local file server.

```bash
python3 -m http.server 8765 --bind 127.0.0.1 --directory static-app
```

From the repository root, run that command and open http://localhost:8765. When hosting under a subdirectory, all asset paths stay relative to that directory. Use HTTPS on a public host. On HTTPS or localhost, the service worker caches the app, fonts, and built-in templates after the first visit so it can reload without internet. Other plain-HTTP hosts support normal use and browser recovery while connected, but do not install an offline cache.

## Student view

The main screen focuses on one card: choose a built-in template, write the card details, add artwork, and use **Download card**, **Print this card**, or **Save editable copy**. **Open saved work** reopens a downloaded project backup. The card switcher appears only when there is more than one card.

**Change colors** opens the default schemes; **Choose individual colors** reveals the detailed controls. **Adjust or switch your image** appears after artwork is available. CSV import and mapping, template SVG/CSV downloads, edited SVG imports, batch printing, and reset controls are under **More tools**. These sections start closed, including when recovered work contains imported cards.

## Making cards

1. Choose **Field guide** or **Food web game**. Download its template CSV and fill in one row per card in a spreadsheet. Save as UTF-8 CSV.
2. Open your CSV. Each row becomes its own editable card. Match alternative column names if needed; imported extra columns remain in the project file.
3. Upload PNG, JPG, or WebP images (including photos of hand-drawn artwork). `image_filename` cells match uploaded filenames exactly. Choose an image, position it in the frame, or draw in the browser.
4. Download each finished card SVG, or download all card text as CSV. Download a **project file** to keep the SVG template, palette, all cards, and images together for reopening on another device.

Choose a default color scheme (Sage, Sky, Sand, Rose, Lavender, or Ink), then adjust individual colors if needed. Colors apply to all cards in the workspace. **Template** restores the SVG's original colors. Untagged colors and paints set to none or a gradient keep their authored appearance.

## Restarting and clearing imports

**Remove CSV imports** removes CSV-created cards from all import batches tracked by this version, including edits and drawings attached to those cards. Manually created cards, the current template, chosen colors, and the uploaded image library stay available. In projects saved by earlier versions, only the most recently recorded CSV batch can be identified automatically.

**Start over** clears all cards, CSV imports, images, drawings, and the browser recovery checkpoint. It leaves one blank card using your current SVG template and its original colors. Both actions ask for confirmation and describe what will be removed. Download a project file first if you want to reopen the cleared work later.

## Student starter links

Choose a template, colors, and field values on the current card, then open **More tools → Send a starter link → Copy current card link**. Send the generated link to students. If clipboard access is unavailable, the link is selected for manual copying.

The link uses a `#card=` URL parameter with the starter defaults. Built-in templates are referenced by their catalog ID; opened SVG templates are embedded so students receive the edited layout. Colors include individual color adjustments as well as the selected scheme. Only the current template's text fields are included; uploaded images, drawings, CSV imports, and other cards are excluded. Links over 64,000 characters are rejected; use a built-in template or shorter text for a smaller link. Share a link from the deployed site, since a localhost address is only usable on your own device.

Opening a starter link asks before replacing existing browser recovery. Cancel keeps the saved workspace. Once opened, the defaults are saved in browser recovery and the starter parameter is removed from the address, so reloading keeps student edits. Reopening the original shared link starts the same defaults again. Starter values are visible to anyone with the link.

## Card print sheets

Use **Print this card** for a single card, or open **More tools → Print multiple cards** to choose all cards or the current card and 1–30 copies per card. **Open print sheets** opens a new browser tab containing the card SVGs, images, and fonts. Choose **Print / Save as PDF** in that tab. No HTML download is needed, and the editor stays open in its original tab. This also works offline after the app has been cached. If the browser blocks the new tab, allow pop-ups for the site and try again.

Sheets are Letter landscape (11 × 8.5 inches), with six 2.5 × 3.5 inch cards per page and square crop marks. Card order follows the workspace list; repeated copies follow each card. Export is limited to 600 card copies. Every selected card must have required text, fit the template's text limits, and have its referenced image available before export succeeds.

Choose Letter, landscape, actual size / 100%, no margins, and turn off headers and footers in the print dialog. Save as PDF there if you need a PDF file. Test your printer's physical dimensions before printing the full set. Normal editor exports contain fronts only. Projects with a `cardBack` image in their manifest include alternating fronts and backs; use double-sided printing with **flip on the short edge** and test the first pair of pages.

The app preserves complete text and reports when it exceeds the template's character or line limits. It blocks finished-card export until text fits and referenced images are available. Image files are resized to a maximum of 1600 pixels on the longest side for browser storage. The original files stay on your device; the app's saved project contains the resized versions. The drawing canvas is saved as PNG.

The card SVG declares 2.5 × 3.5 inches and embeds its image and bundled Liberation Sans fonts. Print at 100% / actual size. Confirm physical size on your printer. Inkscape may use its installed fonts instead of SVG font embedding; install Liberation Sans if you want its text measurements to match the browser exactly.

## Browser recovery

Text, template, colors, CSV column mapping, selected card, and image positions are checkpointed in localStorage. Uploaded images and drawings live in IndexedDB. Recovery works on the same browser and site address, including after a reload. Clearing site data removes this workspace. Storage errors appear in the app; download a project backup to carry your work to another device or keep it permanently. Images are saved before their references are checkpointed. If saved work is incompatible with the current project or damaged, use the recovery panel to **Download saved work** or **Start fresh**. Starting fresh uses the current workspace defaults and leaves other workspaces alone.

## Templates

The SVG is the complete layout, including text positions, fonts, shapes, color roles, and image geometry. There is no JavaScript field-guide layout overlay. Download a template, edit its existing elements in Inkscape, then reopen it in the editor. See [TEMPLATES.md](TEMPLATES.md) for the placeholder conventions and how to publish additional built-in templates.

This branch's static app is independent of the existing FastAPI classroom workflow. Share downloaded files with your teacher; it has no server submissions or shared review queue. Nothing is uploaded to a service when students choose CSVs or images.

## Project URLs

Open `?project=houston-food-web` for **Houston Food Web Game**, including rules, original card data/artwork, and the expansion pack. Publish more project folders using [PROJECTS.md](PROJECTS.md). Without a project parameter, the normal editor and its existing browser recovery behave as before.

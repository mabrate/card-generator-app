# Classroom Cards

A local classroom card app. Milestones **1–6** of [the roadmap](card-app-roadmap.md) are implemented: the local app, shared card renderer, student drafts/submissions, teacher review, CSV/image import, teacher layout authoring, and vector print-sheet export.

## Start

The project virtual environment has been prepared in this workspace. From this folder:

```bash
.venv/bin/python run.py
```

Open **http://localhost:8000**. Stop the server with Ctrl+C.

The first start creates `data/app.sqlite` and `data/uploads/`, seeds a field-guide project and five themes, and prints a randomly generated eight-digit **teacher PIN** in the terminal. Keep the PIN; only a salted hash is saved. The same PIN continues working after a restart.

- `/student` — student editor, saved drafts, image upload, and submission.
- `/preview` — temporary layout experiments and supplied Campus Food Web examples.
- `/teacher` — PIN-protected project settings and card review.
- `/teacher/login` — teacher sign-in.

### Updating an existing milestone 1–2 installation

Stop the old server first and copy the `data/` folder somewhere safe while it is stopped. Then install the updated requirements and restart:

```bash
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python run.py
```

This workspace already has the new dependencies installed. Startup applies migration 002 automatically, adding cards, image metadata, and review history. Existing project settings and the teacher PIN are preserved.

### First-time setup on another computer

Use Python 3.10 or later. Internet is needed to install packages once; startup and classroom use make no Internet requests.

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python run.py
```

On Debian/Ubuntu, if `venv` reports that `ensurepip` is unavailable, install the matching `python3-venv` package using your system package manager first. This workspace was prepared with a project-only virtual environment because that system package was absent.

For an offline installation, download wheels on an Internet-connected computer with the **same OS, architecture, and Python version** as the classroom server:

```bash
python3 -m pip download -r requirements.txt -d wheelhouse
```

Copy the source, bundled font files, fixtures, and wheelhouse to the classroom computer. Create its virtual environment, then install with:

```bash
.venv/bin/python -m pip install --no-index --find-links=wheelhouse -r requirements.txt
```

Do not copy a virtual environment across computers. No CDN, cloud account, external font service, or JavaScript build step is used.

## Connect iPads on the classroom LAN

The server binds to `0.0.0.0:8000` by default. Keep the classroom computer running and connect the iPads to the same router. Open `http://SERVER-LAN-IP:8000/student`, using the computer's actual LAN IP address. Startup lists candidate addresses; on Linux, `hostname -I` also lists local addresses. Keep the `:8000` port in the URL.

`localhost` works only on the computer running the server. If devices cannot connect, check that the firewall permits TCP port 8000 on the private classroom network and that the router does not isolate wireless clients. The app does not change firewall or network settings. `cardmaker.local` requires separately configured hostname/mDNS service; this app does not create that name. Direct IP access works without it.

For the milestone 1 acceptance check, disconnect the router's **Internet/WAN** connection while keeping its LAN/Wi-Fi running, then reload the page on an iPad. The server must remain reachable; disconnecting an iPad from Wi-Fi is a different condition. The app shows a connection error if it loses the local server.

## PIN and configuration

To choose or reset a PIN without putting it in command history:

```bash
read -rsp "New teacher PIN (6–12 digits): " CARD_APP_TEACHER_PIN
echo
export CARD_APP_TEACHER_PIN
.venv/bin/python run.py
unset CARD_APP_TEACHER_PIN
```

Stop the old server first. A changed PIN invalidates existing teacher sessions. Sessions expire after eight hours, have HttpOnly/SameSite cookies, and can be ended with Sign out. PINs use salted PBKDF2 hashes; login attempts are rate limited. The default HTTP deployment is intended for a trusted private classroom LAN, not Internet exposure.

Optional environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `CARD_APP_PORT` | `8000` | Listening port |
| `CARD_APP_HOST` | `0.0.0.0` | Listening interface; `127.0.0.1` for this computer only |
| `CARD_APP_DATA_DIR` | this project's `data/` | SQLite and uploaded images location |
| `CARD_APP_TEACHER_PIN` | generated on first start | Set/reset the teacher PIN |

## What is implemented

- FastAPI serves all UI assets locally. Student and authenticated teacher routes exist.
- SQLite uses WAL, foreign-key enforcement, short transactions, and checked-in numbered SQL migrations. Projects, template configuration, themes, cards, image metadata, review history, PIN hashes, and sessions persist across restarts.
- One Python renderer emits SVG in **180 × 252 points**, with intrinsic **2.5 × 3.5 inch** dimensions and a square trim boundary. The UI enlarges this SVG proportionally; its displayed size is not a physical print proof.
- Fixed common-name and italic scientific-name slots, category, fixed image frame, three compact facts, optional introduction, and two text sections. Labels, limits, slot geometry, and five approved color palettes are stored as configuration.
- Bundled Liberation Sans regular/bold/italic fonts are converted into vector glyph outlines at their fixed sizes. The same glyph outlines are measured for overflow and drawn in the preview. Browser font substitution cannot change the card's text layout. SVG retains accessible text labels; outlined text is not selectable like ordinary HTML text.
- Long text never causes font shrinking. The API returns field-specific character-limit, rendered-overflow, required-field, and unsupported-character errors. Invalid text is retained in full in the form/API response; clipped preview regions have red dashed outlines. Unsupported characters such as some emoji are flagged instead of silently using another font.
- Read-only previews of all 22 Campus Food Web types, preserving all source text and requested copies. Tests verify 15 organism types / 40 copies, 7 effect types / 8 copies, and 48 copies overall. Some examples legitimately exceed the fixed layout or nominal limits and are flagged.

The lightweight SQLite migration runner replaces the optional SQLAlchemy/Alembic stack at this stage. Each numbered migration runs transactionally and records `PRAGMA user_version`. Seed records are inserted only if absent; restarting does not overwrite project configuration. Add a migration for future schema changes or intentional updates to existing project templates.

## Student workflow

1. Open the student link supplied by the teacher. A project-specific URL or QR code selects that project.
2. Enter a name, class/period, and card text. Each field shows the teacher's instructions, an optional example, and a counter.
3. Choose an approved theme and optionally add an image. **Choose image** opens the file/photo picker; **Take a photo** requests the device camera through its file picker.
4. Use zoom, horizontal/vertical position, and 90° rotation controls to frame the image. Reset crop restores the centered, unrotated view. Removing an image from a card does not destroy the original upload.
5. **Save draft** stores the card on the classroom computer. Required fields may remain blank in a draft, but overlong, unsupported, or overflowing text is rejected without truncation.
6. **Submit to teacher** requires all project-required fields plus student name and class. Submitted and approved cards are read-only for students. **Needs Revision** unlocks the card and displays the teacher's note.

Unsaved text and crop settings are recovered from browser-local storage after a reload. This is separate from a confirmed server save. The page reports connection/storage failures and does not claim that an unsuccessful save worked. The app still needs the local server to load and render; it is not a standalone offline PWA.

The **Cards on this device** menu reopens work using device-stored edit keys. The recovery section exposes a private, 43-character code that can reopen the same saved card in another browser. Possession of this code grants access to that card; there are no student accounts. Anyone using the same browser profile can reopen its remembered cards. Clearing browser storage loses local unsaved work and remembered keys, but does not delete server-saved cards. Keep recovery codes when needed. A recovery code does not recover work that was never saved to the server.

**New card** creates a separate edit key. Choose the intended project first. Existing cards cannot silently move between projects. A teacher-deleted card cannot be resurrected by a stale student save.

### Images

Supported inputs are single-frame JPG, PNG, and WebP images, up to 12 MB and 25 megapixels, with both dimensions at least 16 pixels. HEIC/HEIF must first be converted to JPG, for example with a compatible camera/export setting. The app validates actual image data rather than trusting filenames.

Original bytes are retained under random server-generated filenames. A separate JPEG derivative applies EXIF orientation, removes metadata from the preview, and is used by the shared SVG renderer. Rotation and crop settings are stored independently. Student image requests require the owning edit key; teachers access images through their authenticated session. Repeated uploads of identical bytes for the same card reuse the existing image. Each card key permits up to 30 different uploads.

The renderer embeds the same cropped image in student and teacher previews and estimates effective print resolution from the original crop. Crops below 150 DPI produce a warning, but do not block saving or submission. Actual camera-picker behavior still needs an iPad check.

## Teacher workflow

- Open **Projects, directions, and student link** to create/open a project, edit its directions, field labels/instructions/examples/character limits, required fields, and approved themes. Use **Layout & CSV studio** to change card geometry and typography; students cannot edit layouts.
- Use the student link and locally generated QR code for the selected project. Open the teacher page through the server's LAN IP address before sharing; a QR code generated from `localhost` cannot connect another device.
- Filter the card list by project, class, and status. Lists are paginated in groups of 30.
- **Review** edits text, Student, Class, print quantity (1–999), image replacement/removal, zoom, horizontal/vertical position, and 90° rotation. **Save card edits** saves corrections; edits to an approved card return it to Submitted. Identity, quantity, and image changes can be saved while unchanged imported text still needs revision.
- For an imported deck, open **Student and Class for this imported deck** in project settings. Choose Student, Class, or both and apply them to all imported cards in that project. Student-created cards are unaffected.
- **Approve** accepts a submitted card only after server-side validation. **Needs Revision** requires a note and unlocks the card for the student.
- **Delete project** in Projects, directions, and student link confirms the project name and removes the project and all its cards from student access, review, and printing. Local records, images, and history remain; there is no restore UI. You can delete the last project and create a new one.
- **Delete card** names the card/student and confirms the action. It removes the card from review and student access. This is a soft deletion: original files and history remain in local storage, not a permanent erasure. There is no restore/purge UI in this milestone.
- Recent activity shows saves and review actions. **Load latest version** explicitly replaces unsaved teacher edits after confirmation.

Every card save/review checks its version in a SQLite transaction. A stale tab cannot overwrite a newer student/teacher edit. Student retries use a stable mutation ID so a lost response does not create a second card. Project changes are also version checked; changed project settings return previously approved cards to Submitted for fresh review.

### Remaining scope

Milestone 6 print-sheet export is implemented using the canonical SVG renderer; see Print sheets below. A physically measured printer/corner-punch proof remains a real-world acceptance check. Selecting an example at `/preview` is not a database import, and that sandbox does not save student work. Backup/restore and further hardening remain milestone 7.

## Verification

```bash
.venv/bin/python -m pip install -r requirements-dev.txt
.venv/bin/python -m pytest -q
.venv/bin/python scripts/browser_smoke.py
.venv/bin/python scripts/project_smoke.py
.venv/bin/python scripts/workflow_smoke.py
```

Each browser script starts/stops its own server with a disposable database and test PIN. It uses installed Chrome/Chromium; if neither is available, install Playwright's Chromium once with `.venv/bin/python -m playwright install chromium`. `CARD_APP_TEST_BROWSER` can specify a browser executable.

Automated tests cover exact SVG proportions, font-size invariance, measured overflow below nominal limits, configuration labels/limits, theme geometry, XML escaping, source preservation and fixture totals, route protection, login throttling, logout/session expiration, PIN reset, migrations, persistence, concurrent SQLite transactions, and API validation. Browser checks cover real form/theme updates, preserved overflow text, teacher sign-in/out, connection failure/recovery, responsive dimensions, and page operation with non-local requests blocked. The workflow suite additionally covers separate student/teacher sessions, image/crop persistence, browser-local recovery, recovery-code access, revisions, approval, project-setting changes, deletion, and temporary connection loss. Screenshots go to `/tmp/card-app-screenshots` and `/tmp/card-workflow-screenshots`.

Earlier milestone 6 verification included the illustrated 22-record / 48-copy / 8-sheet import-to-print workflow in Chromium with external requests blocked. The PDF sample was visually inspected after rendering. Earlier milestone workflows also passed in Chromium and WebKit; milestone 6 still needs a physical iPad/print test. The workflow suite also simulates a committed save whose response is lost, checks that retrying does not duplicate it, verifies failed reloads preserve unsaved work, and checks reopening after teacher deletion.

The workflow script supports `CARD_APP_TEST_ENGINE=webkit` after installing Playwright's WebKit browser and its platform dependencies. The WebKit runtime and supporting libraries used for this verification were isolated under `/tmp`; they are test tools, not application dependencies.

Physical iPad Safari use and WAN-disconnected classroom-router access still require a real-device acceptance check. On an iPad, take a photo, crop/rotate it, save and reload the draft, then submit and reopen it after a teacher requests revision. Also check the teacher's QR code using the server's LAN address. Automated desktop/WebKit tests do not establish the physical camera or classroom-router results.

## Files

- `app/config.py` — starter project/template and theme data.
- `app/rendering.py` — canonical SVG renderer and glyph fitting.
- `app/main.py`, `app/workflows.py` — routes and authenticated workflow boundaries.
- `app/cards.py`, `app/schemas.py` — validation, version-checked saves, and review transitions.
- `app/images.py` — original upload retention, derivatives, crop rendering, and quality warnings.
- `app/db.py`, `migrations/` — SQLite connections and schema evolution.
- `app/static/`, `app/pages/` — local browser UI; protected teacher HTML is outside the static directory.
- `app/assets/fonts/` — bundled fonts and redistribution license.
- `tests/`, `scripts/browser_smoke.py`, `scripts/workflow_smoke.py` — automated verification.

Original roadmap and Campus Food Web source fixtures remain at the repository root.



## Teacher projects and SVG designs

Open **Teacher space** (`/teacher`) to see the Projects list. Create a project from a card style, or open, rename, or delete an existing project. A project page (`/teacher/project?project=…`) has four sections: **Overview & fields**, **Cards**, **Layout & CSV**, and **Print sheets**. The overview contains student directions, field instructions, approved themes, and the student link/QR code. The Cards section reviews and edits saved/student/imported cards. Layout & CSV contains layout editing, spreadsheet templates, image assets, CSV mapping and import. Print sheets checks and downloads the selected project's PDF. The old `/teacher/studio` and `/teacher/print` addresses redirect to those sections.

Each saved project has a portable **design SVG** in SQLite alongside its validated layout JSON. Download it from Layout & CSV. The SVG is a complete 2.5 × 3.5 inch visual card, viewable in Inkscape, with a `card-app-design` JSON `<metadata>` element and `data-editable`, `data-field-type`, `data-field-key`, `data-required`, `data-instructions`, and `data-box` XML attributes on editable elements. **Open a Classroom Cards design SVG** reads that embedded layout metadata into the layout editor; review it and save to apply it. Visual edits made only to SVG paths in Inkscape do not change card geometry in the app. Use the layout editor or edit the SVG's layout metadata for changes the app should adopt.

A **finished card SVG** is downloadable from an opened card in Cards. It contains the rendered card and card-content metadata, including its image. It is an output artifact; the design SVG importer rejects it. CSV and XLSX templates carry card data columns based on the saved project's field keys, while field instructions live in the project design and its matching spreadsheet guide. Images remain separate local assets linked by filename on CSV import. Migration 005 adds stored SVGs for existing projects on startup while retaining their original layout and cards.

## Milestone 5 — CSV, images, and layout studio

Open a project from **Teacher space**, then choose **Layout & CSV**.

1. Create a project on the Projects page using one of five card styles (field guide, classic playing, creature trading, spell/strategy, or sports/profile), each with square corners or an exact 3 mm corner radius. Open it and use **Save project & layout** for layout changes.
2. Select a UTF-8 CSV and check the suggested field matches. For other datasets, choose **Suggest a layout from my CSV columns**, select up to 12 text columns, and adjust the generated layout.
3. Select matching PNG/JPG/WebP files (multiple selection). The CSV's `image_filename` must match the filename exactly, including extension. Images are uploaded separately, not embedded in cells. ZIP and direct XLSX imports are not supported.
4. Move boxes by dragging, resize with the selected box's corner handle, or type exact point measurements. Set each box's font size, line height, label, required flag, prefix, and text limit. Text supports left/center/right and top/middle/bottom alignment. **Align box** moves the selected box to a card margin or centers it horizontally/vertically. Under **Corners and borders**, adjust card/image corner radii and border thicknesses in points; 0 means square corners or no border. The card remains 180 × 252 pt (2.5 × 3.5 in).
5. Save the layout, then validate the CSV. Review every row, unmapped columns, missing assets, and duplicate actions before confirming import.
6. Use **Preview a saved card** to adjust the layout after importing. Teacher review also has an **Edit this project's layout** link. Saving layout changes invalidates existing approvals.

**Fields:** add or delete fields in project settings or Layout & CSV studio (1–12 fields). Position new fields in the layout editor. Saving a deletion removes that field from existing cards and invalidates stale edits; each affected card's previous content remains in local history. This history has no restore UI.

**Layout first:** save a project and download its **Excel template (.xlsx)** or **CSV template**. The XLSX has a blank Cards sheet plus a Field guide with the correct keys, labels, requirements, limits, and directions. Fill Cards, then save that sheet as UTF-8 CSV to import. Exports contain literal text cells, not formulas or macros; the classroom server needs no spreadsheet software or internet.

**Import behavior:** up to 500 rows / 1 MB CSV per batch; up to 12 content fields, 2,000 source characters per field, 1–999 copies per record. The importer retains full source CSV in its staging record and never silently shortens text. Missing/invalid images and malformed metadata reject the affected row. Required/overflow/character-limit/glyph issues retain the row as **Needs Revision**, with its complete values and feedback. Fix its text or layout before approval. A field-count limit is not a reason to drop columns silently: the preview explicitly lists unmapped columns.

**Duplicates:** `card_id` is scoped to the selected project. Choose skip, update, or create additional records with new IDs. Keep stable IDs for repeatable imports; blank IDs receive new random IDs on every new batch. Updates replace CSV content, image, copy count, and theme; they reset approval and crop. A retry of the same committed batch returns the same result without inserting again. Commit checks project/card versions and duplicates inside a single SQLite transaction.

**Persistence:** migration 003 adds copy counts, external IDs, card kinds, and import staging. Existing projects, cards, images, and teacher PIN remain in place. Existing legacy layouts are not silently replaced. Staged CSVs and uploaded originals are retained locally; there is no purge interface yet. Back up the entire data directory, including images.

### Illustrated demo

Open **Try examples** (`/demo`) to browse the play-tested v1 cards. Its download and the teacher studio instructions use the v1 CSV and artwork in `demo/v1/`. The simplified v2 set is no longer shown in the app demo or recommended for classroom use. Its files remain as an archive. Original source files remain under `demo/source/`.

The separate `/preview` page is a temporary field-guide editing sandbox.

### Verification

```bash
.venv/bin/python -m pytest -q
.venv/bin/python scripts/browser_smoke.py
.venv/bin/python scripts/workflow_smoke.py
.venv/bin/python scripts/project_smoke.py
.venv/bin/python scripts/print_smoke.py
```

The project browser check covers project creation, rename/delete, SVG import, CSV import, print preview and PDF download. The print browser check imports all 22 demo records and images, verifies 48 copies on eight sheets, and checks PDF export. Earlier import and upgrade browser scripts remain as milestone snapshots; they have not been updated for the Projects landing page. `CARD_APP_TEST_ENGINE=webkit` selects an installed Playwright WebKit runtime; physical iPad and paper-size proof still need real-device testing.



## Print sheets (milestone 6)

Open a project and choose **Print sheets**. Choose an optional class filter, select approved cards, and leave **Expand card quantities** checked to honor each record's `copies`. Select **Include unapproved imported cards** explicitly to print CSV records before approval; this never changes their approval status. Unapproved student drafts/submissions remain unavailable.

Enable **Black and white export** for white backgrounds/panels, consistent dark gray borders/text, and grayscale image crops. This changes only the export, leaving saved colors and original images intact.

Click **Check print selection**, review any image-resolution or approval warnings, then **Preview sheets** in a browser tab or **Download Letter PDF**. Text overflow, missing required fields, disabled themes, unsafe text at punched/rounded corners, and missing images block export; nothing is truncated or shrunk. Card/project versions are checked again at download, so changed or deleted cards require reloading the selection. Export is limited to 200 selected records and 600 expanded cards per download. Selection survives class filtering within a project; changing project/import eligibility or reloading clears it.

Sheets are **US Letter landscape (11 × 8.5 in)** with up to six cards, in reading order. Each square trim rectangle is exactly **180 × 252 points (2.5 × 3.5 in)**, surrounded by **9 pt (3.175 mm) bleed**. Short square-aligned crop marks stay outside the bleed; no cut line is printed through the card. Bleed and the area outside rounded corners use the card border color. The card background stays inside the trim shape. Cards currently use inset image frames, not edge-to-edge image bleed. Text uses the same bundled-font vector outlines as preview. Print crops use retained originals, up to 600 DPI in the image frame, without upscaling low-resolution uploads. Warnings are shown below 150 effective DPI.

Print using **Actual Size / 100%**, Letter paper, landscape orientation. Disable Fit, Shrink, and printer borderless enlargement. Print one test sheet first; measure a trimmed card with a ruler (2.5 × 3.5 in), then use your 3 mm corner punch for rounded templates (leave square templates unpunched) and inspect content. PDF geometry is tested; a real printer and punch still require this physical acceptance check. PDFs are single-sided fronts; card backs/duplex alignment are not included.

CairoSVG needs the system Cairo library in addition to Python requirements. It is already available in this workspace. On Debian/Ubuntu install `libcairo2`; on macOS install Cairo with Homebrew (`brew install cairo`). On Windows follow [CairoSVG's installation instructions](https://cairosvg.org/documentation/). These are one-time installation needs, not classroom Internet dependencies.




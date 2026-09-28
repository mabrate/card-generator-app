# Card App Roadmap

## Purpose

Build a **local-first classroom card creation web app** for middle-school students using iPads on a private classroom LAN. The app is not a freeform design tool. It should enforce consistent card layout, fixed typography, safe text lengths, approved color themes, image quality, teacher-defined directions, and reliable print output.

The first real dataset is the **Campus Food Web** prototype. The app must be able to bulk-import the accompanying `campus-food-web-cards.csv` and render multiple card records without requiring students or the teacher to enter each card manually.

Longer term, the same app should support student-created field-guide cards with fields such as:

- Common name
- Scientific name
- Family
- Ecosystem role
- Adult size
- Adaptations
- Ecosystem services
- Organism image

Do not hardcode the Campus Food Web labels into the rendering engine. Treat labels and field definitions as template/project configuration.

---

## Product principles

1. **Local first.** The complete classroom workflow must work without Internet access.
2. **Student simplicity.** Students enter content; they do not design layouts.
3. **Teacher control.** Teachers define instructions, field limits, allowed themes, card projects, approval state, and print selection.
4. **One rendering system.** Student preview, teacher preview, image export, and print output should share the same card renderer.
5. **Print accuracy matters.** Finished cards must be exactly 2.5 × 3.5 inches after trimming.
6. **Data should outlive the UI.** Store card content, configuration, and image metadata independently from presentation code.
7. **Bulk import is a first-class workflow.** A teacher should be able to import dozens of cards from CSV in one action.
8. **Do not overbuild accounts or cloud features in the MVP.**

---

# Recommended technical architecture

## Server

Prefer:

- Python
- FastAPI
- SQLite
- SQLAlchemy or SQLModel
- Alembic migrations
- Pillow for basic uploaded-image processing
- a PDF library capable of precise physical dimensions and vector placement

The server should bind to the local network so students can open it from iPads connected to the classroom router.

Example classroom URL:

`http://cardmaker.local`

Support direct IP access as a fallback.

## Frontend

Use a responsive browser frontend that works well in Safari on iPad.

A lightweight component framework is acceptable, but:

- all JS/CSS/fonts/assets must be bundled locally;
- do not depend on a CDN;
- do not require an Internet connection at runtime.

Landscape iPad should favor:

`FORM | LIVE CARD PREVIEW`

Portrait/narrow layouts may stack the preview and form.

## Database and files

Use SQLite for structured data.

Recommended top-level concepts:

- projects
- project_fields
- themes
- cards
- card_field_values
- images
- students or student_edit_tokens
- submissions / status history
- import_jobs

Store uploaded images in the filesystem rather than as SQLite BLOBs. Store the image path, dimensions, crop information, rotation, and metadata in SQLite.

Enable SQLite WAL mode and use short transactions so several students saving at roughly the same time does not create unnecessary locking.

---

# Card size and print geometry

## Finished card

Standard finished card:

- width: **2.5 in**
- height: **3.5 in**

Use physical units in the print renderer. Do not rely on browser pixels for final PDF dimensions.

## Corner punch

The teacher will cut cards as rectangles and then use a **3 mm corner-rounder punch**.

Therefore:

- the trim boundary remains a square-cornered 2.5 × 3.5 inch rectangle;
- crop marks indicate that square trim boundary;
- visual card backgrounds should extend through the corner area;
- important text or artwork must remain clear of the corner-punch area;
- rounded interior/background styling that visually follows the finished corner should use roughly a 3 mm radius.

The print PDF itself must not use rounded trim/cut lines.

## Bleed

Use approximately:

- 3 mm / about 0.125 in bleed outside the trim boundary.

Background color and full-bleed artwork should extend into the bleed area.

Keep important content inside a conservative safe area.

## Letter print sheet

Generate print-ready US Letter PDF sheets.

Do not change finished card dimensions to fit more cards.

Prefer a clean six-card arrangement if that provides reliable:

- bleed,
- crop marks,
- safe printer margins,
- easy straight cutting.

The teacher should be able to select approved cards and generate a print sheet.

The `copies` value from bulk-imported cards should optionally expand a card record into the requested number of printable copies.

---

# Card rendering model

Use a single canonical card-rendering component.

SVG is a strong candidate because it provides:

- predictable geometry,
- fixed typography,
- clipping/cropping,
- crisp vector text,
- reusable rendering for browser preview and PDF generation.

Do not build a separate loosely matched preview design and print design.

## Default organism card layout

The default field-guide template should include:

### Header

- Common name
- Scientific name, visually treated as scientific nomenclature

### Image

A prominent organism image with fixed position and aspect ratio.

### Compact facts

Small, fixed typography for short factual fields such as:

- Family
- Ecosystem role
- Adult size

The template system should permit other teacher-defined compact fields.

### Central text

Two prominent sections by default:

- Adaptations
- Ecosystem services

Teacher/project configuration should control the labels and instructions so the same renderer can support the Campus Food Web game cards.

## Typography

Font family, font size, line height, and card positions are template-controlled.

Students must not be allowed to:

- move fields,
- resize fields,
- change fonts,
- change font sizes,
- change the border,
- freely choose colors.

Never shrink font size automatically to solve overflow.

Instead:

- apply teacher-defined character limits;
- show visible counters;
- reject text beyond the configured maximum;
- validate actual rendered text before save/submit;
- show a clear overflow error if the rendered value cannot fit even though it is inside the nominal character limit.

---

# Theme system

Students may choose from a small teacher-approved palette, for example:

- Sage
- Sky
- Sand
- Rose
- Lavender

A theme may change:

- light background tint,
- heading tint,
- subtle section fills,
- accents.

A theme may not alter core geometry or border styling.

Store themes as data/configuration, not duplicated CSS.

---

# Image workflow

Students should be able to:

- choose an image already on the iPad;
- take a photograph with the iPad camera;
- crop;
- rotate;
- reposition/zoom inside the fixed image frame.

Retain the original upload.

Store a derivative/crop configuration separately rather than destructively editing the only copy.

## Image quality

Calculate effective print resolution for the image frame.

Warn the teacher when the selected crop would print at obviously poor resolution.

Do not block a classroom draft merely because quality is imperfect unless the teacher chooses strict validation.

## Artwork scan

Treat high-quality paper-artwork scanning as a secondary feature.

Useful later features:

- camera capture,
- four-corner perspective correction,
- rotate,
- brightness/contrast,
- light paper-background cleanup.

Do not let advanced scanning delay the MVP.

---

# Student workflow

## Entry

The teacher dashboard should show a QR code and local URL for the student editor.

Do not require Google, Microsoft, or Internet accounts.

For the MVP, students can enter:

- name
- class/period

## Creating a card

Student sees:

- field label,
- teacher instructions,
- optional example,
- input,
- character counter,
- live card preview.

The student can save a draft and submit.

## Returning to a draft

Avoid a full account system.

Use a classroom-appropriate solution such as:

- device-stored edit token;
- short student code plus project;
- optional teacher-generated recovery code.

Do not expose database IDs as the main UX.

---

# Teacher workflow

Protect teacher routes with a locally configured PIN/password.

Teacher dashboard should provide:

- create/open card project;
- configure field instructions;
- configure character limits;
- mark fields required/optional;
- configure examples;
- enable/disable themes;
- import card data;
- review cards;
- edit card text if needed;
- approve;
- mark Needs Revision;
- delete;
- bulk-select cards;
- create print sheet.

Statuses:

- Draft
- Submitted
- Needs Revision
- Approved

---

# Bulk import

Bulk import is required for the MVP.

## Supported MVP format

Support **CSV** first.

Also support the supplied structured JSON later or internally if convenient.

The included `campus-food-web-cards.csv` should be a working fixture/test file.

## CSV schema

Initial schema:

| Column | Purpose |
|---|---|
| `card_id` | Stable unique slug/identifier |
| `card_kind` | `organism`, `effect`, or future kind |
| `copies` | Number of printable copies requested |
| `title` | Main card title / common name |
| `scientific_name` | Scientific name or subtitle |
| `category` | Role/category line |
| `fact_1_label` | Optional compact fact label |
| `fact_1_text` | Optional compact fact value |
| `fact_2_label` | Optional compact fact label |
| `fact_2_text` | Optional compact fact value |
| `fact_3_label` | Optional compact fact label |
| `fact_3_text` | Optional compact fact value |
| `intro_text` | Optional short text before main sections |
| `section_1_label` | Main section label |
| `section_1_text` | Main section text |
| `section_2_label` | Second main section label |
| `section_2_text` | Second main section text |
| `image_filename` | Optional local filename/reference |
| `theme` | Optional approved theme key |

Blank fields are valid.

## Why use this schema

The same structure can represent:

### Field-guide organism card

- title → Common name
- scientific_name → Scientific name
- fact 1 → Family
- fact 2 → Ecosystem role
- fact 3 → Adult size
- section 1 → Adaptations
- section 2 → Ecosystem services

### Campus Food Web game card

- title → Card name
- scientific_name → Scientific name / `Effect card`
- category → `PLANT - FLOWERING`, `PREDATOR`, etc.
- facts → Pollinators / Herbivores where present
- sections → abilities/rules

This lets the first app stay useful beyond one project.

## Import behavior

Teacher chooses:

`Import Cards`

Then:

1. upload CSV;
2. parse and validate;
3. show a preview table;
4. report row-specific errors without importing invalid rows;
5. detect duplicate `card_id` values;
6. ask whether duplicates should:
   - skip,
   - update existing records,
   - import as new IDs;
7. confirm project/template mapping;
8. import in one transaction where practical;
9. show count imported/updated/skipped.

Do not silently truncate text.

If imported text exceeds a configured card limit, flag the card as **Needs Review** instead of changing the text.

## Import mapping

Do not assume every future CSV has these exact column names.

After the fixed MVP works, add an import-mapping screen:

`CSV column -> Card field`

Save mappings as reusable import presets.

---

# Organism library — later phase

Eventually add a separate organism library that can be imported from CSV or synchronized from Google Sheets.

This is distinct from cards.

One organism record may be used to make multiple cards in different projects.

Possible organism fields:

- common name
- scientific name
- family
- ecosystem role
- adult size
- native status
- origin
- adaptations
- ecosystem services
- approved reference image

A future card project can prefill a new card from an organism record while preserving project-specific card text separately.

Do not add Google Sheets synchronization to the MVP.

---

# Campus Food Web fixture

Use the supplied files as development fixtures:

- `campus-food-web-cards.csv`
- `campus-food-web-cards.json`
- `campus-food-web-turn-guide.md`

Expected imported totals:

- **15 organism card types**
- **40 organism cards when `copies` is expanded**
- **7 effect card types**
- **8 effect cards when `copies` is expanded**
- **22 unique card records**
- **48 total printable cards**

Add automated tests for these totals.

The app does not need to implement the game rules. The game dataset is primarily an import/rendering/printing test fixture.

---

# Suggested project structure

A sensible structure might be:

```text
card-app/
├── app/
│   ├── api/
│   ├── models/
│   ├── services/
│   │   ├── imports/
│   │   ├── images/
│   │   ├── rendering/
│   │   └── printing/
│   ├── templates/
│   └── static/
├── migrations/
├── data/
│   ├── app.sqlite
│   └── uploads/
├── fixtures/
│   ├── campus-food-web-cards.csv
│   ├── campus-food-web-cards.json
│   └── campus-food-web-turn-guide.md
├── tests/
└── README.md
```

Codex may choose a different structure if it has a clear reason.

---

# MVP build order

## Milestone 1 — Local server and project shell

Deliver:

- app starts with one command;
- local LAN access works;
- no Internet dependencies;
- SQLite database initializes;
- teacher PIN exists;
- student and teacher routes exist.

Acceptance:

- disconnect Internet;
- iPad on classroom router can still open the app.

## Milestone 2 — Canonical card renderer

Deliver:

- fixed 2.5 × 3.5 card geometry;
- common/scientific name fields;
- image frame;
- three compact fact rows;
- two central text sections;
- theme application;
- fixed typography;
- preview.

Acceptance:

- long text never changes font size;
- overflow is detected;
- preview proportions remain exact.

## Milestone 3 — Student editor

Deliver:

- field instructions;
- character counters;
- required validation;
- image upload/camera capture;
- crop/reposition;
- theme choice;
- save draft;
- submit.

Acceptance:

- usable in iPad Safari;
- reload/reopen draft works.

## Milestone 4 — Teacher review

Deliver:

- card list;
- filters by status/project/class;
- preview;
- teacher edit;
- Needs Revision;
- Approved;
- delete.

Acceptance:

- teacher can process a class set without opening the database.

## Milestone 5 — CSV bulk import

Deliver:

- import `campus-food-web-cards.csv`;
- validation preview;
- duplicate handling;
- import summary;
- `copies` preserved;
- imported cards render.

Acceptance:

- fixture produces exactly 22 card records;
- copies sum to exactly 48;
- no source text is silently shortened.

## Milestone 6 — Print sheet

Deliver:

- select approved/imported cards;
- expand by `copies`;
- US Letter PDF;
- exact 2.5 × 3.5 trim size;
- about 3 mm bleed;
- square crop/trim lines;
- safe area for 3 mm corner punch;
- crisp vector text;
- high-resolution placed images.

Acceptance:

- print at 100% / Actual Size;
- physically measure trimmed test card;
- verify 2.5 × 3.5 inches;
- use 3 mm punch and confirm no important content is removed.

## Milestone 7 — Hardening

Deliver:

- backup/export of SQLite + uploads;
- basic restore documentation;
- friendly network/setup instructions;
- import error logging;
- image-quality warnings;
- automated tests.

---

# Non-goals for MVP

Do not add these until the core workflow is stable:

- Google authentication
- Microsoft authentication
- Google Sheets live sync
- cloud hosting
- multi-school tenancy
- student email accounts
- freeform drag-and-drop design
- arbitrary fonts/colors
- advanced Photoshop-like image editing
- AI generation inside the app
- complex game-rule enforcement

---

# Testing checklist

## Offline

- no external CDN requests;
- no externally hosted fonts;
- no cloud API calls needed for core features;
- app works with WAN disconnected.

## Import

- quoted commas parse correctly;
- UTF-8 names parse correctly;
- blank optional fields work;
- duplicate IDs produce a clear choice;
- invalid copies values are reported;
- overlong imported fields are flagged, never truncated;
- Campus Food Web fixture totals match expected values.

## Text

- character limit enforced;
- server validates limits as well as client;
- rendered-overflow validation exists;
- no auto font shrinking.

## Images

- iPad image upload works;
- camera capture works where browser permissions allow;
- original upload retained;
- crop position retained;
- print-resolution warning works.

## Data

- server restart preserves projects/cards/images;
- concurrent saves do not corrupt SQLite;
- draft and approval state persists.

## Printing

- output is US Letter;
- finished trim is exactly 2.5 × 3.5 in;
- bleed is outside trim;
- crop marks are square;
- safe content survives 3 mm corner punch;
- `copies` expands correctly;
- preview and print renderer use the same geometry.

---

# Codex working instructions

When implementing from this roadmap:

1. Inspect the repository before choosing libraries or changing architecture.
2. Prefer the simplest maintainable local-first solution.
3. Build one vertical slice before polishing secondary features.
4. Keep the app runnable after each milestone.
5. Write/update tests as features are added.
6. Update README setup instructions whenever startup or dependencies change.
7. Keep migrations checked into the repository.
8. Do not silently reinterpret imported source data.
9. Do not automatically rewrite student/teacher text to make it fit.
10. If a design decision is ambiguous, choose a reasonable default, document it, and continue rather than stopping for minor clarification.
11. Use the Campus Food Web fixture as an end-to-end acceptance test for import, rendering, copy expansion, and PDF printing.
12. Do not move to cloud features until the local classroom workflow is reliable.

## Definition of first usable release

The first release is ready for classroom testing when a teacher can:

1. start the app locally;
2. show students a QR code;
3. create a card project;
4. import a CSV containing multiple cards;
5. let a student create/edit a card on an iPad;
6. review and approve cards;
7. select cards for printing;
8. produce an accurate Letter PDF with bleed/crop marks;
9. restart the computer without losing work;
10. perform the entire workflow with the Internet disconnected.


## Upgrades and Development Notes

## Upgrades
- Enable deleting projects
- Direct image replacement, zoom, positioning, and rotation should be added to the card’s Review editor.
- Choosing a project in the layout editor is confusing. There is a dropdown and a project title box together but the save button is way down low. 
- Could we add a few default layout/field configurations based loosely on famous playing/trading card layouts. I would appreciate a square corner and a 3mm rounded corner template
- I should be able to add or delete fields when creating a project or editing the layout.
- Enable centering text and basic text-box alignment in the layout editor.
- Allow changing the quantity of a particular imported card
- Enable black and white print sheet export toggle. Change backgrounds to white and borders to a consistent dark gray.
- The bleed on the print sheet should be the border color, not the background color.
- Enable editing the "Student" and "Class" fields of a teach csv imported project. Sometimes I will import decks on behalf of students or classes.


## Play Test Updates
After a play test, I want to change the rules of the game. Please change the rules markdown file. Then, check the demo card set to make sure there are no conflicts or ambiguities with the new rules. Align card text with the new rules and alert me if major changes are needed.

1. Counters should ideally be black-eyed peas.
2. 2 black-eyed pea counters can be marked on one side and tossed like dice. both heads = hot day, both tails = clear day, one of each = cloudy day (this better matches the actual weather in houston.)
3. Clarify that plants can add multiple population counters during one grow phase if light and water are available. The caps on population and water should keep this mechanic under control.
4. Cap the amount of water for each plant at 3. With few plants early on, water counters accumulated to unusable levels, cluttering the game space. 
5. Change the discard/compost/decomposition system. Instead of putting counters in the compost whenever population changes (which is hard to remember to do). Discarded cards go into the "compost pile." Organism cards go face up to show they can be consumed by decomposers. Effect cards go face down on the bottom to show they are not consumable.
6. Decomposition and nutrients: nutrient counters are too complicated. Bacteria and fungi can "decompose" face up cards in the discard/compost pile. This action adds one population counter to a plant. The card is then placed face-down on the bottom of the compost to show it is no longer consumable.
7. Simplify the scoring system: Count the population counters in your plot and add the number of different organisms. First player to 20 wins. 





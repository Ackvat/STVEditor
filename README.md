# Sihirizasyon: Toplantı Var

A custom card game for up to 8 players, similar to Magic: The Gathering with many rule changes. Cards have abilities, attack/defence, creature pictures, resources, passives, and independently styled description sections.

Built with an HTML/CSS/JS web tool for editing and generating printable card sheets.

## Project Structure

```
STV/
├── card_data.xlsx           # Card data (sheet: "Cards")
├── Project_Details.pdf      # Game rules & specification
├── assets/
│   ├── backgrounds/         # Card background images
│   ├── icons/
│   │   ├── resources/       # Resource icons
│   │   ├── types/           # Type icons
│   │   └── actions/         # Action icons (for inline text)
│   ├── pictures/            # Card art / creature images
│   └── back.{png,jpg,webp}  # Card back (fallback)
├── output/
│   ├── individual/          # Generated individual card PNGs
│   └── print/               # A4-ready print sheets
└── web/
    ├── index.html           # Editor interface + card template
    ├── card.css             # Card template styling
    ├── tool.css             # Tool interface styling
    └── script.js            # XLSX parsing, preview, Canvas 2D generation, print
```

## Card Specs

| Feature | Value |
|---|---|
| Card size | 600 × 900 px (6 × 9 cm) |
| A4 sheet | 2100 × 2970 px |
| Rarities | common, uncommon, rare, epic, legendary, shadow |
| Resources | Variable types (leaf, ore, tech, etc.) |

**Layout (top → bottom):** Top bar (name + mana/resource icons) → Picture → Type bar (type – form + icon) → Description sections → Attack/Defence → Rarity border

## Web Tool

An offline-first browser-based card editor and generator.

### Usage

```bash
cd STV
python3 -m http.server 8080
# Open http://localhost:8080/web/
```

*Must be served via HTTP — `file://` blocks `canvas.toBlob()` for security.*

### Features

- **Card Editor** — Edit name, mana (number or dice), attack/defence, resources, type/form, level, images
- **Description Sections** — Dynamic add/remove of text blocks with independent header/body styling (font, size, color, weight, background)
- **Inline Icons** — Embed any uploaded icon in text using `<icon_name>` syntax (icons match text height)
- **Assets Tab** — Upload/delete pictures, backgrounds, type/resource/action icons, card backs; configure rarity colors
- **Layout & Style Tabs** — Adjust card dimensions, typography, and colors via sliders and color pickers
- **Raw CSS Editor** — Full control over card template; save/load/reset
- **Print Tab** — A4 sheet layout config (cols/rows, margins, gaps, front/back preview), card back flip settings
- **Generate All** — Renders individual card PNGs at 2× resolution, then composes A4 print sheets with backs; saves as ZIP or directly to folder (Chromium)
- **PDF Export** — Generate fronts or backs as single multi-page PDF
- **Project Save/Load** — Export/import full projects as `.zip` (card data + assets + CSS + settings)
- **Statistics** — Filterable stats overview (attack/defence/mana distributions, resources, type/form, levels)

### External Libraries

| Library | Purpose |
|---|---|
| [SheetJS (xlsx)](https://sheetjs.com/) | XLSX parsing |
| [JSZip](https://stuk.github.io/jszip/) | ZIP create/extract |
| [FileSaver.js](https://github.com/eligrey/FileSaver.js/) | Browser file download |
| [jsPDF](https://github.com/parallax/jsPDF) | PDF generation |

## Card Data Format (XLSX)

`card_data.xlsx` — sheet name `Cards`. Key columns:

| Column | Description |
|---|---|
| `card_name` | Card name |
| `card_picture` | Filename in `assets/pictures/` (no extension) |
| `background` | Background filename |
| `type_icon` | Type icon filename |
| `rarity` | common / uncommon / rare / epic / legendary / shadow |
| `card_type` | Type text (e.g. "İnsan") |
| `card_form` | Subtype text (e.g. "Druid") |
| `attack`, `defence`, `mana` | Numeric stats (or `dN` for dice) |
| `resource_{name}` | Resource count, e.g. `resource_leaf: 1` |
| `printed` | `yes` / `no` |
| `amount` | Copies in print sheets (default 1) |
| `section_{N}_header_text` | Section N header |
| `section_{N}_body_text` | Section N body |

Resources are shown as icons (no number); mana displays as a number inside a circle.

Legacy columns `status_text`, `usage_text`, `description` auto-convert to Description Sections.

## Inline Icons in Text

Use `<icon_name>` in any description header or body text to embed an icon inline:

```
Deals 1 <damage_icon> to all opponent's cards.
```

Icons are looked up from Action Icons, Resource Icons, then Type Icons (in that order). Upload icons under **Assets → Icons → Action**. They render at the same height as the surrounding text.

## Development

- Card generation uses **Canvas 2D API** directly (html2canvas rejected due to broken borders/alpha)
- CSS custom properties (`--var`) are the single source of truth for all layout values, shared between HTML preview and Canvas generation
- All images support `.png`, `.jpg`, `.webp` — tried in order; in-browser uploads take priority
- Print settings can be saved/loaded as `.json`

## License

Private project.

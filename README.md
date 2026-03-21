# Digital Markets Act

A clean, navigable website for browsing the full text of the [Digital Markets Act](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022R1925) (EU Regulation 2022/1925). Each article has its own page with numbered paragraphs, lettered sub-points, and a sidebar linking to related recitals.

## Features

- **Index page** — All 54 articles grouped by their 6 chapters
- **Article pages** — Full text with paragraph structure, chapter sidebar navigation, and previous/next article links
- **Recitals page** — All 109 recitals with anchor links for cross-referencing from article pages
- **Recital sidebar** — Article pages show related recitals in a right sidebar (mappings defined in `src/_data/recitalMap.json`)
- **Responsive design** — Mobile navigation with collapsible menu; desktop three-column layout

## Tech Stack

- [Eleventy](https://www.11ty.dev/) (v3) — static site generator with Nunjucks templates
- [Tailwind CSS](https://tailwindcss.com/) (v4) — locally generated via `@tailwindcss/cli`
- [Manrope](https://fonts.google.com/specimen/Manrope) + [Newsreader](https://fonts.google.com/specimen/Newsreader) — headings and legal body text
- Design system based on `design.zip` (see `stitch/lex_scripta/DESIGN.md` inside the archive)

## Getting Started

```bash
# Install dependencies
npm install

# Build the site (Eleventy + Tailwind CSS)
npm run build

# Output is in _site/
```

To develop with live reload:

```bash
# In one terminal — Eleventy dev server
npm run dev:11ty

# In another terminal — Tailwind CSS watcher
npm run dev:css
```

## Project Structure

```
├── .eleventy.js              # Eleventy configuration (filters, collections, dirs)
├── package.json              # Build scripts and dependencies
├── scripts/
│   ├── scrape-dma.js         # Parser: converts raw HTML → structured JSON
│   └── dma-raw.html          # Cached DMA source HTML from EUR-Lex
├── src/
│   ├── _data/
│   │   ├── articles.json     # 54 articles with paragraphs and sub-points
│   │   ├── chapters.json     # 6 chapters (I–VI) with titles
│   │   ├── recitals.json     # 109 recitals with text and HTML
│   │   └── recitalMap.json   # Article → recital mappings (manually curated)
│   ├── _includes/
│   │   ├── base.njk          # HTML shell layout
│   │   ├── header.njk        # Top navigation bar
│   │   └── footer.njk        # Footer with EU Official Journal link
│   ├── articles/
│   │   └── article.njk       # Article page template (paginated, one per article)
│   ├── css/
│   │   └── main.css          # Tailwind CSS input with design system tokens
│   ├── index.njk             # Home page — chapter-grouped article listing
│   └── recitals.njk          # Recitals listing page
├── design.zip                # Design reference (mockups + DESIGN.md)
└── _site/                    # Built output (gitignored)
```

## Recital Mapping

The file `src/_data/recitalMap.json` maps article paragraphs to their related recitals. Format:

```json
{
  "3": {
    "1": [15, 16, 17, 18, 22],
    "2": [15, 22],
    "9": [23]
  }
}
```

This means Article 3, paragraph 1 relates to Recitals 15, 16, 17, 18, and 22. A few sample mappings are included; the rest can be filled in manually.

## Re-scraping the DMA Text

If the source data needs to be regenerated from the raw HTML:

```bash
npm run scrape
```

This runs `scripts/scrape-dma.js`, which parses `scripts/dma-raw.html` and writes the JSON data files to `src/_data/`. The raw HTML was fetched from [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022R1925).

## Build Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Full production build (Eleventy + Tailwind) |
| `npm run build:11ty` | Build Eleventy templates only |
| `npm run build:css` | Build and minify Tailwind CSS only |
| `npm run dev:11ty` | Eleventy dev server with live reload |
| `npm run dev:css` | Tailwind CSS watch mode |
| `npm run scrape` | Re-parse DMA HTML into JSON data files |

## License

This is an unofficial presentation of the Digital Markets Act for informational purposes. The official text is published in the [Official Journal of the European Union](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022R1925).

# Digital Markets Act

A clean, navigable website for browsing the full text of the [Digital Markets Act](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022R1925) (EU Regulation 2022/1925). Each article has its own page with numbered paragraphs, lettered sub-points, and a sidebar linking to related recitals.

## Features

- **Index page** — All 54 articles grouped by their 6 chapters, with About the DMA section
- **Article pages** — Full text with paragraph structure, chapter sidebar navigation, and previous/next article links
- **Inline recitals** — Related recitals shown next to the paragraph they apply to (109 recitals mapped to articles)
- **Recitals page** — All 109 recitals with back-links to their corresponding article paragraph
- **Gatekeepers page** — 7 designated gatekeepers with their core platform services, compliance reports, and consumer profiling reports
- **Search** (`Ctrl+F`) — Full-text search across articles, recitals, and gatekeepers
- **Go to** (`Ctrl+G`) — Quick navigation: type `5` for Article 5, `5.9` for Article 5 ¶9, or `r36` for Recital 36
- **Auto-linked references** — Cross-references to other DMA articles link to those pages; EU legislation references (GDPR, ePrivacy Directive, etc.) link to EUR-Lex
- **Responsive design** — Mobile navigation with collapsible menu; desktop layout with sidebar

## URL Schema

| Page | URL | Example |
|------|-----|---------|
| Index | `/` | `/` |
| Article | `/N/` | `/5/` |
| Article paragraph | `/N/#P` | `/5/#2` |
| Recitals | `/r/` | `/r/` |
| Recital anchor | `/r/#rN` | `/r/#r36` |
| Gatekeepers | `/g/` | `/g/` |
| Gatekeeper anchor | `/g/#TICKER` | `/g/#msft` |

## Tech Stack

- [Eleventy](https://www.11ty.dev/) (v3) — static site generator with Nunjucks templates
- [Tailwind CSS](https://tailwindcss.com/) (v4) — locally generated via `@tailwindcss/cli`
- [Manrope](https://fonts.google.com/specimen/Manrope) + [Newsreader](https://fonts.google.com/specimen/Newsreader) — headings and legal body text
- [Terser](https://terser.org/) — JavaScript minification for production builds
- Design system based on DESIGN.md (Manrope + Newsreader, tonal layering, "Modern Archivist" aesthetic)

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
npm run dev
```

This runs Eleventy's dev server and Tailwind's CSS watcher concurrently.

## Project Structure

```
├── .eleventy.js              # Eleventy config (filters, transforms, auto-linking)
├── Dockerfile                # Multi-stage: node build → nginx:stable-alpine serve
├── nginx.conf                # Gzip, caching, clean URLs, security headers, redirects
├── .github/workflows/
│   └── build.yml             # CI: build and push container to GHCR on push to main
├── package.json              # Build scripts and dependencies
├── scripts/
│   ├── scrape-dma.js         # Parser: converts raw HTML → structured JSON
│   ├── map-recitals.js       # Recital-to-article mapping analysis tool
│   └── dma-raw.html          # Cached DMA source HTML from EUR-Lex
├── src/
│   ├── _data/
│   │   ├── articles.json     # 54 articles with paragraphs and sub-points
│   │   ├── chapters.json     # 6 chapters (I–VI) with titles
│   │   ├── recitals.json     # 109 recitals with text and HTML
│   │   ├── recitalMap.json   # Article → recital mappings (manually curated)
│   │   └── gatekeepers.json  # 7 designated gatekeepers with services and reports
│   ├── _includes/
│   │   ├── base.njk          # HTML shell layout
│   │   ├── header.njk        # Top navigation bar with search button
│   │   └── footer.njk        # Footer with EUR-Lex disclaimer
│   ├── articles/
│   │   └── article.njk       # Article page template (paginated, one per article)
│   ├── css/
│   │   └── main.css          # Tailwind CSS input with design system tokens
│   ├── js/
│   │   └── commands.js       # Search, go-to-article/recital UI (minified in prod)
│   ├── search-index.njk      # Generates /search-index.json at build time
│   ├── index.njk             # Home page — chapter-grouped article listing
│   ├── recitals.njk          # Recitals listing page
│   └── gatekeepers.njk       # Designated gatekeepers page
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

This means Article 3, paragraph 1 relates to Recitals 15, 16, 17, 18, and 22. All 109 recitals are mapped to their corresponding articles. Recitals appear inline next to the paragraph they apply to.

## Re-scraping the DMA Text

If the source data needs to be regenerated from the raw HTML:

```bash
npm run scrape
```

This runs `scripts/scrape-dma.js`, which parses `scripts/dma-raw.html` and writes the JSON data files to `src/_data/`. The raw HTML was fetched from [EUR-Lex](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022R1925).

## Docker

The site is containerized with nginx for production deployment:

```bash
# Build the container
docker build -t digitalmarketsact .

# Run locally on port 8080
docker run -p 8080:80 digitalmarketsact
```

The GitHub Action automatically builds and pushes to `ghcr.io/adrianba/digitalmarketsact:latest` on every push to main.

The nginx configuration includes:
- Gzip compression for HTML, CSS, JS, JSON, SVG
- Cache headers (1 year for static assets, no-cache for HTML)
- HSTS, Content-Security-Policy, and Permissions-Policy security headers
- 301 redirects: `www.*` → non-www, `dma.bz` → `digitalmarketsact.com`

## Build Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Full production build (Eleventy + Tailwind + JS minification) |
| `npm run build:11ty` | Build Eleventy templates only |
| `npm run build:css` | Build and minify Tailwind CSS only |
| `npm run build:js` | Minify JavaScript with Terser |
| `npm run dev` | Run Eleventy + Tailwind concurrently with live reload |
| `npm run dev:11ty` | Eleventy dev server only |
| `npm run dev:css` | Tailwind CSS watch mode only |
| `npm run scrape` | Re-parse DMA HTML into JSON data files |

## License

This is an unofficial presentation of the Digital Markets Act for informational purposes. The official text is published in the [Official Journal of the European Union](https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32022R1925).

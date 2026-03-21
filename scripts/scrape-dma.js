/**
 * scrape-dma.js — Parse the Digital Markets Act HTML into structured JSON data files.
 *
 * Usage: node scripts/scrape-dma.js
 *
 * Reads scripts/dma-raw.html and produces:
 *   src/_data/chapters.json
 *   src/_data/articles.json
 *   src/_data/recitals.json
 *   src/_data/recitalMap.json (skeleton only, if not already present)
 */

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

const HTML_PATH = path.join(__dirname, "dma-raw.html");
const DATA_DIR = path.join(__dirname, "..", "src", "_data");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/**
 * Extract text content from an element, cleaning whitespace and removing footnote markers.
 */
function cleanText($, el) {
  // Clone the element to avoid modifying the original
  const clone = $(el).clone();
  // Remove footnote reference links
  clone.find("a[href^='#ntr']").remove();
  clone.find(".oj-super.oj-note-tag").remove();
  let text = clone.text().replace(/\s+/g, " ").trim();
  return text;
}

/**
 * Extract HTML content from an element, cleaning footnote markers but keeping formatting.
 */
function cleanHtml($, el) {
  const clone = $(el).clone();
  clone.find("a[href^='#ntr']").remove();
  clone.find("a[href^='#ntc']").remove();
  clone.find(".oj-super.oj-note-tag").remove();
  let html = clone.html() || "";
  // Convert oj-italic spans to <em>
  html = html.replace(/<span class="oj-italic">(.*?)<\/span>/g, "<em>$1</em>");
  // Strip remaining span tags but keep content
  html = html.replace(/<span[^>]*>(.*?)<\/span>/g, "$1");
  // Clean extra whitespace
  html = html.replace(/\s+/g, " ").trim();
  return html;
}

/**
 * Parse a table-based list item (used for numbered/lettered sub-points).
 * Returns { label, text, html, subpoints[] }
 */
function parseTableItem($, table) {
  const rows = $(table).find("> tbody > tr, > tr");
  if (rows.length === 0) return null;

  const row = rows.first();
  const cells = row.find("> td");
  if (cells.length < 2) return null;

  const label = cleanText($, cells.eq(0)).replace(/\s+/g, "");
  const contentCell = cells.eq(1);

  // Check for nested tables (sub-points)
  const nestedTables = contentCell.find("> table");
  const subpoints = [];

  if (nestedTables.length > 0) {
    // Get the intro text (paragraphs before nested tables)
    const introParas = contentCell.find("> p.oj-normal");
    const introText = introParas
      .map(function () {
        return cleanText($, this);
      })
      .get()
      .join(" ");
    const introHtml = introParas
      .map(function () {
        return cleanHtml($, this);
      })
      .get()
      .join(" ");

    nestedTables.each(function () {
      const sub = parseTableItem($, this);
      if (sub) subpoints.push(sub);
    });

    return { label, text: introText, html: introHtml, subpoints };
  } else {
    // Simple item — may have multiple paragraphs
    const paras = contentCell.find("> p.oj-normal");
    const text = paras
      .map(function () {
        return cleanText($, this);
      })
      .get()
      .join("\n\n");
    const html = paras
      .map(function () {
        return cleanHtml($, this);
      })
      .get()
      .join("</p><p>");
    return { label, text, html: html ? `<p>${html}</p>` : "", subpoints };
  }
}

function parseRecitals($) {
  const recitals = [];
  $('[id^="rct_"]').each(function () {
    const id = $(this).attr("id");
    const num = parseInt(id.replace("rct_", ""), 10);
    if (isNaN(num)) return;

    // Recitals are in tables with (number) in first cell, text in second
    const cells = $(this).find("td");
    if (cells.length >= 2) {
      const paras = cells.last().find("p.oj-normal");
      const text = paras
        .map(function () {
          return cleanText($, this);
        })
        .get()
        .join("\n\n");
      const html = paras
        .map(function () {
          return cleanHtml($, this);
        })
        .get()
        .map((h) => `<p>${h}</p>`)
        .join("\n");
      recitals.push({ number: num, text, html });
    }
  });
  return recitals.sort((a, b) => a.number - b.number);
}

function parseChaptersAndArticles($) {
  const chapters = [];
  const articles = [];
  let currentChapter = null;

  // Find all chapter headings (div[id^="cpt_"])
  $('[id^="cpt_"]').each(function () {
    const id = $(this).attr("id") || "";
    if (!id.match(/^cpt_[IVXLCDM]+$/)) return;

    const chapterLabel = cleanText($, $(this).find(".oj-ti-section-1").first());
    const chapterTitle = cleanText($, $(this).find(".oj-ti-section-2").first());
    const romanMatch = chapterLabel.match(/CHAPTER\s+([IVXLCDM]+)/i);
    const roman = romanMatch ? romanMatch[1] : id.replace("cpt_", "");
    const chapterNum = romanToInt(roman);
    currentChapter = {
      number: chapterNum,
      roman: roman,
      label: chapterLabel,
      title: chapterTitle,
    };
    chapters.push(currentChapter);
  });

  // Find all articles
  $(".eli-subdivision").each(function () {
    const id = $(this).attr("id") || "";

    // Article: id like "art_1", "art_2", etc.
    if (id.match(/^art_\d+$/)) {
      // Determine which chapter this article belongs to by walking up
      const closestChapter = $(this).closest('[id^="cpt_"]');
      if (closestChapter.length) {
        const cptId = closestChapter.attr("id");
        const roman = cptId.replace("cpt_", "");
        const chNum = romanToInt(roman);
        currentChapter = chapters.find((c) => c.number === chNum) || null;
      }
      const artNum = parseInt(id.replace("art_", ""), 10);

      // Get article title
      const titleEl = $(this).find(".oj-sti-art").first();
      const title = titleEl.length ? cleanText($, titleEl) : "";

      // Parse paragraphs
      const paragraphs = [];

      // Find paragraph divs (id format: "NNN.NNN" like "001.001")
      const artNumPadded = String(artNum).padStart(3, "0");
      $(this)
        .find(`[id^="${artNumPadded}."]`)
        .each(function () {
          const paraId = $(this).attr("id");
          const paraNumStr = paraId.split(".")[1];
          const paraNum = parseInt(paraNumStr, 10);

          // Get paragraph text
          const directParas = $(this).find("> p.oj-normal");
          const tables = $(this).find("> table");
          const nestedDivs = $(this).find("> .eli-subdivision");

          // Collect sub-points from tables
          const subpoints = [];
          tables.each(function () {
            const item = parseTableItem($, this);
            if (item) subpoints.push(item);
          });

          // Also check for nested subdivisions with tables
          nestedDivs.each(function () {
            $(this)
              .find("> table")
              .each(function () {
                const item = parseTableItem($, this);
                if (item) subpoints.push(item);
              });
          });

          const text = directParas
            .map(function () {
              return cleanText($, this);
            })
            .get()
            .join("\n\n");
          const html = directParas
            .map(function () {
              return cleanHtml($, this);
            })
            .get()
            .map((h) => `<p>${h}</p>`)
            .join("\n");

          paragraphs.push({
            number: paraNum,
            text,
            html,
            subpoints,
          });
        });

      // Some articles don't use numbered paragraph divs — they have content directly
      if (paragraphs.length === 0) {
        // Check for direct tables (like Article 2 definitions)
        const directTables = $(this).find(
          ":scope > table, :scope > .eli-subdivision:not([id^='art_']) > table"
        );
        const directParas = $(this).find("> p.oj-normal");

        // Try to find content that isn't the title
        const subpoints = [];
        $(this)
          .children("table")
          .each(function () {
            const item = parseTableItem($, this);
            if (item) subpoints.push(item);
          });

        let introText = "";
        let introHtml = "";
        directParas.each(function () {
          const t = cleanText($, this);
          if (t && !t.match(/^Article\s+\d+/)) {
            introText += (introText ? "\n\n" : "") + t;
            introHtml +=
              (introHtml ? "\n" : "") + `<p>${cleanHtml($, this)}</p>`;
          }
        });

        if (introText || subpoints.length > 0) {
          paragraphs.push({
            number: 0,
            text: introText,
            html: introHtml,
            subpoints,
          });
        }
      }

      articles.push({
        number: artNum,
        title,
        chapter: currentChapter ? currentChapter.number : null,
        chapterRoman: currentChapter ? currentChapter.roman : null,
        paragraphs,
      });
    }
  });

  return { chapters, articles };
}

/**
 * Special-case Article 2 (Definitions): promote each numbered definition
 * from a subpoint into its own paragraph so they can be individually
 * linked and searched.
 */
function promoteArticle2Definitions(articles) {
  const art2 = articles.find((a) => a.number === 2);
  if (!art2 || art2.paragraphs.length !== 1) return;

  const para0 = art2.paragraphs[0];
  const newParagraphs = [
    {
      number: 0,
      text: para0.text,
      html: para0.html,
      subpoints: [],
    },
  ];

  for (const sp of para0.subpoints) {
    const num = parseInt(sp.label.replace(/[()]/g, ""), 10);
    if (isNaN(num)) continue;
    newParagraphs.push({
      number: num,
      text: sp.label + " " + sp.text,
      html: sp.html
        ? `<p>${sp.label} ${sp.html.replace(/<\/?p>/g, "")}</p>`
        : "",
      subpoints: sp.subpoints || [],
    });
  }

  art2.paragraphs = newParagraphs;
}

function romanToInt(roman) {
  const map = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };
  let result = 0;
  const s = roman.toUpperCase();
  for (let i = 0; i < s.length; i++) {
    const curr = map[s[i]] || 0;
    const next = map[s[i + 1]] || 0;
    if (curr < next) {
      result -= curr;
    } else {
      result += curr;
    }
  }
  return result;
}

function main() {
  console.log("Reading DMA HTML...");
  const html = fs.readFileSync(HTML_PATH, "utf-8");
  const $ = cheerio.load(html, { xmlMode: false });

  ensureDir(DATA_DIR);

  // Parse recitals
  console.log("Parsing recitals...");
  const recitals = parseRecitals($);
  console.log(`  Found ${recitals.length} recitals`);

  // Parse chapters and articles
  console.log("Parsing chapters and articles...");
  const { chapters, articles } = parseChaptersAndArticles($);
  promoteArticle2Definitions(articles);
  console.log(`  Found ${chapters.length} chapters`);
  console.log(`  Found ${articles.length} articles`);

  // Write data files
  const recitalsPath = path.join(DATA_DIR, "recitals.json");
  fs.writeFileSync(recitalsPath, JSON.stringify(recitals, null, 2));
  console.log(`  Wrote ${recitalsPath}`);

  const chaptersPath = path.join(DATA_DIR, "chapters.json");
  fs.writeFileSync(chaptersPath, JSON.stringify(chapters, null, 2));
  console.log(`  Wrote ${chaptersPath}`);

  const articlesPath = path.join(DATA_DIR, "articles.json");
  fs.writeFileSync(articlesPath, JSON.stringify(articles, null, 2));
  console.log(`  Wrote ${articlesPath}`);

  // Create skeleton recitalMap.json if it doesn't exist
  const recitalMapPath = path.join(DATA_DIR, "recitalMap.json");
  if (!fs.existsSync(recitalMapPath)) {
    const skeleton = {};
    for (const art of articles) {
      skeleton[String(art.number)] = {};
    }
    fs.writeFileSync(recitalMapPath, JSON.stringify(skeleton, null, 2));
    console.log(`  Wrote skeleton ${recitalMapPath}`);
  } else {
    console.log(`  ${recitalMapPath} already exists, skipping`);
  }

  // Print summary
  console.log("\nSummary:");
  for (const ch of chapters) {
    const chArticles = articles.filter((a) => a.chapter === ch.number);
    console.log(
      `  Chapter ${ch.roman}: ${ch.title} (${chArticles.length} articles)`
    );
    for (const art of chArticles) {
      const paraCount = art.paragraphs.length;
      console.log(
        `    Article ${art.number}: ${art.title || "(no title)"} — ${paraCount} paragraph(s)`
      );
    }
  }
}

main();

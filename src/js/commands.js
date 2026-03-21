(function () {
  "use strict";

  let searchIndex = null;
  let articles = null;
  let recitals = null;

  // --- Data loading ---
  async function ensureData() {
    if (searchIndex) return;
    const res = await fetch("/search-index.json");
    const data = await res.json();
    searchIndex = data;
    articles = data.filter((e) => e.type === "article");
    recitals = data.filter((e) => e.type === "recital");
  }

  // --- Modal infrastructure ---
  function createModal(id) {
    let overlay = document.getElementById(id);
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = id;
    overlay.className = "dma-modal-overlay";
    overlay.innerHTML = `
      <div class="dma-modal">
        <div class="dma-modal-header">
          <span class="dma-modal-title"></span>
          <kbd class="dma-modal-kbd"></kbd>
        </div>
        <input type="text" class="dma-modal-input" autocomplete="off" spellcheck="false">
        <div class="dma-modal-results"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.addEventListener("click", function (e) {
      if (e.target === overlay) closeModal(id);
    });

    return overlay;
  }

  function openModal(id, title, kbd, placeholder, onInput) {
    const overlay = createModal(id);
    overlay.querySelector(".dma-modal-title").textContent = title;
    overlay.querySelector(".dma-modal-kbd").textContent = kbd;
    const input = overlay.querySelector(".dma-modal-input");
    input.placeholder = placeholder;
    input.value = "";
    overlay.querySelector(".dma-modal-results").innerHTML = "";
    overlay.classList.add("active");
    input.focus();

    // Store selected index
    overlay._selectedIdx = 0;

    input.oninput = function () {
      overlay._selectedIdx = 0;
      onInput(input.value, overlay);
    };

    input.onkeydown = function (e) {
      const results = overlay.querySelector(".dma-modal-results");
      const items = results.querySelectorAll(".dma-result-item");
      if (e.key === "Escape") {
        closeModal(id);
        e.preventDefault();
      } else if (e.key === "ArrowDown") {
        overlay._selectedIdx = Math.min(overlay._selectedIdx + 1, items.length - 1);
        updateSelection(items, overlay._selectedIdx);
        e.preventDefault();
      } else if (e.key === "ArrowUp") {
        overlay._selectedIdx = Math.max(overlay._selectedIdx - 1, 0);
        updateSelection(items, overlay._selectedIdx);
        e.preventDefault();
      } else if (e.key === "Enter") {
        const selected = items[overlay._selectedIdx];
        if (selected) {
          const link = selected.querySelector("a");
          if (link) window.location.href = link.href;
        }
        closeModal(id);
        e.preventDefault();
      }
    };

    // Trigger initial render
    onInput("", overlay);
  }

  function closeModal(id) {
    const overlay = document.getElementById(id);
    if (overlay) overlay.classList.remove("active");
  }

  function updateSelection(items, idx) {
    items.forEach((item, i) => {
      item.classList.toggle("selected", i === idx);
      if (i === idx) item.scrollIntoView({ block: "nearest" });
    });
  }

  function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function highlightMatch(text, query) {
    if (!query) return escapeHtml(text);
    const escaped = escapeHtml(text);
    const re = new RegExp("(" + query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "gi");
    return escaped.replace(re, '<mark class="dma-highlight">$1</mark>');
  }

  // --- Search (Ctrl+F) ---
  async function openSearch() {
    await ensureData();
    openModal("dma-search", "Search", "Ctrl+F", "Search articles and recitals…", function (query, overlay) {
      const results = overlay.querySelector(".dma-modal-results");
      if (!query || query.length < 2) {
        results.innerHTML = '<div class="dma-result-hint">Type at least 2 characters to search</div>';
        return;
      }
      const q = query.toLowerCase();
      const matches = [];
      for (const entry of searchIndex) {
        if (!entry.text) continue;
        const idx = entry.text.toLowerCase().indexOf(q);
        if (idx === -1) continue;
        const start = Math.max(0, idx - 40);
        const end = Math.min(entry.text.length, idx + query.length + 80);
        const snippet = (start > 0 ? "…" : "") + entry.text.slice(start, end) + (end < entry.text.length ? "…" : "");
        matches.push({ entry, snippet });
        if (matches.length >= 30) break;
      }

      if (matches.length === 0) {
        results.innerHTML = '<div class="dma-result-hint">No results</div>';
        return;
      }

      results.innerHTML = matches
        .map(function (m, i) {
          const label =
            m.entry.type === "article"
              ? "Article " + m.entry.article + (m.entry.paragraph > 0 ? "(" + m.entry.paragraph + ")" : "") +
                (m.entry.title ? " — " + escapeHtml(m.entry.title) : "")
              : "Recital " + m.entry.number;
          return (
            '<div class="dma-result-item' + (i === 0 ? " selected" : "") + '">' +
            '<a href="' + m.entry.url + '">' +
            '<div class="dma-result-label">' + label + "</div>" +
            '<div class="dma-result-snippet">' + highlightMatch(m.snippet, query) + "</div>" +
            "</a></div>"
          );
        })
        .join("");
      overlay._selectedIdx = 0;
    });
  }

  // --- Go to Article (Ctrl+G) ---
  async function openGotoArticle() {
    await ensureData();
    // Build article list for preview
    const artMap = {};
    for (const e of articles) {
      if (!artMap[e.article]) {
        artMap[e.article] = { number: e.article, title: e.title, chapter: e.chapter, chapterTitle: e.chapterTitle, paragraphs: [] };
      }
      if (e.paragraph > 0 && !artMap[e.article].paragraphs.includes(e.paragraph)) {
        artMap[e.article].paragraphs.push(e.paragraph);
      }
    }
    const artList = Object.values(artMap).sort(function (a, b) { return a.number - b.number; });

    openModal("dma-goto-article", "Go to Article", "Ctrl+G", 'e.g. "5" or "5.9" or "5 9"', function (query, overlay) {
      const results = overlay.querySelector(".dma-modal-results");
      const q = query.trim();

      // Parse input
      let artNum = null;
      let paraNum = null;
      const match = q.match(/^(\d+)(?:[.\s]+(\d+))?$/);
      if (match) {
        artNum = parseInt(match[1], 10);
        paraNum = match[2] ? parseInt(match[2], 10) : null;
      }

      // Filter articles
      let filtered = artList;
      if (artNum !== null) {
        filtered = artList.filter(function (a) { return String(a.number).startsWith(String(artNum)); });
      }

      if (filtered.length === 0) {
        results.innerHTML = '<div class="dma-result-hint">No matching article</div>';
        return;
      }

      results.innerHTML = filtered
        .slice(0, 20)
        .map(function (a, i) {
          const isExact = a.number === artNum;
          const url = "/articles/" + a.number + "/" + (paraNum ? "#para-" + paraNum : "");
          const paraPreview =
            isExact && a.paragraphs.length > 0
              ? '<div class="dma-result-paras">' +
                a.paragraphs
                  .sort(function (x, y) { return x - y; })
                  .map(function (p) {
                    return '<span class="dma-para-chip' + (p === paraNum ? " active" : "") + '">¶' + p + "</span>";
                  })
                  .join("") +
                "</div>"
              : "";
          const selected = i === 0 ? " selected" : "";
          return (
            '<div class="dma-result-item' + selected + '">' +
            '<a href="' + url + '">' +
            '<div class="dma-result-label">' +
            '<span class="dma-result-num">Art. ' + a.number + "</span> " +
            escapeHtml(a.title || "") +
            '<span class="dma-result-chapter">Ch. ' + a.chapter + "</span>" +
            "</div>" +
            paraPreview +
            "</a></div>"
          );
        })
        .join("");
      overlay._selectedIdx = 0;
    });
  }

  // --- Go to Recital (Ctrl+H) ---
  async function openGotoRecital() {
    await ensureData();
    const recList = recitals
      .reduce(function (acc, e) {
        if (!acc.find(function (x) { return x.number === e.number; })) {
          acc.push(e);
        }
        return acc;
      }, [])
      .sort(function (a, b) { return a.number - b.number; });

    openModal("dma-goto-recital", "Go to Recital", "Ctrl+H", "Type recital number…", function (query, overlay) {
      const results = overlay.querySelector(".dma-modal-results");
      const q = query.trim();
      let filtered = recList;
      if (q) {
        filtered = recList.filter(function (r) { return String(r.number).startsWith(q); });
      }

      if (filtered.length === 0) {
        results.innerHTML = '<div class="dma-result-hint">No matching recital</div>';
        return;
      }

      results.innerHTML = filtered
        .slice(0, 20)
        .map(function (r, i) {
          const artRef =
            r.articleRef
              ? " → Art. " + r.articleRef.article + (r.articleRef.paragraph > 0 ? "(" + r.articleRef.paragraph + ")" : "")
              : "";
          const snippet = r.text ? r.text.substring(0, 120) + (r.text.length > 120 ? "…" : "") : "";
          const selected = i === 0 ? " selected" : "";
          return (
            '<div class="dma-result-item' + selected + '">' +
            '<a href="' + r.url + '">' +
            '<div class="dma-result-label">' +
            '<span class="dma-result-num">Recital ' + r.number + "</span>" +
            '<span class="dma-result-chapter">' + escapeHtml(artRef) + "</span>" +
            "</div>" +
            '<div class="dma-result-snippet">' + escapeHtml(snippet) + "</div>" +
            "</a></div>"
          );
        })
        .join("");
      overlay._selectedIdx = 0;
    });
  }

  // --- Keyboard shortcuts ---
  document.addEventListener("keydown", function (e) {
    // Ignore if typing in an input already inside a modal
    if (e.target.closest(".dma-modal")) return;

    if ((e.ctrlKey || e.metaKey) && e.key === "f") {
      e.preventDefault();
      openSearch();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "g") {
      e.preventDefault();
      openGotoArticle();
    } else if ((e.ctrlKey || e.metaKey) && e.key === "h") {
      e.preventDefault();
      openGotoRecital();
    } else if (e.key === "Escape") {
      closeModal("dma-search");
      closeModal("dma-goto-article");
      closeModal("dma-goto-recital");
    }
  });

  // --- Search button in header ---
  var searchBtn = document.getElementById("search-btn");
  if (searchBtn) {
    searchBtn.addEventListener("click", function () {
      openSearch();
    });
  }
})();

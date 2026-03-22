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
      // Handle clicks on result links
      var link = e.target.closest(".dma-result-item a");
      if (link) {
        e.preventDefault();
        navigateAndClose(link.href, id);
      }
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
          if (link) navigateAndClose(link.href, id);
        } else {
          closeModal(id);
        }
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

  function navigateAndClose(href, modalId) {
    closeModal(modalId);
    var url = new URL(href, window.location.origin);
    // Same page: scroll to hash target
    if (url.pathname === window.location.pathname) {
      if (url.hash) {
        var target = document.getElementById(url.hash.slice(1));
        if (target) {
          target.scrollIntoView({ behavior: "smooth" });
          history.replaceState(null, "", url.hash);
        }
      }
    } else {
      window.location.href = href;
    }
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

  // --- Unified command palette (Ctrl+F / Ctrl+G) ---
  async function openCommandPalette() {
    await ensureData();
    // Build article list
    var artMap = {};
    for (var i = 0; i < articles.length; i++) {
      var e = articles[i];
      if (!artMap[e.article]) {
        artMap[e.article] = { number: e.article, title: e.title, chapter: e.chapter, chapterTitle: e.chapterTitle, paragraphs: [] };
      }
      if (e.paragraph > 0 && artMap[e.article].paragraphs.indexOf(e.paragraph) === -1) {
        artMap[e.article].paragraphs.push(e.paragraph);
      }
    }
    var artList = Object.values(artMap).sort(function (a, b) { return a.number - b.number; });

    // Build recital list
    var recList = recitals
      .reduce(function (acc, e) {
        if (!acc.find(function (x) { return x.number === e.number; })) acc.push(e);
        return acc;
      }, [])
      .sort(function (a, b) { return a.number - b.number; });

    openModal("dma-cmd", "Search or Go to", "Ctrl+F", 'Search, or type "5", "5.9", "r36"', function (query, overlay) {
      var results = overlay.querySelector(".dma-modal-results");
      var q = query.trim();

      // Empty: show article list
      if (!q) {
        results.innerHTML = artList
          .slice(0, 15)
          .map(function (a, i) {
            return (
              '<div class="dma-result-item' + (i === 0 ? " selected" : "") + '">' +
              '<a href="/' + a.number + '/">' +
              '<div class="dma-result-label">' +
              '<span class="dma-result-num">Art. ' + a.number + "</span> " +
              escapeHtml(a.title || "") +
              '<span class="dma-result-chapter">Ch. ' + a.chapter + "</span>" +
              "</div></a></div>"
            );
          })
          .join("");
        overlay._selectedIdx = 0;
        return;
      }

      // Recital mode: starts with "r" or "R" followed by optional digits only
      var recMatch = q.match(/^[rR]\s*(\d*)$/);
      if (recMatch !== null) {
        var recNum = recMatch[1];
        var filtered = recList;
        if (recNum) {
          filtered = recList.filter(function (r) { return String(r.number).startsWith(recNum); });
        }
        if (filtered.length === 0) {
          results.innerHTML = '<div class="dma-result-hint">No matching recital</div>';
          return;
        }
        results.innerHTML = filtered
          .slice(0, 20)
          .map(function (r, i) {
            var artRef = r.articleRef
              ? " → Art. " + r.articleRef.article + (r.articleRef.paragraph > 0 ? "(" + r.articleRef.paragraph + ")" : "")
              : "";
            var snippet = r.text ? r.text.substring(0, 120) + (r.text.length > 120 ? "…" : "") : "";
            return (
              '<div class="dma-result-item' + (i === 0 ? " selected" : "") + '">' +
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
        return;
      }

      // Article goto mode: matches N, N.P, or N P
      var artMatch = q.match(/^(\d+)(?:[.\s]+(\d+))?$/);
      if (artMatch) {
        var artNum = parseInt(artMatch[1], 10);
        var paraNum = artMatch[2] ? parseInt(artMatch[2], 10) : null;
        var artFiltered = artList.filter(function (a) { return String(a.number).startsWith(String(artNum)); });

        if (artFiltered.length > 0) {
          results.innerHTML = artFiltered
            .slice(0, 20)
            .map(function (a, i) {
              var isExact = a.number === artNum;
              var url = "/" + a.number + "/" + (paraNum ? "#" + paraNum : "");
              var paraPreview =
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
              return (
                '<div class="dma-result-item' + (i === 0 ? " selected" : "") + '">' +
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
          return;
        }
      }

      // Full-text search mode (fallback)
      if (q.length < 2) {
        results.innerHTML = '<div class="dma-result-hint">Type at least 2 characters to search</div>';
        return;
      }
      var sq = q.toLowerCase();
      var matches = [];
      for (var j = 0; j < searchIndex.length; j++) {
        var entry = searchIndex[j];
        if (!entry.text) continue;
        var idx = entry.text.toLowerCase().indexOf(sq);
        if (idx === -1) continue;
        var start = Math.max(0, idx - 40);
        var end = Math.min(entry.text.length, idx + q.length + 80);
        var snippet = (start > 0 ? "…" : "") + entry.text.slice(start, end) + (end < entry.text.length ? "…" : "");
        matches.push({ entry: entry, snippet: snippet });
        if (matches.length >= 30) break;
      }

      if (matches.length === 0) {
        results.innerHTML = '<div class="dma-result-hint">No results</div>';
        return;
      }

      results.innerHTML = matches
        .map(function (m, i) {
          var label;
          if (m.entry.type === "article") {
            label = "Article " + m.entry.article + (m.entry.paragraph > 0 ? "(" + m.entry.paragraph + ")" : "") +
              (m.entry.title ? " — " + escapeHtml(m.entry.title) : "");
          } else if (m.entry.type === "gatekeeper") {
            label = "Gatekeeper — " + escapeHtml(m.entry.name);
          } else {
            label = "Recital " + m.entry.number;
          }
          return (
            '<div class="dma-result-item' + (i === 0 ? " selected" : "") + '">' +
            '<a href="' + m.entry.url + '">' +
            '<div class="dma-result-label">' + label + "</div>" +
            '<div class="dma-result-snippet">' + highlightMatch(m.snippet, q) + "</div>" +
            "</a></div>"
          );
        })
        .join("");
      overlay._selectedIdx = 0;
    });
  }

  // --- Keyboard shortcuts ---
  document.addEventListener("keydown", function (e) {
    if (e.target.closest(".dma-modal")) return;

    if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "g")) {
      e.preventDefault();
      openCommandPalette();
    } else if ((e.ctrlKey || e.metaKey) && e.key === ",") {
      var prev = document.querySelector('[data-nav="prev"]');
      if (prev) { e.preventDefault(); window.location.href = prev.href; }
    } else if ((e.ctrlKey || e.metaKey) && e.key === ".") {
      var next = document.querySelector('[data-nav="next"]');
      if (next) { e.preventDefault(); window.location.href = next.href; }
    } else if (e.key === "Escape") {
      closeModal("dma-cmd");
    }
  });

  // --- Search button in header ---
  var searchBtn = document.getElementById("search-btn");
  if (searchBtn) {
    searchBtn.addEventListener("click", function () {
      openCommandPalette();
    });
  }

  // --- Permalink copy-to-clipboard ---
  var PERMALINK_HOST = "https://dma.bz";
  var linkSvg14 = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
  var linkSvgBadge = '<svg class="permalink-badge-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';

  function createPermalinkBtn(path) {
    var btn = document.createElement("button");
    btn.className = "permalink-btn";
    btn.setAttribute("aria-label", "Copy permalink");
    btn.innerHTML = linkSvg14 + '<span class="permalink-toast">Copied</span>';
    btn.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      navigator.clipboard.writeText(PERMALINK_HOST + path).then(function () {
        var toast = btn.querySelector(".permalink-toast");
        toast.classList.add("show");
        setTimeout(function () { toast.classList.remove("show"); }, 1500);
      });
    });
    return btn;
  }

  // Attach permalink buttons to elements with data-permalink attribute
  document.querySelectorAll("[data-permalink]").forEach(function (el) {
    var path = el.getAttribute("data-permalink");

    // Badge mode: swap number for link icon on hover
    if (el.hasAttribute("data-permalink-badge")) {
      el.style.position = "relative";
      var numSpan = el.querySelector("span");
      // Insert link icon (hidden by default)
      var iconWrapper = document.createElement("span");
      iconWrapper.className = "permalink-badge-swap";
      iconWrapper.style.display = "none";
      iconWrapper.innerHTML = linkSvgBadge;
      el.appendChild(iconWrapper);
      // Toast
      var toast = document.createElement("span");
      toast.className = "permalink-toast";
      toast.textContent = "Copied";
      el.appendChild(toast);
      // Hover: swap number ↔ icon
      el.addEventListener("mouseenter", function () {
        if (numSpan) numSpan.style.display = "none";
        iconWrapper.style.display = "flex";
      });
      el.addEventListener("mouseleave", function () {
        if (numSpan) numSpan.style.display = "";
        iconWrapper.style.display = "none";
      });
      // Click
      el.addEventListener("click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        navigator.clipboard.writeText(PERMALINK_HOST + path).then(function () {
          toast.classList.add("show");
          setTimeout(function () { toast.classList.remove("show"); }, 1500);
        });
      });
      return;
    }

    // Icon mode: position a link icon to the left of content
    el.classList.add("permalink-parent");
    el.style.position = "relative";
    var btn = createPermalinkBtn(path);
    btn.style.position = "absolute";
    btn.style.left = "-1.5rem";
    btn.style.top = "0.25rem";
    el.insertBefore(btn, el.firstChild);
  });

  // --- Expandable recital cards ---
  document.querySelectorAll("[data-recital-expand]").forEach(function (card) {
    card.addEventListener("click", function () {
      var preview = card.querySelector(".recital-preview");
      var full = card.querySelector(".recital-full");
      var chevron = card.querySelector(".recital-chevron");
      if (!preview || !full) return;
      var isExpanded = !full.classList.contains("hidden");
      if (isExpanded) {
        full.classList.add("hidden");
        preview.classList.remove("hidden");
        if (chevron) chevron.style.transform = "";
      } else {
        preview.classList.add("hidden");
        full.classList.remove("hidden");
        if (chevron) chevron.style.transform = "rotate(180deg)";
      }
    });
  });

  // --- Dark mode toggle ---
  function updateDarkModeIcons() {
    var isDark = document.documentElement.classList.contains("dark");
    var sun = document.getElementById("dark-mode-icon-sun");
    var moon = document.getElementById("dark-mode-icon-moon");
    if (sun) sun.classList.toggle("hidden", !isDark);
    if (moon) moon.classList.toggle("hidden", isDark);
  }
  updateDarkModeIcons();

  var darkBtn = document.getElementById("dark-mode-btn");
  if (darkBtn) {
    darkBtn.addEventListener("click", function () {
      var isDark = document.documentElement.classList.toggle("dark");
      localStorage.setItem("darkMode", isDark);
      updateDarkModeIcons();
    });
  }
})();

module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/js");
  eleventyConfig.addPassthroughCopy("src/assets");

  // Auto-link EU legislation references to EUR-Lex
  const defined_celex = {
    "Regulation (EU) 2016/679": "32016R0679",
    "Regulation (EU) 2018/1725": "32018R1725",
    "Regulation (EU) 2019/1150": "32019R1150",
    // "Regulation (EU) 2022/1925" omitted — that's the DMA itself
    "Regulation (EU) No 182/2011": "32011R0182",
    "Regulation (EC) No 1/2003": "32003R0001",
    "Regulation (EC) No 139/2004": "32004R0139",
    "Directive 2002/58": "32002L0058",
    "Directive 2010/13": "32010L0013",
    "Directive (EU) 2015/1535": "32015L1535",
    "Directive (EU) 2015/2366": "32015L2366",
    "Directive (EU) 2016/1148": "32016L1148",
    "Directive (EU) 2016/2102": "32016L2102",
    "Directive (EU) 2018/1972": "32018L1972",
    "Directive (EU) 2019/882": "32019L0882",
    "Directive (EU) 2019/1937": "32019L1937",
    "Directive (EU) 2020/1828": "32020L1828",
  };

  eleventyConfig.addTransform("linkLegislation", function (content) {
    if (!(this.page.outputPath || "").endsWith(".html")) return content;
    for (const [name, celex] of Object.entries(defined_celex)) {
      const url = "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:" + celex;
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "(?:\\s|&nbsp;)");
      // Track <a> and data-no-autolink nesting to avoid linking inside
      var inSkip = 0;
      var re = new RegExp("(<a\\b[^>]*>|<\\/a>|<[^>]+data-no-autolink[^>]*>|<\\/h[1-6]>)|(" + escaped + ")", "gi");
      content = content.replace(re, function (match, tag, text) {
        if (tag) {
          if (tag.startsWith("</")) inSkip = Math.max(0, inSkip - 1);
          else if (!tag.endsWith("/>")) inSkip++;
          return match;
        }
        if (inSkip > 0) return match;
        return '<a href="' + url + '" class="recital-ref" target="_blank" rel="noopener">' + text + "</a>";
      });
    }
    return content;
  });

  // Auto-link internal DMA article references (Article 1–54)
  eleventyConfig.addTransform("linkArticleRefs", function (content) {
    if (!(this.page.outputPath || "").endsWith(".html")) return content;
    // Track <a> and data-no-autolink nesting to skip their content
    var inSkip = 0;
    var result = content.replace(/(<a\b[^>]*>|<\/a>|<[^>]+data-no-autolink[^>]*>|<\/h[1-6]>)|Article(?:&nbsp;|\s)+(\d{1,2})(?:\((\d+)\))?/gi,
      function (match, tag, artStr, paraStr) {
        if (tag) {
          if (tag.startsWith("</")) inSkip = Math.max(0, inSkip - 1);
          else if (!tag.endsWith("/>")) inSkip++;
          return match;
        }
        if (inSkip > 0) return match;
        var artNum = parseInt(artStr, 10);
        if (artNum < 1 || artNum > 54) return match;
        var url = "/articles/" + artNum + "/";
        if (paraStr) url += "#para-" + paraStr;
        return '<a href="' + url + '" class="recital-ref">' + match + "</a>";
      }
    );
    return result;
  });

  // Make data available globally
  eleventyConfig.addGlobalData("site", {
    title: "Digital Markets Act",
    subtitle: "Regulation (EU) 2022/1925",
  });

  // Filter: get recitals for an article
  eleventyConfig.addFilter("recitalsForArticle", function (articleNum, recitalMap, recitals) {
    const mapping = recitalMap[String(articleNum)];
    if (!mapping) return [];
    // Collect all unique recital numbers from the mapping
    const recitalNums = new Set();
    if (typeof mapping === "object") {
      for (const key of Object.keys(mapping)) {
        if (Array.isArray(mapping[key])) {
          mapping[key].forEach((n) => recitalNums.add(n));
        }
      }
    }
    return recitals.filter((r) => recitalNums.has(r.number));
  });

  // Filter: get recitals for a specific paragraph
  eleventyConfig.addFilter("recitalsForParagraph", function (articleNum, paragraphNum, recitalMap, recitals) {
    const mapping = recitalMap[String(articleNum)];
    if (!mapping) return [];
    const nums = mapping[String(paragraphNum)];
    if (!Array.isArray(nums)) return [];
    return recitals.filter((r) => nums.includes(r.number));
  });

  // Filter: find which article/paragraph a recital maps to (reverse lookup)
  eleventyConfig.addFilter("articleForRecital", function (recitalNum, recitalMap) {
    for (const [artNum, paras] of Object.entries(recitalMap)) {
      for (const [paraNum, recs] of Object.entries(paras)) {
        if (Array.isArray(recs) && recs.includes(recitalNum)) {
          return { article: parseInt(artNum, 10), paragraph: parseInt(paraNum, 10) };
        }
      }
    }
    return null;
  });

  // Filter: find article by number
  eleventyConfig.addFilter("findArticle", function (articles, num) {
    return articles.find((a) => a.number === num);
  });

  // Filter: articles in a chapter
  eleventyConfig.addFilter("articlesInChapter", function (articles, chapterNumber) {
    return articles.filter((a) => a.chapter === chapterNumber);
  });

  // Filter: get previous article
  eleventyConfig.addFilter("prevArticle", function (articles, currentNum) {
    const sorted = [...articles].sort((a, b) => a.number - b.number);
    const idx = sorted.findIndex((a) => a.number === currentNum);
    return idx > 0 ? sorted[idx - 1] : null;
  });

  // Filter: get next article
  eleventyConfig.addFilter("nextArticle", function (articles, currentNum) {
    const sorted = [...articles].sort((a, b) => a.number - b.number);
    const idx = sorted.findIndex((a) => a.number === currentNum);
    return idx < sorted.length - 1 ? sorted[idx + 1] : null;
  });

  // Filter: find chapter by number
  eleventyConfig.addFilter("findChapter", function (chapters, num) {
    return chapters.find((c) => c.number === num);
  });


  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md", "html"],
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk",
  };
};

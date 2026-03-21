module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy("src/css");
  eleventyConfig.addPassthroughCopy("src/assets");

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

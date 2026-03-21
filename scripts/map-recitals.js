/**
 * Analyze recitals and articles to build a recital-to-article mapping.
 * 
 * Key insight: recitals are sequential — each recital applies to the same
 * article/paragraph as the previous one, or the next one in order.
 */

const fs = require("fs");
const path = require("path");

const articles = require("../src/_data/articles.json");
const recitals = require("../src/_data/recitals.json");

// Build a flat ordered list of (article, paragraph) pairs
const articleParas = [];
for (const art of articles) {
  if (art.paragraphs.length === 0) continue;
  for (const para of art.paragraphs) {
    articleParas.push({ artNum: art.number, paraNum: para.number, text: para.text, title: art.title });
  }
}

// Extract key phrases from each article paragraph for matching
function getKeyPhrases(text) {
  if (!text) return [];
  const lower = text.toLowerCase();
  const phrases = [];
  
  // Extract significant noun phrases and legal terms
  const terms = lower.match(/\b[a-z]{4,}\b/g) || [];
  return terms;
}

// Check if a recital explicitly mentions an article number
function findExplicitArticleRef(recitalText) {
  const matches = recitalText.match(/Article\s+(\d+)/gi);
  if (!matches) return [];
  return matches.map(m => parseInt(m.replace(/Article\s+/i, ''), 10));
}

// Score how well a recital matches an article paragraph
function scoreMatch(recitalText, artNum, paraNum, artTitle, paraText) {
  const rLower = recitalText.toLowerCase();
  let score = 0;
  
  // Explicit article reference is a strong signal
  const refs = findExplicitArticleRef(recitalText);
  if (refs.includes(artNum)) score += 50;
  
  // Title keyword matching
  if (artTitle) {
    const titleWords = artTitle.toLowerCase().split(/\s+/).filter(w => w.length > 3);
    for (const w of titleWords) {
      if (rLower.includes(w)) score += 5;
    }
  }
  
  // Paragraph text keyword matching
  if (paraText) {
    const paraWords = getKeyPhrases(paraText);
    const recWords = new Set(getKeyPhrases(recitalText));
    let overlap = 0;
    for (const w of paraWords) {
      if (recWords.has(w)) overlap++;
    }
    score += Math.min(overlap * 0.5, 20);
  }
  
  // Topic-specific matching
  const topicPatterns = [
    { pattern: /gatekeeper.*designat|designat.*gatekeeper/i, art: 3 },
    { pattern: /review.*status|status.*review/i, art: 4 },
    { pattern: /obligation.*gatekeeper|shall not.*gatekeeper/i, arts: [5, 6] },
    { pattern: /interoperab/i, art: 7 },
    { pattern: /compliance.*obligation|regulatory dialogue/i, art: 8 },
    { pattern: /suspen[ds]/i, art: 9 },
    { pattern: /exempt.*public.*(?:health|security)|public.*(?:health|security).*exempt/i, art: 10 },
    { pattern: /anti.?circumvention/i, art: 13 },
    { pattern: /concentrat.*inform|merger.*notif/i, art: 14 },
    { pattern: /audit/i, art: 15 },
    { pattern: /market investigation/i, arts: [16, 17, 18, 19] },
    { pattern: /systematic.*non.?compliance/i, art: 18 },
    { pattern: /interim measure/i, art: 24 },
    { pattern: /commitment/i, art: 25 },
    { pattern: /monitor/i, art: 26 },
    { pattern: /compliance function/i, art: 28 },
    { pattern: /non.?compliance.*decision|infringement/i, art: 29 },
    { pattern: /\bfine[sd]?\b.*percent|turnover.*fine/i, art: 30 },
    { pattern: /periodic.*penalty/i, art: 31 },
    { pattern: /limitation.*period/i, arts: [32, 33] },
    { pattern: /right.*heard|access.*file/i, art: 34 },
    { pattern: /annual.*report/i, art: 35 },
    { pattern: /professional.*secrecy|confidential/i, art: 36 },
    { pattern: /cooperation.*national/i, arts: [37, 38] },
    { pattern: /national.*court/i, art: 39 },
    { pattern: /high.?level.*group|advisory.*group/i, art: 40 },
    { pattern: /representative.*action/i, art: 42 },
    { pattern: /whistle.?blow|reporting.*breach/i, art: 43 },
    { pattern: /delegated.*act/i, arts: [12, 49] },
    { pattern: /entry.*into.*force|application.*date/i, art: 54 },
    { pattern: /fundamental.*right/i, art: 1 },
  ];
  
  for (const tp of topicPatterns) {
    if (tp.pattern.test(recitalText)) {
      if (tp.art && tp.art === artNum) score += 15;
      if (tp.arts && tp.arts.includes(artNum)) score += 10;
    }
  }
  
  return score;
}

// Main mapping logic
function buildMapping() {
  const mapping = {};
  
  // Initialize
  for (const art of articles) {
    mapping[String(art.number)] = {};
  }
  
  // Known anchor points (from the user's example and analysis)
  // These help calibrate the sequential assignment
  const anchors = {
    // Recitals 1-11: General context, Article 1 (subject matter & scope)
    // Recitals 12-14: Article 2 (definitions) area  
    // Recitals 15-23: Article 3 (designation of gatekeepers)
    // Recitals 24-25: Article 4 (review of status)
    // Recitals 26-35: Articles 5-6 preamble/general obligations context
    // Recital 36: Article 5, paragraph 2 (user confirmed)
    // Recitals 37-38: Article 5, paragraph 2 (user confirmed)
    // Recital 39: Article 5, paragraph 3 (user confirmed)
  };

  // Score each recital against all article/paragraphs
  const recitalScores = [];
  for (const rec of recitals) {
    const scores = [];
    for (const ap of articleParas) {
      const s = scoreMatch(rec.text, ap.artNum, ap.paraNum, ap.title, ap.text);
      scores.push({ artNum: ap.artNum, paraNum: ap.paraNum, score: s });
    }
    scores.sort((a, b) => b.score - a.score);
    recitalScores.push({ recNum: rec.number, text: rec.text, scores });
  }

  // Sequential assignment with constraint:
  // Each recital maps to same or later article/paragraph as previous
  let currentArtIdx = 0; // index into articleParas
  
  for (const rs of recitalScores) {
    // Find best match that doesn't go backwards
    let bestIdx = currentArtIdx;
    let bestScore = -1;
    
    // Look at current position and forward (allow some look-ahead)
    const maxLookAhead = Math.min(currentArtIdx + 20, articleParas.length - 1);
    
    for (let i = currentArtIdx; i <= maxLookAhead; i++) {
      const ap = articleParas[i];
      const matchScore = rs.scores.find(s => s.artNum === ap.artNum && s.paraNum === ap.paraNum);
      const score = matchScore ? matchScore.score : 0;
      
      // Prefer staying at current position unless there's a strong signal to move forward
      const stayBonus = (i === currentArtIdx) ? 5 : 0;
      const adjustedScore = score + stayBonus;
      
      if (adjustedScore > bestScore) {
        bestScore = adjustedScore;
        bestIdx = i;
      }
    }
    
    // Also check if an explicit article reference pulls us forward
    const explicitRefs = findExplicitArticleRef(rs.text);
    if (explicitRefs.length > 0) {
      // Find the first articlePara index that matches any explicit ref and is >= currentArtIdx
      for (let i = currentArtIdx; i < articleParas.length; i++) {
        if (explicitRefs.includes(articleParas[i].artNum)) {
          if (i > bestIdx || bestScore < 30) {
            bestIdx = i;
          }
          break;
        }
      }
    }
    
    const chosen = articleParas[bestIdx];
    currentArtIdx = bestIdx;
    
    // Add to mapping
    const artKey = String(chosen.artNum);
    const paraKey = String(chosen.paraNum);
    if (!mapping[artKey][paraKey]) {
      mapping[artKey][paraKey] = [];
    }
    mapping[artKey][paraKey].push(rs.recNum);
    
    console.log(`Recital ${rs.recNum} → Article ${chosen.artNum}, para ${chosen.paraNum} (score: ${bestScore})`);
  }
  
  return mapping;
}

const mapping = buildMapping();

// Clean up empty entries
for (const artKey of Object.keys(mapping)) {
  if (Object.keys(mapping[artKey]).length === 0) {
    delete mapping[artKey];
  }
}

// Write output
const outPath = path.join(__dirname, "..", "src", "_data", "recitalMap.json");
fs.writeFileSync(outPath, JSON.stringify(mapping, null, 2));
console.log(`\nWrote mapping to ${outPath}`);

// Summary
console.log("\nSummary:");
for (const [artKey, paras] of Object.entries(mapping)) {
  const recNums = [];
  for (const nums of Object.values(paras)) {
    recNums.push(...nums);
  }
  if (recNums.length > 0) {
    console.log(`  Article ${artKey}: recitals ${recNums.join(", ")}`);
  }
}

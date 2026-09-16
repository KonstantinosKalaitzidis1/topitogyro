// Τραβάει ενεργές, εγκεκριμένες city πηγές + verified queue + διεθνές discovery για original "ΒΡΩΜΙΑ ΣΠΙΤΙ".
// Για τρίτες διεθνείς πηγές κρατά μόνο τίτλο/σύντομο snippet ως έμπνευση — ποτέ πλήρη συνταγή.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import Parser from "rss-parser";

const parser = new Parser({ timeout: 15000 });
const MAX_AGE_DAYS = Number(process.env.MAX_ITEM_AGE_DAYS || 30);

await mkdir("content", { recursive: true });

function katharise(s = "") {
  return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function kleidi(...parts) {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 24);
}

async function diavaseJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return fallback;
  }
}

function einaiProsfato(dateString) {
  if (!dateString || !MAX_AGE_DAYS) return true;
  const d = new Date(dateString);
  if (Number.isNaN(d.getTime())) return true;
  const ageMs = Date.now() - d.getTime();
  return ageMs <= MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
}

function inspirationScore(title = "", keywords = []) {
  const t = String(title).toLowerCase();
  const weights = {
    "sauce": 10, "dip": 10, "condiment": 10, "aioli": 10, "mayo": 10, "hot honey": 10,
    "burger": 9, "fries": 9, "sandwich": 9, "hot dog": 9, "wings": 9, "nachos": 9,
    "smash": 9, "sloppy": 8, "grilled cheese": 8, "quesadilla": 8, "taco": 8,
    "kebab": 8, "wrap": 8, "enchilada": 7, "pickle": 7, "spicy": 6, "crispy": 6,
    "fried": 6, "loaded": 6
  };
  return keywords.reduce((score, k) => {
    const key = String(k).toLowerCase();
    return score + (t.includes(key) ? (weights[key] || 1) : 0);
  }, 0);
}

async function pigi(p) {
  if (!p.energi) return [];

  const inspiration = p.mode === "recipe_inspiration";

  if (inspiration) {
    if (p.rights_status !== "discovery_only") {
      console.log(`  ΠΑΡΑΛΕΙΨΗ ${p.onoma}: recipe inspiration χρειάζεται rights_status=discovery_only`);
      return [];
    }
  } else {
    if (p.tier !== 1) {
      console.log(`  ΠΑΡΑΛΕΙΨΗ ${p.onoma}: tier ${p.tier}, μόνο tier 1 τρέχει αυτόματα`);
      return [];
    }
    if (p.rights_status !== "approved") {
      console.log(`  ΠΑΡΑΛΕΙΨΗ ${p.onoma}: rights_status=${p.rights_status || "missing"}`);
      return [];
    }
  }

  if (!p.feed) {
    console.log(`  ΠΑΡΑΛΕΙΨΗ ${p.onoma}: δεν έχει feed URL`);
    return [];
  }

  try {
    const f = await parser.parseURL(p.feed);
    const items = (f.items || [])
      .slice(0, 40)
      .filter(i => einaiProsfato(i.isoDate || i.pubDate || ""))
      .map(i => {
        const titlos = katharise(i.title);
        const itemUrl = i.link || "";
        const imerominia = i.isoDate || i.pubDate || "";
        const snippet = katharise(i.contentSnippet || i.content || i.summary || "");
        return {
          id: kleidi(p.onoma, i.guid || i.id || itemUrl || titlos, imerominia),
          pigi: p.onoma,
          pigi_url: p.url || "",
          source_item_url: itemUrl,
          titlos,
          proti_yli: snippet.slice(0, inspiration ? 500 : 600),
          imerominia,
          content_mode: inspiration ? "recipe_inspiration" : "facts",
          global: inspiration,
          inspiration_score: inspiration ? inspirationScore(titlos, p.keywords || []) : 0
        };
      })
      .filter(i => i.titlos)
      // Για ΒΡΩΜΙΑ ΣΠΙΤΙ μετράει μόνο ο ΤΙΤΛΟΣ. Έτσι ένα άσχετο soup/cake
      // δεν περνάει επειδή το snippet περιέχει τυχαία λέξεις όπως loaded/cheese/chicken.
      .filter(i => !inspiration || i.inspiration_score > 0);

    if (inspiration) items.sort((a, b) => b.inspiration_score - a.inspiration_score);
    return items;
  } catch (e) {
    console.log(`  ΣΦΑΛΜΑ ${p.onoma}: ${e.message}`);
    return [];
  }
}

function verifiedItems(queue, poli) {
  return (queue[poli] || [])
    .filter(i => i && i.verified === true && i.titlos && i.proti_yli)
    .map(i => ({
      id: i.id || kleidi("verified", poli, i.titlos, i.source_item_url || ""),
      pigi: i.pigi || "Verified source",
      pigi_url: i.pigi_url || "",
      source_item_url: i.source_item_url || i.pigi_url || "",
      titlos: katharise(i.titlos),
      proti_yli: katharise(i.proti_yli).slice(0, 1800),
      imerominia: i.imerominia || new Date().toISOString(),
      verified: true,
      content_mode: i.content_mode || "facts"
    }));
}

const pigis = JSON.parse(await readFile("sources.json", "utf8"));
const queue = await diavaseJson("content/verified-queue.json", { ath: [], thes: [] });
const history = await diavaseJson("content/history.json", { published_ids: [] });
const seen = new Set(history.published_ids || []);
const apotelesma = { ath: [], thes: [], global: [] };

for (const poli of ["ath", "thes"]) {
  console.log(`\n${poli.toUpperCase()}`);
  const ola = [];

  for (const p of pigis[poli] || []) {
    const items = await pigi(p);
    if (items.length) console.log(`  ${p.onoma}: ${items.length} νέα/πρόσφατα στοιχεία`);
    ola.push(...items);
  }

  const verified = verifiedItems(queue, poli);
  if (verified.length) console.log(`  VERIFIED QUEUE: ${verified.length} στοιχεία`);
  ola.push(...verified);

  const runSeen = new Set();
  apotelesma[poli] = ola.filter(i => {
    if (seen.has(i.id)) return false;
    const k = (i.source_item_url || i.titlos).toLowerCase().trim();
    if (runSeen.has(k)) return false;
    runSeen.add(k);
    return true;
  });
}

console.log("\nGLOBAL / ΒΡΩΜΙΑ ΣΠΙΤΙ");
{
  const ola = [];
  for (const p of pigis.global || []) {
    const items = await pigi(p);
    if (items.length) console.log(`  ${p.onoma}: ${items.length} στοχευμένες ιδέες`);
    ola.push(...items);
  }

  ola.sort((a, b) => (b.inspiration_score || 0) - (a.inspiration_score || 0));
  const runSeen = new Set();
  apotelesma.global = ola.filter(i => {
    if (seen.has(i.id)) return false;
    const k = (i.source_item_url || i.titlos).toLowerCase().trim();
    if (runSeen.has(k)) return false;
    runSeen.add(k);
    return true;
  });
}

await writeFile("content/items.json", JSON.stringify(apotelesma, null, 2));

const synolo = Object.values(apotelesma).reduce((a, b) => a + b.length, 0);
console.log(`\nΣύνολο νέων στοιχείων: ${synolo} → content/items.json`);

if (synolo === 0) {
  console.log("Καμία νέα εγκεκριμένη πηγή/ιστορία/ιδέα. Το site θα μείνει ως έχει.");
}

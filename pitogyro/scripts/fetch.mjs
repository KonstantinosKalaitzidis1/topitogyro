// Τραβάει ενεργές, εγκεκριμένες πηγές Tier 1 και βγάζει content/items.json.
// Κρατά μόνο σύντομη πρώτη ύλη/metadata για παραγωγή πρωτότυπου άρθρου.

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

async function pigi(p) {
  if (!p.energi) return [];
  if (p.tier !== 1) {
    console.log(`  ΠΑΡΑΛΕΙΨΗ ${p.onoma}: tier ${p.tier}, μόνο tier 1 τρέχει αυτόματα`);
    return [];
  }
  if (p.rights_status !== "approved") {
    console.log(`  ΠΑΡΑΛΕΙΨΗ ${p.onoma}: rights_status=${p.rights_status || "missing"}`);
    return [];
  }
  if (!p.feed) {
    console.log(`  ΠΑΡΑΛΕΙΨΗ ${p.onoma}: δεν έχει feed URL`);
    return [];
  }

  try {
    const f = await parser.parseURL(p.feed);
    return (f.items || [])
      .slice(0, 30)
      .filter(i => einaiProsfato(i.isoDate || i.pubDate || ""))
      .map(i => {
        const titlos = katharise(i.title);
        const itemUrl = i.link || "";
        const imerominia = i.isoDate || i.pubDate || "";
        return {
          id: kleidi(p.onoma, i.guid || i.id || itemUrl || titlos, imerominia),
          pigi: p.onoma,
          pigi_url: p.url || "",
          source_item_url: itemUrl,
          titlos,
          // Μέχρι 600 χαρακτήρες μόνο ως πρώτη ύλη για εξαγωγή facts.
          // Δεν δημοσιεύεται αυτούσιο.
          proti_yli: katharise(i.contentSnippet || i.content || i.summary || "").slice(0, 600),
          imerominia
        };
      })
      .filter(i => i.titlos);
  } catch (e) {
    console.log(`  ΣΦΑΛΜΑ ${p.onoma}: ${e.message}`);
    return [];
  }
}

const pigis = JSON.parse(await readFile("sources.json", "utf8"));
const history = await diavaseJson("content/history.json", { published_ids: [] });
const seen = new Set(history.published_ids || []);
const apotelesma = {};

for (const poli of ["ath", "thes"]) {
  console.log(`\n${poli.toUpperCase()}`);
  const ola = [];

  for (const p of pigis[poli] || []) {
    const items = await pigi(p);
    if (items.length) console.log(`  ${p.onoma}: ${items.length} νέα/πρόσφατα στοιχεία`);
    ola.push(...items);
  }

  // Αφαίρεση ήδη δημοσιευμένων και διπλότυπων τρέχοντος run.
  const runSeen = new Set();
  apotelesma[poli] = ola.filter(i => {
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
  console.log("Καμία νέα εγκεκριμένη πηγή/ιστορία. Το site θα μείνει ως έχει.");
}

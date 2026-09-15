// Τραβάει τις ενεργές πηγές Tier 1 και βγάζει content/items.json
// Δεν κρατάει το κείμενο του διοργανωτή — μόνο δεδομένα εκδήλωσης.

import { readFile, writeFile } from "node:fs/promises";
import Parser from "rss-parser";

const parser = new Parser({ timeout: 15000 });

function katharise(s = "") {
  return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function pigi(p) {
  if (!p.energi) return [];
  if (p.tier !== 1) {
    console.log(`  ΠΑΡΑΛΕΙΨΗ ${p.onoma}: tier ${p.tier}, μόνο tier 1 τρέχει αυτόματα`);
    return [];
  }
  if (!p.feed) {
    console.log(`  ΠΑΡΑΛΕΙΨΗ ${p.onoma}: δεν έχει feed URL`);
    return [];
  }

  try {
    const f = await parser.parseURL(p.feed);
    return (f.items || []).slice(0, 20).map(i => ({
      pigi: p.onoma,
      titlos: katharise(i.title),
      // Κρατάμε περίληψη ΜΟΝΟ ως πρώτη ύλη για εξαγωγή δεδομένων.
      // Δεν δημοσιεύεται ποτέ αυτούσια.
      proti_yli: katharise(i.contentSnippet || i.content || "").slice(0, 600),
      link: i.link || "",
      imerominia: i.isoDate || i.pubDate || ""
    }));
  } catch (e) {
    console.log(`  ΣΦΑΛΜΑ ${p.onoma}: ${e.message}`);
    return [];
  }
}

const pigis = JSON.parse(await readFile("sources.json", "utf8"));
const apotelesma = {};

for (const poli of ["ath", "thes"]) {
  console.log(`\n${poli.toUpperCase()}`);
  const ola = [];
  for (const p of pigis[poli] || []) {
    const items = await pigi(p);
    if (items.length) console.log(`  ${p.onoma}: ${items.length} στοιχεία`);
    ola.push(...items);
  }

  // αφαίρεση διπλότυπων με βάση τον τίτλο
  const dei = new Set();
  apotelesma[poli] = ola.filter(i => {
    const k = i.titlos.toLowerCase();
    if (dei.has(k)) return false;
    dei.add(k);
    return true;
  });
}

await writeFile("content/items.json", JSON.stringify(apotelesma, null, 2));

const synolo = Object.values(apotelesma).reduce((a, b) => a + b.length, 0);
console.log(`\nΣύνολο: ${synolo} στοιχεία → content/items.json`);

if (synolo === 0) {
  console.log("\nΚαμία ενεργή πηγή. Άνοιξε το sources.json, βάλε feed URL και energi: true.");
}

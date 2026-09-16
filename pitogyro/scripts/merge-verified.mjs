// Adds only first-party verified city records to content/items.json.
// Keeps discovery radar separate from publishable writer input.

import { readFile, writeFile } from "node:fs/promises";

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

function clean(s = "") {
  return String(s).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

const items = await readJson("content/items.json", { ath:[], thes:[], global:[] });
const auto = await readJson("content/auto-verified.json", { ath:[], thes:[] });
const history = await readJson("content/history.json", { published_ids:[], rejected_ids:[] });
const handled = new Set([...(history.published_ids || []), ...(history.rejected_ids || [])]);

for (const city of ["ath", "thes"]) {
  items[city] ||= [];
  const existing = new Set(items[city].map(x => x.id).filter(Boolean));
  let added = 0;

  for (const a of auto[city] || []) {
    if (!a?.verified || !a.id || handled.has(a.id) || existing.has(a.id)) continue;
    if (!a.pigi_url || !a.proti_yli || !a.titlos) continue;

    items[city].push({
      id: a.id,
      pigi: a.pigi || "Επίσημη first-party πηγή",
      pigi_url: a.pigi_url,
      source_item_url: a.source_item_url || a.pigi_url,
      titlos: clean(a.titlos),
      proti_yli: clean(a.proti_yli).slice(0, 2200),
      imerominia: a.imerominia || new Date().toISOString(),
      verified: true,
      verification_method: "first_party_page",
      content_mode: "facts"
    });
    existing.add(a.id);
    added++;
  }
  if (added) console.log(`MERGE VERIFIED ${city.toUpperCase()}: +${added}`);
}

await writeFile("content/items.json", JSON.stringify(items, null, 2));

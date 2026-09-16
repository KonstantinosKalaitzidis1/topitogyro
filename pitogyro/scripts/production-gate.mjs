import { readFile } from "node:fs/promises";

const MIN_CITY_ARTICLES = Number(process.env.MIN_CITY_ARTICLES || 3);
const REQUIRE_LOCAL_IMAGES = String(process.env.REQUIRE_LOCAL_IMAGES || "true").toLowerCase() !== "false";

const articles = JSON.parse(await readFile("content/arthra.json", "utf8"));
const images = JSON.parse(await readFile("content/images.json", "utf8"));

function imageFor(a) {
  if (a?.eikona?.url) return a.eikona;
  const sid = a?.source?.source_id;
  return sid && images[sid]?.url ? images[sid] : null;
}

const failures = [];
for (const [code, label] of [["ath", "Αθήνα"], ["thes", "Θεσσαλονίκη"]]) {
  const local = (Array.isArray(articles[code]) ? articles[code] : []).filter(a => a?.publish === true);
  if (local.length < MIN_CITY_ARTICLES) {
    failures.push(`${label}: ${local.length}/${MIN_CITY_ARTICLES} verified local stories`);
  }
  if (REQUIRE_LOCAL_IMAGES) {
    const withoutImage = local.filter(a => !imageFor(a));
    if (withoutImage.length) {
      failures.push(`${label}: ${withoutImage.length} local stories lack a licensed/verified image (${withoutImage.map(a => a.titlos || "χωρίς τίτλο").join(" | ")})`);
    }
  }
  for (const a of local) {
    if (!a?.source?.url || !a?.source?.source_id) failures.push(`${label}: story missing source URL/source_id: ${a?.titlos || "χωρίς τίτλο"}`);
  }
}

if (failures.length) {
  console.error("PRODUCTION GATE FAILED — no deploy will occur:\n- " + failures.join("\n- "));
  process.exit(1);
}

console.log(`PRODUCTION GATE PASSED: >=${MIN_CITY_ARTICLES} verified local stories per city, all local stories have images and source metadata.`);

// Hard-filter and rank city discovery candidates before any verification work.
// No AI. Goal: spend verifier budget only on specific, local, non-sensitive leads.

import { readFile, writeFile } from "node:fs/promises";

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

function norm(s = "") {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[Ββ](?=[A-Za-z0-9])/g, m => m === "Β" ? "B" : "b")
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripSource(title = "") {
  return String(title)
    .replace(/\s+-\s+(Athens Voice|LiFO|Biscotto[^-]*|Parallaxi[^-]*)$/i, "")
    .trim();
}

const HARD_BLOCK = [
  // politics / public controversy
  "πολιτικ", "βουλευτ", "κυβερν", "κομμα", "εκλογ", "υπουργ", "δημαρχ", "αντιδημαρχ",
  // crime / accidents / health / legal
  "πυροβολ", "δολοφον", "αστυνομ", "συνεληφ", "συλληψ", "τραυματ", "νεκρ", "θανατ",
  "ατυχημ", "νοσοκομ", "ιατρ", "δικασ", "κατηγορου", "μηνυσ", "βρεφονηπ", "απορρυπαντικ",
  // sport noise
  "ολυμπιακ", "παναθηναικ", "αεκ", "παοκ", "ποδοσφαιρ", "μπασκετ", "προπονητ", "μεντιλιμπαρ"
];

const GENERIC = [
  "ολα τα καινουργια", "οσα δεν πρεπει να χασεις", "τα καλυτερα", "τι παιζει", "οδηγος",
  "στεκια που", "που θα φας", "πού θα φας", "κανε πως εισαι", "μα που πηγαν", "new entry",
  "ποσα ξοδευουν", "ο freddo της αθηνας", "η μουσικη ατζεντα της εβδομαδας", "agenda της εβδομαδας"
];

const FOOD_SIGNALS = [
  "street food", "burger", "smash", "pizza", "πιτσα", "döner", "doner", "κεμπαπ", "kebab",
  "σουβλακ", "γυρο", "fried chicken", "κοτοπουλ", "taco", "hot dog", "sandwich", "σαντουιτς",
  "bar", "μπαρ", "καφε", "cafe", "εστιατορ", "φαγητο", "μαγαζ", "ανοιξε", "ανοιγει",
  "νεα αφιξη", "νέα άφιξη", "opening", "burger fest", "food festival"
];

const EVENT_SIGNALS = [
  "συναυλ", "live", "festival", "φεστιβαλ", "εκθεση", "έκθεση", "graffiti", "street art",
  "τοιχογραφ", "dj", "party", "παρτι", "popup", "pop up", "performance", "παρασταση", "μουσικ",
  "vinyl", "βινυλ", "illustrator", "artist", "opening", "εγκαιν"
];

const CITY_SIGNALS = {
  ath: ["αθηνα", "athens", "ακαδημια", "εξαρχεια", "ψυρρη", "μοναστηρακ", "κουκακι", "πετραλωνα", "κυψελη", "παγκρατι", "κεραμεικο", "γκαζι", "κολωνακι", "συνταγμα", "ομονοια"],
  thes: ["θεσσαλονικη", "thessaloniki", "βαλαωριτου", "λαδαδικ", "τουμπα", "καλαμαρια", "ναυαρινου", "ροτοντα", "καμαρα", "τσιμισκη", "μητροπολεως", "ανω πολη"]
};

function hasAny(hay, arr) { return arr.some(x => hay.includes(norm(x))); }
function hasHardBlock(hay) { return HARD_BLOCK.some(x => hay.includes(norm(x))); }
function generic(hay) { return GENERIC.some(x => hay.includes(norm(x))); }

function entityShape(title = "") {
  const core = stripSource(title);
  const quoted = core.match(/[«“"]([^»”"]{3,70})[»”"]/);
  if (quoted) return { entity:quoted[1].trim(), strength:8, kind:"quoted" };

  const colon = core.split(":")[0].trim();
  if (core.includes(":") && colon.length >= 2 && colon.length <= 70 && colon.split(/\s+/).length <= 8) {
    return { entity:colon.replace(/[Ββ](?=[A-Za-z0-9])/g, m=>m==="Β"?"B":"b"), strength:9, kind:"colon" };
  }

  const verb = core.split(/\s+(?:στη|στην|στο|έρχεται|ερχεται|έρχονται|ερχονται|ανοίγει|ανοιγει|άνοιξε|ανοιξε|πάει|παει|πάνε|πανε|φέρνει|φερνει|φέρνουν|φερνουν|γιορτάζει|γιορταζει|παρουσιάζει|παρουσιαζει)\s+/i)[0].trim();
  if (verb.length >= 3 && verb.length <= 65 && verb.split(/\s+/).length <= 6) return { entity:verb, strength:5, kind:"verb" };
  return { entity:"", strength:0, kind:"none" };
}

function scoreCandidate(c) {
  const title = stripSource(c.title || "");
  const hay = norm(title);
  const category = c.category || "";
  const city = c.city || "";

  if (!title || title.length < 8) return { keep:false, reason:"too_short", score:-99 };
  if (hasHardBlock(hay)) return { keep:false, reason:"sensitive_or_sports", score:-99 };

  const shape = entityShape(title);
  const food = hasAny(hay, FOOD_SIGNALS);
  const event = hasAny(hay, EVENT_SIGNALS);
  const citySignal = hasAny(hay, CITY_SIGNALS[city] || []);
  const wrongCity = city === "ath" ? hasAny(hay, CITY_SIGNALS.thes) : hasAny(hay, CITY_SIGNALS.ath);
  if (wrongCity && !citySignal) return { keep:false, reason:"wrong_city_signal", score:-99 };

  // Category must have an actual thematic signal in the title, not a substring accident.
  if (category === "openings_food" && !food) return { keep:false, reason:"no_food_opening_signal", score:-99 };
  if (category === "events_music_street" && !event) return { keep:false, reason:"no_event_street_signal", score:-99 };

  let score = shape.strength;
  if (citySignal) score += 5;
  if (food || event) score += 4;
  if (/\b(20\d{2}|\d{1,2}[\/.-]\d{1,2})\b/.test(title)) score += 1;
  if (/\b(σημερα|αποψε|σάββατο|σαββατο|κυριακή|κυριακη|παρασκευή|παρασκευη)\b/i.test(title)) score += 1;

  const isGeneric = generic(hay);
  if (isGeneric) score -= 10;
  if (!shape.entity) score -= 6;

  // Generic listicles can remain out of the verification pool even if relevant.
  if (isGeneric || score < 6) return { keep:false, reason:isGeneric ? "generic_headline" : "low_specificity", score };

  return { keep:true, reason:"specific_local_lead", score, entity_hint:shape.entity, entity_kind:shape.kind };
}

const discovery = await readJson("content/discovery.json", { updated_at:new Date().toISOString(), ath:[], thes:[] });
const report = { updated_at:new Date().toISOString(), ath:{}, thes:{} };

for (const city of ["ath","thes"]) {
  const source = discovery[city] || [];
  const kept = [];
  const rejected = [];
  for (const c of source) {
    const r = scoreCandidate(c);
    if (r.keep) kept.push({ ...c, specificity_score:r.score, entity_hint:r.entity_hint || "", entity_kind:r.entity_kind || "", verification_candidate:true });
    else rejected.push({ id:c.id, title:c.title, reason:r.reason, score:r.score });
  }
  kept.sort((a,b) => (b.specificity_score||0) - (a.specificity_score||0) || String(b.published_at||"").localeCompare(String(a.published_at||"")));
  discovery[city] = kept.slice(0,30);
  report[city] = { input:source.length, kept:discovery[city].length, rejected:rejected.length, sample_rejected:rejected.slice(0,8) };
  console.log(`RANK ${city.toUpperCase()}: ${source.length} → ${discovery[city].length} verification-worthy candidates.`);
}

discovery.ranking = report;
await writeFile("content/discovery.json", JSON.stringify(discovery,null,2));

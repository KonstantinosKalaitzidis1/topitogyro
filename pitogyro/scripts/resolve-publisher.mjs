// Deterministically resolves Google-News radar candidates to real publisher URLs
// via the publisher's own public WordPress search API. No AI is used here.

import { readFile, writeFile } from "node:fs/promises";

const HTTP_TIMEOUT_MS = Number(process.env.RESOLVE_HTTP_TIMEOUT_MS || 10000);

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

function clean(s = "") {
  return String(s).replace(/<[^>]*>/g, " ").replace(/&[^;]+;/g, " ").replace(/\s+/g, " ").trim();
}

function norm(s = "") {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .toLowerCase().replace(/[^a-z0-9α-ω]+/gi, " ").replace(/\s+/g, " ").trim();
}

function domainOf(url = "") {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function stripSource(title = "") {
  return String(title).replace(/\s+-\s+(Athens Voice|LiFO|Biscotto[^-]*|Parallaxi[^-]*)$/i, "").trim();
}

function entityHint(title = "") {
  const core = stripSource(title);
  const q = core.match(/[«“"]([^»”"]{3,70})[»”"]/);
  if (q) return q[1].trim();
  const colon = core.split(":")[0].trim();
  if (colon.length >= 3 && colon.length <= 70 && colon.split(/\s+/).length <= 8) return colon;
  const verb = core.split(/\s+(?:στη|στην|στο|έρχεται|ερχεται|έρχονται|ερχονται|ανοίγει|ανοιγει|άνοιξε|ανοιξε|πάει|παει|πάνε|πανε|φέρνει|φερνει|φέρνουν|φερνουν|γιορτάζει|γιορταζει)\s+/i)[0].trim();
  return verb.length >= 3 && verb.length <= 70 && verb.split(/\s+/).length <= 8 ? verb : "";
}

const STOP = new Set("το η οι τα ο του της των και με για σε στη στην στο στον απο από που ενα ένα μια νέο νεο νέα νεα αθηνα θεσσαλονικη αξιζει feed".split(/\s+/));
function tokens(s = "") { return norm(s).split(" ").filter(x => x.length >= 3 && !STOP.has(x)); }

async function fetchJson(url) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), HTTP_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      signal:c.signal,
      headers:{"user-agent":"Mozilla/5.0 (compatible; PitogyroBot/1.0; +https://github.com/KonstantinosKalaitzidis1/topitogyro)","accept":"application/json"}
    });
    if (!r.ok) return null;
    const type = r.headers.get("content-type") || "";
    if (!type.includes("json")) return null;
    return await r.json();
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function wpEndpoint(domain, q) {
  if (domain === "biscotto.gr") return `https://biscotto.gr/wp-json/wp/v2/search?search=${encodeURIComponent(q)}&per_page=10`;
  if (domain === "parallaximag.gr") return `https://parallaximag.gr/wp-json/wp/v2/search?search=${encodeURIComponent(q)}&per_page=10`;
  return "";
}

function score(result, candidate, entity) {
  const title = clean(result.title || result?.title?.rendered || "");
  const url = result.url || result.link || "";
  const hay = norm(`${title} ${url}`);
  let s = 0;
  for (const t of tokens(stripSource(candidate.title)).slice(0,12)) if (hay.includes(t)) s += 2;
  for (const t of tokens(entity).slice(0,6)) if (hay.includes(t)) s += 5;
  if (entity && norm(title).includes(norm(entity))) s += 8;
  return s;
}

async function resolveOne(candidate) {
  if (!candidate?.source_home || !candidate?.title) return null;
  const domain = domainOf(candidate.source_home);
  const entity = entityHint(candidate.title);
  if (!entity) return null;
  const endpoint = wpEndpoint(domain, entity);
  if (!endpoint) return null;

  const results = await fetchJson(endpoint);
  if (!Array.isArray(results) || !results.length) return null;
  const ranked = results
    .map(r => ({ r, score:score(r,candidate,entity) }))
    .filter(x => x.score >= 8)
    .sort((a,b) => b.score - a.score);
  const best = ranked[0]?.r;
  if (!best) return null;
  const url = best.url || best.link || "";
  if (!url || domainOf(url) !== domain) return null;
  return { url, entity, score:ranked[0].score };
}

const discovery = await readJson("content/discovery.json", {ath:[],thes:[]});
let resolved = 0;
let attempted = 0;

for (const city of ["ath","thes"]) {
  for (const c of discovery[city] || []) {
    const d = domainOf(c.source_home);
    if (!new Set(["biscotto.gr","parallaximag.gr"]).has(d)) continue;
    if (c.publisher_url && domainOf(c.publisher_url) === d) continue;
    attempted++;
    const hit = await resolveOne(c);
    if (!hit) continue;
    c.discovery_url ||= c.url;
    c.publisher_url = hit.url;
    c.url = hit.url;
    c.publisher_resolution = { method:"wordpress_search_api", entity:hit.entity, score:hit.score, resolved_at:new Date().toISOString() };
    resolved++;
    console.log(`RESOLVE ${city.toUpperCase()}: ${hit.entity} → ${hit.url}`);
  }
}

discovery.publisher_resolution = { attempted, resolved, updated_at:new Date().toISOString() };
await writeFile("content/discovery.json", JSON.stringify(discovery,null,2));
console.log(`PUBLISHER RESOLVE DONE: ${resolved}/${attempted} WordPress candidates resolved.`);

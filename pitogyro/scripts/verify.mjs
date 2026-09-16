// Conservative first-party verification for city radar candidates.
// Discovery media = lead only. Publishable facts come ONLY from first-party pages.

import { readFile, writeFile } from "node:fs/promises";

const KLEIDI = process.env.ANTHROPIC_API_KEY || "";
const MONTELO = process.env.AI_MODEL || "claude-haiku-4-5-20251001";
const LIMIT_TOTAL = Number(process.env.VERIFY_LIMIT_TOTAL || 2);
const RETRY_DAYS = Number(process.env.VERIFY_RETRY_DAYS || 7);
const HTTP_TIMEOUT_MS = Number(process.env.VERIFY_HTTP_TIMEOUT_MS || 12000);
const RESOLVER_VERSION = 2;

if (!KLEIDI) {
  console.log("VERIFY: λείπει ANTHROPIC_API_KEY — παραλείπεται η αυτόματη επαλήθευση.");
  process.exit(0);
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

function cleanText(s = "") {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function norm(s = "") {
  return String(s)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9α-ω]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function domainOf(url = "") {
  try { return new URL(url).hostname.toLowerCase().replace(/^www\./, ""); }
  catch { return ""; }
}

function sameDomain(url, domain) {
  const h = domainOf(url);
  return Boolean(h && domain && (h === domain || h.endsWith(`.${domain}`)));
}

function decodeUrl(s = "") {
  return String(s)
    .replace(/&amp;/gi, "&")
    .replace(/\\u0026/gi, "&")
    .replace(/\\\//g, "/")
    .trim();
}

function linksFromHtml(html = "", baseUrl = "") {
  const out = [];
  const re = /<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    let href = decodeUrl(m[1]);
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    try { href = new URL(href, baseUrl).href; } catch { continue; }
    if (/^https?:\/\//i.test(href)) out.push({ url: href, text: cleanText(m[2]).slice(0, 220) });
  }
  return out;
}

function rawUrlsFromHtml(html = "") {
  const decoded = decodeUrl(html).replace(/&quot;/gi, '"');
  const raw = decoded.match(/https?:\/\/[^\s"'<>\\]+/gi) || [];
  return raw.map(u => u.replace(/[),.;]+$/, ""));
}

function canonicalFromHtml(html = "", baseUrl = "") {
  const m = html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*canonical[^"']*["']/i);
  if (!m) return "";
  try { return new URL(decodeUrl(m[1]), baseUrl).href; } catch { return ""; }
}

function firstPartyText(html = "") {
  const title = cleanText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || "");
  const metas = [...html.matchAll(/<meta\b[^>]*(?:name|property)=["'](?:description|og:title|og:description)["'][^>]*content=["']([^"']+)["'][^>]*>/gi)]
    .map(m => cleanText(m[1]));
  const jsonLd = [...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)]
    .map(m => cleanText(m[1]).slice(0, 3500));
  const visible = cleanText(html).slice(0, 10000);
  return [title, ...metas, visible, ...jsonLd].filter(Boolean).join("\n").slice(0, 15000);
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent": "Mozilla/5.0 (compatible; PitogyroBot/1.0; +https://github.com/KonstantinosKalaitzidis1/topitogyro)",
        "accept": "text/html,application/xhtml+xml"
      }
    });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.includes("text/html")) return null;
    const html = await r.text();
    return { url: r.url, html: html.slice(0, 750000) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function stripSource(title = "") {
  return String(title)
    .replace(/\s+-\s+(Athens Voice|LiFO|Biscotto[^-]*|Parallaxi[^-]*)$/i, "")
    .trim();
}

function genericCandidate(title = "") {
  const t = norm(title);
  return [
    "ολα τα καινουργια", "οσα δεν πρεπει να χασεις", "τι παιζει", "οδηγος", "guide",
    "τα καλυτερα", "προτασεις για", "weekend", "σαββατοκυριακο", "στεκια που"
  ].some(x => t.includes(norm(x)));
}

function entityHint(title = "") {
  const core = stripSource(title);
  if (genericCandidate(core)) return "";

  const quoted = core.match(/[«“"]([^»”"]{3,70})[»”"]/);
  if (quoted) return quoted[1].trim();

  const beforeColon = core.split(":")[0].trim();
  if (beforeColon.length >= 3 && beforeColon.length <= 70 && beforeColon.split(/\s+/).length <= 8) return beforeColon;

  const beforeVerb = core.split(/\s+(?:στη|στην|στο|στης|έρχεται|ερχεται|έρχονται|ερχονται|ανοίγει|ανοιγει|άνοιξε|ανοιξε|πάει|παει|πάνε|πανε|πηγαίνει|πηγαινει|φέρνει|φερνει|φέρνουν|φερνουν|γιορτάζει|γιορταζει)\s+/i)[0].trim();
  if (beforeVerb.length >= 3 && beforeVerb.length <= 70 && beforeVerb.split(/\s+/).length <= 8) return beforeVerb;
  return "";
}

const STOP = new Set("το η οι τα ο του της των και με για σε στη στην στο στον από απο που ένα ενα μια νέο νεο νέα νεα στην αθήνα αθηνα θεσσαλονίκη θεσσαλονικη athens voice lifo biscotto parallaxi".split(/\s+/));
function tokens(s = "") {
  return norm(s).split(" ").filter(x => x.length >= 3 && !STOP.has(x));
}

function sourceArticleScore(link, candidate, sourceDomain) {
  if (!sameDomain(link.url, sourceDomain)) return -999;
  const hay = norm(`${link.text} ${link.url}`);
  if (/\/tag\/|\/category\/|\/author\/|\/search|newsletter|privacy|terms/i.test(link.url)) return -10;
  const tks = [...new Set(tokens(stripSource(candidate.title)))].slice(0, 10);
  const entity = tokens(entityHint(candidate.title));
  let score = 0;
  for (const t of tks) if (hay.includes(t)) score += 2;
  for (const t of entity) if (hay.includes(t)) score += 3;
  if (link.text && norm(link.text).includes(norm(entityHint(candidate.title)))) score += 5;
  return score;
}

function bestPublisherLink(html, baseUrl, candidate, sourceDomain) {
  const ranked = linksFromHtml(html, baseUrl)
    .map(l => ({ ...l, score: sourceArticleScore(l, candidate, sourceDomain) }))
    .filter(l => l.score >= 6)
    .sort((a,b) => b.score - a.score);
  return ranked[0]?.url || "";
}

function sourceArticleUrlFromGoogleHtml(html, sourceDomain, baseUrl) {
  const links = linksFromHtml(html, baseUrl).map(x => x.url).filter(u => sameDomain(u, sourceDomain));
  if (links.length) return links[0];
  for (const u of rawUrlsFromHtml(html)) if (sameDomain(u, sourceDomain)) return u;
  return "";
}

function sourceSearchUrl(sourceDomain, sourceHome, query) {
  const q = encodeURIComponent(query);
  if (sourceDomain === "lifo.gr") return `https://www.lifo.gr/search?keyword=${q}`;
  if (sourceDomain === "biscotto.gr") return `https://biscotto.gr/?s=${q}`;
  if (sourceDomain === "parallaximag.gr") return `https://parallaximag.gr/?s=${q}`;
  if (sourceDomain === "athensvoice.gr") return `https://www.athensvoice.gr/search/?q=${q}`;
  try { return `${new URL(sourceHome).origin}/?s=${q}`; } catch { return ""; }
}

async function resolveDiscoveryArticle(candidate) {
  const sourceDomain = domainOf(candidate.source_home);
  if (!sourceDomain) return { ok:false, reason:"missing_source_domain" };
  if (sameDomain(candidate.url, sourceDomain)) return { ok:true, url:candidate.url, via:"direct" };

  const google = await fetchHtml(candidate.url);
  if (google) {
    if (sameDomain(google.url, sourceDomain)) return { ok:true, url:google.url, via:"redirect" };
    const canonical = canonicalFromHtml(google.html, google.url);
    if (canonical && sameDomain(canonical, sourceDomain)) return { ok:true, url:canonical, via:"google_canonical" };
    const extracted = sourceArticleUrlFromGoogleHtml(google.html, sourceDomain, google.url);
    if (extracted) return { ok:true, url:extracted, via:"google_markup" };
  }

  // Fallback 1: source category/home page. Recent radar items are often linked there.
  const home = await fetchHtml(candidate.source_home);
  if (home) {
    const hit = bestPublisherLink(home.html, home.url, candidate, sourceDomain);
    if (hit) return { ok:true, url:hit, via:"source_home" };
  }

  // Fallback 2: publisher's own search page. No external search-engine scraping.
  const entity = entityHint(candidate.title);
  if (entity) {
    const searchUrl = sourceSearchUrl(sourceDomain, candidate.source_home, entity);
    const search = searchUrl ? await fetchHtml(searchUrl) : null;
    if (search) {
      const hit = bestPublisherLink(search.html, search.url, candidate, sourceDomain);
      if (hit) return { ok:true, url:hit, via:"source_search" };
    }
  }

  return { ok:false, reason:"publisher_article_unresolved" };
}

const EXCLUDED_DOMAINS = [
  "google.com", "googleusercontent.com", "googlesyndication.com", "doubleclick.net",
  "youtube.com", "youtu.be", "x.com", "twitter.com", "linkedin.com", "pinterest.com",
  "t.co", "sharethis.com", "addthis.com", "apple.com", "play.google.com"
];
const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "tiktok.com"];
function excludedHost(host) { return EXCLUDED_DOMAINS.some(d => host === d || host.endsWith(`.${d}`)); }

function officialLinkScore(link, entity, sourceDomain) {
  const host = domainOf(link.url);
  if (!host || sameDomain(link.url, sourceDomain) || excludedHost(host)) return -999;
  const hay = norm(`${host} ${link.url} ${link.text}`);
  let score = 0;
  for (const t of tokens(entity).slice(0,5)) if (hay.includes(t)) score += 4;
  if (SOCIAL_DOMAINS.some(d => host === d || host.endsWith(`.${d}`))) score += 1;
  else score += 3;
  if (/official|site|website|instagram|facebook|menu|κρατησ|reservation/i.test(link.text)) score += 2;
  if (/privacy|terms|cookie|author|tag|category|newsletter|mailto|share/i.test(link.url)) score -= 5;
  return score;
}

function plausibleOfficialLinks(articleHtml, articleUrl, entity, sourceDomain) {
  const anchors = linksFromHtml(articleHtml, articleUrl);
  const raw = rawUrlsFromHtml(articleHtml).map(url => ({ url, text:"" }));
  const all = [...anchors, ...raw]
    .map(l => ({ ...l, score: officialLinkScore(l, entity, sourceDomain) }))
    .filter(l => l.score >= 4)
    .sort((a,b) => b.score - a.score);
  const seen = new Set();
  return all.filter(l => {
    let key;
    try { key = `${domainOf(l.url)}|${new URL(l.url).pathname.split("/").slice(0,3).join("/")}`; }
    catch { return false; }
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 5);
}

function internalUsefulLinks(html, pageUrl) {
  const host = domainOf(pageUrl);
  const wanted = ["contact", "contacts", "menu", "about", "location", "locations", "hours", "event", "events", "program", "programme", "επικοινων", "μενου", "ωραριο", "προγραμμα", "τοποθεσ"];
  const seen = new Set();
  return linksFromHtml(html, pageUrl)
    .filter(l => sameDomain(l.url, host))
    .filter(l => wanted.some(w => norm(`${l.text} ${l.url}`).includes(norm(w))))
    .filter(l => { const u=l.url.split("#")[0]; if(seen.has(u)) return false; seen.add(u); return true; })
    .slice(0, 2);
}

async function officialBundle(link) {
  const first = await fetchHtml(link.url);
  if (!first) return null;
  const finalUrl = canonicalFromHtml(first.html, first.url) || first.url;
  const host = domainOf(finalUrl);
  if (!host) return null;
  const social = SOCIAL_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
  const pages = [{ url:finalUrl, text:firstPartyText(first.html) }];
  if (!social) {
    for (const extra of internalUsefulLinks(first.html, finalUrl)) {
      const p = await fetchHtml(extra.url);
      if (p) pages.push({ url:p.url, text:firstPartyText(p.html) });
    }
  }
  return { official_url:finalUrl, social, pages };
}

async function anthropicJson(system, user) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method:"POST",
    headers:{ "content-type":"application/json", "x-api-key":KLEIDI, "anthropic-version":"2023-06-01" },
    body:JSON.stringify({ model:MONTELO, max_tokens:800, temperature:0, system, messages:[{role:"user",content:user}] })
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const d = await r.json();
  const text = (d.content || []).filter(x => x.type === "text").map(x => x.text).join("").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Verifier returned non-JSON");
  return JSON.parse(text.slice(first,last+1));
}

const VERIFIER = `Είσαι αυστηρός verifier για το ΠΙΤΟΓΥΡΟ.\n- Το DISCOVERY TITLE είναι μόνο lead, ΟΧΙ πηγή facts.\n- Χρησιμοποίησε facts ΜΟΝΟ από το FIRST-PARTY PAGE TEXT.\n- Επιβεβαίωσε ότι η επίσημη σελίδα ανήκει στο ίδιο μαγαζί/event/venue και αφορά τη ζητούμενη πόλη.\n- Food/opening: χρειάζεται ταυτότητα + πόλη/διεύθυνση ή σαφής τοποθεσία + τουλάχιστον ένα πρακτικό fact (menu/concept/ωράριο/event).\n- Event/music/street: χρειάζεται ταυτότητα + πόλη/venue + συγκεκριμένη ημερομηνία ή πρόγραμμα.\n- Αν λείπει πόλη, η σελίδα είναι ασαφής/social login shell ή τα facts δεν αρκούν: verified=false.\n- Μην συμπεραίνεις opening date, ποιότητα, αυθεντικότητα ή γεύση.\n- facts = σύντομες αυτοτελείς παραφράσεις του first-party meaning.\nΑπάντησε ΜΟΝΟ JSON: {"verified":true|false,"reason":"...","title":"ουδέτερος ελληνικός τίτλος","facts":["..."],"entity":"..."}`;

function cityName(code) { return code === "ath" ? "Αθήνα" : "Θεσσαλονίκη"; }

async function verifyCandidate(candidate) {
  const entity = entityHint(candidate.title);
  if (!entity) return { verified:false, reason:"generic_or_no_entity" };

  const resolved = await resolveDiscoveryArticle(candidate);
  if (!resolved.ok) return { verified:false, reason:resolved.reason };
  console.log(`  publisher resolved via ${resolved.via}: ${resolved.url}`);

  const article = await fetchHtml(resolved.url);
  if (!article) return { verified:false, reason:"publisher_article_unreachable" };
  const sourceDomain = domainOf(candidate.source_home);
  const links = plausibleOfficialLinks(article.html, article.url, entity, sourceDomain);
  if (!links.length) return { verified:false, reason:"no_plausible_first_party_link" };

  for (const link of links) {
    const bundle = await officialBundle(link);
    if (!bundle) continue;
    const text = bundle.pages.map((p,i) => `PAGE ${i+1}: ${p.url}\n${p.text}`).join("\n\n").slice(0,24000);
    if (text.length < 180) continue;
    const result = await anthropicJson(VERIFIER,
      `CITY: ${cityName(candidate.city)}\nCATEGORY: ${candidate.category}\nENTITY HINT: ${entity}\nDISCOVERY TITLE (lead only, NOT facts): ${candidate.title}\nFIRST-PARTY URL: ${bundle.official_url}\n\nFIRST-PARTY PAGE TEXT:\n${text}`
    );
    if (result?.verified === true && Array.isArray(result.facts) && result.facts.length >= 2) {
      return { ...result, official_url:bundle.official_url, discovery_article_url:article.url, resolver_via:resolved.via };
    }
  }
  return { verified:false, reason:"first_party_not_sufficient" };
}

function recentlyChecked(entry) {
  if (!entry?.checked_at || entry.resolver_version !== RESOLVER_VERSION) return false;
  const t = new Date(entry.checked_at).getTime();
  return Number.isFinite(t) && Date.now() - t < RETRY_DAYS * 86400000;
}

const discovery = await readJson("content/discovery.json", {ath:[],thes:[]});
const autoVerified = await readJson("content/auto-verified.json", {ath:[],thes:[]});
const verificationHistory = await readJson("content/verification-history.json", {checks:{}});
verificationHistory.checks ||= {};
autoVerified.ath ||= [];
autoVerified.thes ||= [];

const done = new Set([...autoVerified.ath,...autoVerified.thes].map(x => x.original_candidate_id).filter(Boolean));
const pool = [];
for (const city of ["ath","thes"]) {
  for (const c of discovery[city] || []) {
    if (!c?.id || done.has(c.id)) continue;
    const prev = verificationHistory.checks[c.id];
    if (prev?.status === "verified" || recentlyChecked(prev)) continue;
    if (genericCandidate(c.title)) continue;
    pool.push(c);
  }
}

const ordered = [];
for (let i=0; ordered.length<LIMIT_TOTAL; i++) {
  let added=false;
  for (const city of ["ath","thes"]) {
    const next = pool.filter(x => x.city === city)[i];
    if (next && ordered.length<LIMIT_TOTAL) { ordered.push(next); added=true; }
  }
  if (!added) break;
}

console.log(`VERIFY v${RESOLVER_VERSION}: ${ordered.length} candidate(s) προς first-party verification.`);
let newVerified=0;
for (const candidate of ordered) {
  console.log(`\nVERIFY ${candidate.city.toUpperCase()}: ${candidate.title}`);
  let result;
  try { result = await verifyCandidate(candidate); }
  catch(e) { result = {verified:false,reason:`error:${e.message}`}; }

  const now = new Date().toISOString();
  verificationHistory.checks[candidate.id] = {
    status:result.verified ? "verified" : "not_verified",
    reason:result.reason || "",
    checked_at:now,
    official_url:result.official_url || "",
    resolver_version:RESOLVER_VERSION
  };

  if (!result.verified) {
    console.log(`  NOT VERIFIED: ${result.reason || "insufficient"}`);
    continue;
  }

  const facts = result.facts.map(cleanText).filter(Boolean).slice(0,8);
  const record = {
    id:`auto-${candidate.id}`,
    original_candidate_id:candidate.id,
    verified:true,
    pigi:`Επίσημη πηγή — ${result.entity || entityHint(candidate.title)}`,
    pigi_url:result.official_url,
    source_item_url:result.official_url,
    titlos:cleanText(result.title || candidate.title),
    imerominia:now,
    proti_yli:`Επιβεβαιωμένα facts από first-party πηγή: ${facts.join(" ")} Μην προσθέσεις μη επιβεβαιωμένες λεπτομέρειες, αξιολογικές κρίσεις ή πληροφορίες από το discovery article.`,
    verification:{ method:"first_party_page", official_url:result.official_url, discovery_article_url:result.discovery_article_url || "", resolver_via:result.resolver_via || "", verified_at:now }
  };
  const list=autoVerified[candidate.city];
  if (!list.some(x => x.id===record.id)) list.unshift(record);
  autoVerified[candidate.city]=list.slice(0,60);
  newVerified++;
  console.log(`  ✓ VERIFIED: ${record.titlos} → ${record.pigi_url}`);
}

verificationHistory.updated_at=new Date().toISOString();
verificationHistory.resolver_version=RESOLVER_VERSION;
await writeFile("content/auto-verified.json",JSON.stringify(autoVerified,null,2));
await writeFile("content/verification-history.json",JSON.stringify(verificationHistory,null,2));
console.log(`\nVERIFY DONE: ${newVerified} νέο/α first-party verified candidate(s).`);

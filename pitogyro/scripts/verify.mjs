// Conservative first-party verification for city radar candidates.
// Discovery media are used ONLY to find a possible official source.
// Facts passed to the writer come ONLY from the official/first-party pages fetched here.

import { readFile, writeFile } from "node:fs/promises";

const KLEIDI = process.env.ANTHROPIC_API_KEY || "";
const MONTELO = process.env.AI_MODEL || "claude-haiku-4-5-20251001";
const LIMIT_TOTAL = Number(process.env.VERIFY_LIMIT_TOTAL || 2);
const RETRY_DAYS = Number(process.env.VERIFY_RETRY_DAYS || 7);
const HTTP_TIMEOUT_MS = Number(process.env.VERIFY_HTTP_TIMEOUT_MS || 12000);

if (!KLEIDI) {
  console.log("VERIFY: λείπει ANTHROPIC_API_KEY — παραλείπεται η αυτόματη επαλήθευση.");
  process.exit(0);
}

async function diavaseJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

function katharise(s = "") {
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
    .replace(/[^a-z0-9α-ωάέήίόύώϊϋΐΰ]+/gi, " ")
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

function htmlDecodeUrl(s = "") {
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
    let href = htmlDecodeUrl(m[1]);
    if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) continue;
    try { href = new URL(href, baseUrl).href; } catch { continue; }
    if (!/^https?:\/\//i.test(href)) continue;
    out.push({ url: href, text: katharise(m[2]).slice(0, 180) });
  }
  return out;
}

function canonicalFromHtml(html = "", baseUrl = "") {
  const m = html.match(/<link\b[^>]*rel=["'][^"']*canonical[^"']*["'][^>]*href=["']([^"']+)["']/i)
    || html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["'][^"']*canonical[^"']*["']/i);
  if (!m) return "";
  try { return new URL(htmlDecodeUrl(m[1]), baseUrl).href; } catch { return ""; }
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
    return { url: r.url, html: html.slice(0, 700000) };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function genericCandidate(title = "") {
  const t = norm(title);
  return [
    "ολα τα καινουργια", "οσα δεν πρεπει να χασεις", "τι παιζει", "οδηγος", "guide",
    "τα καλυτερα", "προτασεις για", "πού θα", "που θα", "weekend", "σαββατοκυριακο"
  ].some(x => t.includes(norm(x)));
}

function entityHint(title = "") {
  const core = String(title)
    .replace(/\s+-\s+(Athens Voice|LiFO|Biscotto[^-]*|Parallaxi[^-]*)$/i, "")
    .trim();
  if (genericCandidate(core)) return "";

  const quoted = core.match(/[«“"]([^»”"]{3,70})[»”"]/);
  if (quoted) return quoted[1].trim();

  const beforeColon = core.split(":")[0].trim();
  if (beforeColon.length >= 3 && beforeColon.length <= 70 && beforeColon.split(/\s+/).length <= 8) return beforeColon;

  const beforeVerb = core.split(/\s+(?:στη|στην|στο|στης|έρχεται|ερχεται|ανοίγει|ανοιγει|πάει|παει|φέρνει|φερνει)\s+/i)[0].trim();
  if (beforeVerb.length >= 3 && beforeVerb.length <= 70 && beforeVerb.split(/\s+/).length <= 7) return beforeVerb;
  return "";
}

function sourceArticleUrlFromGoogleHtml(html, sourceDomain, baseUrl) {
  const links = linksFromHtml(html, baseUrl)
    .map(x => x.url)
    .filter(u => sameDomain(u, sourceDomain));
  if (links.length) return links[0];

  // Fallback: Google News markup occasionally contains escaped publisher URLs.
  const decoded = htmlDecodeUrl(html).replace(/&quot;/gi, '"');
  const raw = decoded.match(/https?:\/\/[^\s"'<>]+/gi) || [];
  for (const u0 of raw) {
    const u = u0.replace(/[),.;]+$/, "");
    if (sameDomain(u, sourceDomain)) return u;
  }
  return "";
}

async function resolveDiscoveryArticle(candidate) {
  const sourceDomain = domainOf(candidate.source_home);
  if (!sourceDomain) return { ok:false, reason:"missing_source_domain" };

  if (sameDomain(candidate.url, sourceDomain)) return { ok:true, url:candidate.url };

  const page = await fetchHtml(candidate.url);
  if (!page) return { ok:false, reason:"discovery_page_unreachable" };
  if (sameDomain(page.url, sourceDomain)) return { ok:true, url:page.url };

  const canonical = canonicalFromHtml(page.html, page.url);
  if (canonical && sameDomain(canonical, sourceDomain)) return { ok:true, url:canonical };

  const extracted = sourceArticleUrlFromGoogleHtml(page.html, sourceDomain, page.url);
  if (extracted) return { ok:true, url:extracted };
  return { ok:false, reason:"publisher_article_unresolved" };
}

const EXCLUDED_DOMAINS = [
  "google.com", "googleusercontent.com", "googlesyndication.com", "doubleclick.net",
  "youtube.com", "youtu.be", "x.com", "twitter.com", "linkedin.com", "pinterest.com",
  "t.co", "sharethis.com", "addthis.com", "apple.com", "play.google.com"
];
const SOCIAL_DOMAINS = ["instagram.com", "facebook.com", "tiktok.com"];

function excludedHost(host) {
  return EXCLUDED_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
}

function officialLinkScore(link, entity, sourceDomain) {
  const host = domainOf(link.url);
  if (!host || sameDomain(link.url, sourceDomain) || excludedHost(host)) return -999;
  const e = norm(entity);
  const tokens = e.split(" ").filter(x => x.length >= 3).slice(0, 5);
  const hay = norm(`${host} ${link.url} ${link.text}`);
  let score = 0;
  for (const t of tokens) if (hay.includes(t)) score += 4;
  if (SOCIAL_DOMAINS.some(d => host === d || host.endsWith(`.${d}`))) score += 1;
  else score += 3; // first-party website preferred over social.
  if (/official|site|website|instagram|facebook|menu|κρατησ|reservation/i.test(link.text)) score += 2;
  if (/privacy|terms|cookie|author|tag|category|newsletter|mailto|share/i.test(link.url)) score -= 5;
  return score;
}

function plausibleOfficialLinks(articleHtml, articleUrl, entity, sourceDomain) {
  const all = linksFromHtml(articleHtml, articleUrl)
    .map(l => ({ ...l, score: officialLinkScore(l, entity, sourceDomain) }))
    .filter(l => l.score >= 4)
    .sort((a,b) => b.score - a.score);
  const seen = new Set();
  return all.filter(l => {
    const d = `${domainOf(l.url)}|${new URL(l.url).pathname.split("/").slice(0,3).join("/")}`;
    if (seen.has(d)) return false;
    seen.add(d);
    return true;
  }).slice(0, 4);
}

function internalUsefulLinks(html, pageUrl) {
  const host = domainOf(pageUrl);
  const wanted = ["contact", "contacts", "menu", "about", "location", "locations", "hours", "event", "events", "program", "programme", "επικοινων", "μενου", "ωραριο", "προγραμμα", "τοποθεσ"];
  const links = linksFromHtml(html, pageUrl)
    .filter(l => sameDomain(l.url, host))
    .filter(l => wanted.some(w => norm(`${l.text} ${l.url}`).includes(norm(w))));
  const seen = new Set();
  return links.filter(l => {
    const u = l.url.split("#")[0];
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  }).slice(0, 2);
}

async function officialBundle(link) {
  const first = await fetchHtml(link.url);
  if (!first) return null;
  const finalUrl = canonicalFromHtml(first.html, first.url) || first.url;
  const host = domainOf(finalUrl);
  if (!host) return null;

  // Social pages are useful as an identity signal, but often block server-side page text.
  const social = SOCIAL_DOMAINS.some(d => host === d || host.endsWith(`.${d}`));
  let pages = [{ url: finalUrl, text: katharise(first.html).slice(0, 9000) }];
  if (!social) {
    for (const extra of internalUsefulLinks(first.html, finalUrl)) {
      const p = await fetchHtml(extra.url);
      if (p) pages.push({ url: p.url, text: katharise(p.html).slice(0, 7000) });
    }
  }
  return { official_url: finalUrl, social, pages };
}

async function anthropicJson(system, user) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KLEIDI,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MONTELO,
      max_tokens: 800,
      temperature: 0,
      system,
      messages: [{ role:"user", content:user }]
    })
  });
  if (!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const d = await r.json();
  const text = (d.content || []).filter(x => x.type === "text").map(x => x.text).join("").trim();
  const first = text.indexOf("{");
  const last = text.lastIndexOf("}");
  if (first < 0 || last <= first) throw new Error("Verifier returned non-JSON");
  return JSON.parse(text.slice(first, last + 1));
}

const VERIFIER = `Είσαι αυστηρός verifier για το ΠΙΤΟΓΥΡΟ.\n\nΚΡΙΣΙΜΟ:\n- Το DISCOVERY TITLE είναι μόνο υπόθεση/lead. ΔΕΝ είναι πηγή facts.\n- Επιτρέπεται να χρησιμοποιήσεις facts ΜΟΝΟ από το FIRST-PARTY PAGE TEXT που δίνεται.\n- Επαλήθευσε ότι η σελίδα ανήκει πράγματι στο ίδιο μαγαζί/event/venue και ότι αφορά τη ζητούμενη πόλη.\n- Για food/opening χρειάζονται τουλάχιστον: σαφής ταυτότητα + πόλη/διεύθυνση ή ξεκάθαρη τοποθεσία + τουλάχιστον ένα ακόμη πρακτικό fact (menu/concept/ωράριο/event).\n- Για event/music/street χρειάζονται: σαφής ταυτότητα + πόλη/venue + συγκεκριμένη ημερομηνία ή πρόγραμμα.\n- Αν λείπει η πόλη, αν η σελίδα είναι ασαφής, αν είναι μόνο social login shell, ή αν τα facts δεν αρκούν, verified=false.\n- Μην συμπεραίνεις opening date, ποιότητα, αυθεντικότητα ή γεύση.\n- Facts: σύντομες αυτοτελείς προτάσεις, καθεμία να αντιγράφει το ΝΟΗΜΑ αλλά όχι το wording της σελίδας.\n\nΑπάντησε ΜΟΝΟ JSON:\n{"verified":true|false,"reason":"...","title":"ουδέτερος ελληνικός τίτλος","facts":["..."],"entity":"..."}`;

function cityName(code) { return code === "ath" ? "Αθήνα" : "Θεσσαλονίκη"; }

async function verifyCandidate(candidate) {
  const entity = entityHint(candidate.title);
  if (!entity) return { verified:false, reason:"generic_or_no_entity" };

  const resolved = await resolveDiscoveryArticle(candidate);
  if (!resolved.ok) return { verified:false, reason:resolved.reason };

  const article = await fetchHtml(resolved.url);
  if (!article) return { verified:false, reason:"publisher_article_unreachable" };
  const sourceDomain = domainOf(candidate.source_home);
  const links = plausibleOfficialLinks(article.html, article.url, entity, sourceDomain);
  if (!links.length) return { verified:false, reason:"no_plausible_first_party_link" };

  for (const link of links) {
    const bundle = await officialBundle(link);
    if (!bundle) continue;
    const text = bundle.pages
      .map((p,i) => `PAGE ${i+1}: ${p.url}\n${p.text}`)
      .join("\n\n")
      .slice(0, 22000);
    if (text.length < 180) continue;

    const result = await anthropicJson(VERIFIER,
      `CITY: ${cityName(candidate.city)}\nCATEGORY: ${candidate.category}\nENTITY HINT: ${entity}\nDISCOVERY TITLE (lead only, NOT facts): ${candidate.title}\nFIRST-PARTY URL: ${bundle.official_url}\n\nFIRST-PARTY PAGE TEXT:\n${text}`
    );
    if (result?.verified === true && Array.isArray(result.facts) && result.facts.length >= 2) {
      return { ...result, official_url:bundle.official_url, discovery_article_url:article.url };
    }
  }
  return { verified:false, reason:"first_party_not_sufficient" };
}

function recentlyChecked(entry) {
  if (!entry?.checked_at) return false;
  const t = new Date(entry.checked_at).getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < RETRY_DAYS * 86400000;
}

const discovery = await diavaseJson("content/discovery.json", { ath:[], thes:[] });
const autoVerified = await diavaseJson("content/auto-verified.json", { ath:[], thes:[] });
const verificationHistory = await diavaseJson("content/verification-history.json", { checks:{} });
verificationHistory.checks ||= {};
autoVerified.ath ||= [];
autoVerified.thes ||= [];

const alreadyVerifiedCandidates = new Set([
  ...autoVerified.ath,
  ...autoVerified.thes
].map(x => x.original_candidate_id).filter(Boolean));

const pool = [];
for (const city of ["ath", "thes"]) {
  for (const c of discovery[city] || []) {
    if (!c?.id || alreadyVerifiedCandidates.has(c.id)) continue;
    const prev = verificationHistory.checks[c.id];
    if (prev?.status === "verified" || recentlyChecked(prev)) continue;
    if (genericCandidate(c.title)) continue;
    pool.push(c);
  }
}

// Fairness: alternate cities before filling the small daily budget.
const ordered = [];
for (let i = 0; ordered.length < LIMIT_TOTAL; i++) {
  let added = false;
  for (const city of ["ath", "thes"]) {
    const next = pool.filter(x => x.city === city)[i];
    if (next && ordered.length < LIMIT_TOTAL) { ordered.push(next); added = true; }
  }
  if (!added) break;
}

console.log(`VERIFY: ${ordered.length} candidate(s) προς first-party verification.`);
let newVerified = 0;
for (const candidate of ordered) {
  console.log(`\nVERIFY ${candidate.city.toUpperCase()}: ${candidate.title}`);
  let result;
  try { result = await verifyCandidate(candidate); }
  catch (e) { result = { verified:false, reason:`error:${e.message}` }; }

  const now = new Date().toISOString();
  verificationHistory.checks[candidate.id] = {
    status: result.verified ? "verified" : "not_verified",
    reason: result.reason || "",
    checked_at: now,
    official_url: result.official_url || ""
  };

  if (!result.verified) {
    console.log(`  NOT VERIFIED: ${result.reason || "insufficient"}`);
    continue;
  }

  const facts = result.facts.map(katharise).filter(Boolean).slice(0, 8);
  const record = {
    id: `auto-${candidate.id}`,
    original_candidate_id: candidate.id,
    verified: true,
    pigi: `Επίσημη πηγή — ${result.entity || entityHint(candidate.title)}`,
    pigi_url: result.official_url,
    source_item_url: result.official_url,
    titlos: katharise(result.title || candidate.title),
    imerominia: now,
    proti_yli: `Επιβεβαιωμένα facts από first-party πηγή: ${facts.join(" ")} Μην προσθέσεις μη επιβεβαιωμένες λεπτομέρειες, αξιολογικές κρίσεις ή πληροφορίες από το discovery article.`,
    verification: {
      method: "first_party_page",
      official_url: result.official_url,
      discovery_article_url: result.discovery_article_url || "",
      verified_at: now
    }
  };

  const list = autoVerified[candidate.city];
  if (!list.some(x => x.id === record.id)) list.unshift(record);
  autoVerified[candidate.city] = list.slice(0, 60);
  newVerified++;
  console.log(`  ✓ VERIFIED: ${record.titlos} → ${record.pigi_url}`);
}

verificationHistory.updated_at = new Date().toISOString();
await writeFile("content/auto-verified.json", JSON.stringify(autoVerified, null, 2));
await writeFile("content/verification-history.json", JSON.stringify(verificationHistory, null, 2));
console.log(`\nVERIFY DONE: ${newVerified} νέο/α first-party verified candidate(s).`);

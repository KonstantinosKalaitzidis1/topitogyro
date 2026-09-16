// Search fallback for candidates that publisher-page verification could not resolve.
// Bing RSS is used ONLY to locate a possible first-party page. Facts come ONLY from that page.

import { readFile, writeFile } from "node:fs/promises";
import Parser from "rss-parser";

const KLEIDI = process.env.ANTHROPIC_API_KEY || "";
const MONTELO = process.env.AI_MODEL || "claude-haiku-4-5-20251001";
const LIMIT_TOTAL = Number(process.env.VERIFY_SEARCH_LIMIT_TOTAL || 2);
const HTTP_TIMEOUT_MS = Number(process.env.VERIFY_HTTP_TIMEOUT_MS || 12000);
const SEARCH_VERSION = 1;
const parser = new Parser({ timeout: HTTP_TIMEOUT_MS });

if (!KLEIDI || LIMIT_TOTAL <= 0) {
  console.log("VERIFY SEARCH: disabled or missing API key.");
  process.exit(0);
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

function clean(s = "") {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;|&#34;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
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
  const quoted = core.match(/[«“"]([^»”"]{3,70})[»”"]/);
  if (quoted) return quoted[1].trim();
  const beforeColon = core.split(":")[0].trim();
  if (beforeColon.length >= 3 && beforeColon.length <= 70 && beforeColon.split(/\s+/).length <= 8) return beforeColon;
  const beforeVerb = core.split(/\s+(?:στη|στην|στο|έρχεται|έρχονται|ανοίγει|άνοιξε|πάει|πάνε|φέρνει|φέρνουν|γιορτάζει)\s+/i)[0].trim();
  return beforeVerb.length >= 3 && beforeVerb.length <= 70 && beforeVerb.split(/\s+/).length <= 8 ? beforeVerb : "";
}

const STOP = new Set("το η οι τα ο του της των και με για σε στη στην στο στον από απο που ένα ενα μια νέο νεο νέα νεα αθήνα αθηνα θεσσαλονίκη θεσσαλονικη".split(/\s+/));
function tokens(s = "") { return norm(s).split(" ").filter(x => x.length >= 3 && !STOP.has(x)); }
function cityName(code) { return code === "ath" ? "Αθήνα" : "Θεσσαλονίκη"; }

const BLOCKED = [
  "athensvoice.gr","lifo.gr","biscotto.gr","parallaximag.gr","tripadvisor.com","restaurantguru.com",
  "foursquare.com","wolt.com","e-food.gr","efood.gr","yelp.com","vrisko.gr","xo.gr","in2life.gr",
  "gastronomos.gr","thestival.gr","facebook.com/sharer","google.com","bing.com","wikipedia.org",
  "news247.gr","protothema.gr","iefimerida.gr","cnn.gr","tovima.gr","kathimerini.gr"
];
const SOCIAL = ["instagram.com","facebook.com","tiktok.com"];
function blocked(url) {
  const h = domainOf(url);
  return !h || BLOCKED.some(d => h === d || h.endsWith(`.${d}`));
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_TIMEOUT_MS);
  try {
    const r = await fetch(url, {
      redirect:"follow", signal:controller.signal,
      headers:{"user-agent":"Mozilla/5.0 (compatible; PitogyroBot/1.0; +https://github.com/KonstantinosKalaitzidis1/topitogyro)","accept":"text/html,application/xhtml+xml"}
    });
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.includes("text/html")) return null;
    return { url:r.url, html:(await r.text()).slice(0,750000) };
  } catch { return null; }
  finally { clearTimeout(timer); }
}

function linksFromHtml(html = "", baseUrl = "") {
  const out=[];
  const re=/<a\b[^>]*?href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while((m=re.exec(html))) {
    let u=String(m[1]).replace(/&amp;/gi,"&");
    try { u=new URL(u,baseUrl).href; } catch { continue; }
    if(/^https?:\/\//i.test(u)) out.push({url:u,text:clean(m[2]).slice(0,180)});
  }
  return out;
}

function pageText(html="") {
  const title=clean((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)||[])[1]||"");
  const metas=[...html.matchAll(/<meta\b[^>]*(?:name|property)=["'](?:description|og:title|og:description)["'][^>]*content=["']([^"']+)["']/gi)].map(m=>clean(m[1]));
  const jsonLd=[...html.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(m=>clean(m[1]).slice(0,3500));
  return [title,...metas,clean(html).slice(0,10000),...jsonLd].filter(Boolean).join("\n").slice(0,15000);
}

function internalUseful(html,pageUrl) {
  const host=domainOf(pageUrl);
  const keys=["contact","menu","about","location","hours","event","events","program","επικοινων","μενου","ωραριο","προγραμμα","τοποθεσ"];
  const seen=new Set();
  return linksFromHtml(html,pageUrl).filter(l=>domainOf(l.url)===host)
    .filter(l=>keys.some(k=>norm(`${l.text} ${l.url}`).includes(norm(k))))
    .filter(l=>{const u=l.url.split("#")[0];if(seen.has(u))return false;seen.add(u);return true;}).slice(0,2);
}

async function bundle(url) {
  const first=await fetchHtml(url);
  if(!first) return null;
  const host=domainOf(first.url);
  if(!host || blocked(first.url)) return null;
  const social=SOCIAL.some(d=>host===d||host.endsWith(`.${d}`));
  const pages=[{url:first.url,text:pageText(first.html)}];
  if(!social){
    for(const x of internalUseful(first.html,first.url)){
      const p=await fetchHtml(x.url); if(p) pages.push({url:p.url,text:pageText(p.html)});
    }
  }
  return {official_url:first.url,pages};
}

function resultScore(item, entity, city) {
  const h=domainOf(item.link||"");
  if(!h || blocked(item.link||"")) return -999;
  const hay=norm(`${item.title||""} ${item.link||""} ${item.contentSnippet||""}`);
  let score=0;
  for(const t of tokens(entity).slice(0,5)) if(hay.includes(t)) score+=5;
  if(hay.includes(norm(cityName(city)))) score+=2;
  if(tokens(entity).some(t=>h.includes(t))) score+=4;
  if(SOCIAL.some(d=>h===d||h.endsWith(`.${d}`))) score+=1; else score+=3;
  if(/official|επισημ/i.test(item.title||"")) score+=2;
  return score;
}

async function bingCandidates(entity,city) {
  const queries=[`${entity} ${cityName(city)}`,`${entity} official ${cityName(city)}`];
  const all=[];
  for(const q of queries){
    const url=`https://www.bing.com/search?q=${encodeURIComponent(q)}&format=rss`;
    try {
      const feed=await parser.parseURL(url);
      for(const item of feed.items||[]) all.push({...item,score:resultScore(item,entity,city)});
    } catch(e) { console.log(`  Bing RSS unavailable for query: ${e.message}`); }
  }
  const seen=new Set();
  return all.filter(x=>x.score>=6).sort((a,b)=>b.score-a.score).filter(x=>{
    const u=x.link||""; if(!u||seen.has(u))return false;seen.add(u);return true;
  }).slice(0,5);
}

async function anthropicJson(system,user){
  const r=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"content-type":"application/json","x-api-key":KLEIDI,"anthropic-version":"2023-06-01"},body:JSON.stringify({model:MONTELO,max_tokens:800,temperature:0,system,messages:[{role:"user",content:user}]})});
  if(!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const d=await r.json(); const text=(d.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("").trim();
  const a=text.indexOf("{"); const b=text.lastIndexOf("}"); if(a<0||b<=a) throw new Error("non-JSON verifier response");
  return JSON.parse(text.slice(a,b+1));
}

const VERIFIER=`Είσαι αυστηρός verifier για το ΠΙΤΟΓΥΡΟ. Το SEARCH RESULT είναι μόνο locator και ΔΕΝ είναι πηγή facts. Χρησιμοποίησε facts ΜΟΝΟ από το FIRST-PARTY PAGE TEXT. Επιβεβαίωσε ότι η σελίδα ανήκει πράγματι στο ίδιο entity και αφορά τη ζητούμενη πόλη. Food/opening: απαιτείται ταυτότητα + πόλη/διεύθυνση ή σαφής τοποθεσία + ένα πρακτικό fact. Event/music/street: απαιτείται ταυτότητα + πόλη/venue + συγκεκριμένη ημερομηνία ή πρόγραμμα. Αν λείπει κάτι, verified=false. Μην συμπεραίνεις ποιότητα, γεύση, opening date ή αυθεντικότητα. Απάντησε ΜΟΝΟ JSON: {"verified":true|false,"reason":"...","title":"ουδέτερος ελληνικός τίτλος","facts":["..."],"entity":"..."}`;

const discovery=await readJson("content/discovery.json",{ath:[],thes:[]});
const auto=await readJson("content/auto-verified.json",{ath:[],thes:[]});
const history=await readJson("content/verification-history.json",{checks:{}});
auto.ath||=[];auto.thes||=[];history.checks||={};
const done=new Set([...auto.ath,...auto.thes].map(x=>x.original_candidate_id).filter(Boolean));

const eligibleReasons=new Set(["publisher_article_unresolved","no_plausible_first_party_link","first_party_not_sufficient","generic_or_no_entity"]);
const pool=[];
for(const city of ["ath","thes"]){
  for(const c of discovery[city]||[]){
    if(!c?.id||done.has(c.id))continue;
    const h=history.checks[c.id]||{};
    if(h.search_status==="verified"||h.search_version===SEARCH_VERSION)continue;
    if(h.status && h.status!=="not_verified")continue;
    if(h.reason && !eligibleReasons.has(h.reason))continue;
    const entity=entityHint(c.title); if(!entity)continue;
    pool.push({...c,entity});
  }
}

const ordered=[];
for(let i=0;ordered.length<LIMIT_TOTAL;i++){
  let added=false;
  for(const city of ["ath","thes"]){const n=pool.filter(x=>x.city===city)[i];if(n&&ordered.length<LIMIT_TOTAL){ordered.push(n);added=true;}}
  if(!added)break;
}

console.log(`VERIFY SEARCH v${SEARCH_VERSION}: ${ordered.length} candidate(s).`);
let verifiedCount=0;
for(const c of ordered){
  console.log(`\nSEARCH ${c.city.toUpperCase()}: ${c.entity}`);
  let final=null; let reason="no_search_candidate";
  try{
    const results=await bingCandidates(c.entity,c.city);
    console.log(`  Bing first-party candidates: ${results.length}`);
    for(const r of results){
      const b=await bundle(r.link); if(!b)continue;
      const txt=b.pages.map((p,i)=>`PAGE ${i+1}: ${p.url}\n${p.text}`).join("\n\n").slice(0,24000);
      if(txt.length<180)continue;
      const v=await anthropicJson(VERIFIER,`CITY: ${cityName(c.city)}\nCATEGORY: ${c.category}\nENTITY HINT: ${c.entity}\nSEARCH RESULT TITLE (locator only, NOT facts): ${r.title||""}\nFIRST-PARTY URL: ${b.official_url}\n\nFIRST-PARTY PAGE TEXT:\n${txt}`);
      if(v?.verified===true&&Array.isArray(v.facts)&&v.facts.length>=2){final={...v,official_url:b.official_url};break;}
      reason=v?.reason||"first_party_not_sufficient";
    }
  }catch(e){reason=`error:${e.message}`;}

  const now=new Date().toISOString();
  history.checks[c.id]||={};
  history.checks[c.id].search_status=final?"verified":"not_verified";
  history.checks[c.id].search_reason=final?"":reason;
  history.checks[c.id].search_checked_at=now;
  history.checks[c.id].search_version=SEARCH_VERSION;
  history.checks[c.id].search_official_url=final?.official_url||"";

  if(!final){console.log(`  NOT VERIFIED BY SEARCH: ${reason}`);continue;}
  const facts=final.facts.map(clean).filter(Boolean).slice(0,8);
  const rec={id:`auto-${c.id}`,original_candidate_id:c.id,verified:true,pigi:`Επίσημη πηγή — ${final.entity||c.entity}`,pigi_url:final.official_url,source_item_url:final.official_url,titlos:clean(final.title||c.title),imerominia:now,proti_yli:`Επιβεβαιωμένα facts από first-party πηγή: ${facts.join(" ")} Μην προσθέσεις μη επιβεβαιωμένες λεπτομέρειες, αξιολογικές κρίσεις ή πληροφορίες από discovery/search results.`,verification:{method:"first_party_search",official_url:final.official_url,verified_at:now}};
  if(!auto[c.city].some(x=>x.id===rec.id))auto[c.city].unshift(rec);
  auto[c.city]=auto[c.city].slice(0,60); verifiedCount++;
  console.log(`  ✓ VERIFIED BY SEARCH: ${rec.titlos} → ${rec.pigi_url}`);
}

history.updated_at=new Date().toISOString();
await writeFile("content/auto-verified.json",JSON.stringify(auto,null,2));
await writeFile("content/verification-history.json",JSON.stringify(history,null,2));
console.log(`\nVERIFY SEARCH DONE: ${verifiedCount} νέο/α verified candidate(s).`);

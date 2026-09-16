// Direct first-party city agenda ingestion.
// Uses official pages only and asks Haiku to extract ONE current/upcoming, on-brand event per city.
// The source page is authoritative; no media article text enters the fact bundle.

import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const KEY = process.env.ANTHROPIC_API_KEY || "";
const MODEL = process.env.AI_MODEL || "claude-haiku-4-5-20251001";
const HTTP_TIMEOUT_MS = Number(process.env.OFFICIAL_HTTP_TIMEOUT_MS || 12000);
const HORIZON_DAYS = Number(process.env.OFFICIAL_HORIZON_DAYS || 45);
const MAX_TEXT = Number(process.env.OFFICIAL_MAX_TEXT || 14000);

if (!KEY) {
  console.log("OFFICIAL FEED: λείπει ANTHROPIC_API_KEY — skip.");
  process.exit(0);
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

function hash(...parts) {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0,24);
}

function cleanHtml(s = "") {
  return String(s)
    .replace(/<script[\s\S]*?<\/script>/gi," ")
    .replace(/<style[\s\S]*?<\/style>/gi," ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi," ")
    .replace(/<[^>]*>/g," ")
    .replace(/&nbsp;|&#160;/gi," ")
    .replace(/&amp;/gi,"&")
    .replace(/&quot;|&#34;/gi,'"')
    .replace(/&#39;|&apos;/gi,"'")
    .replace(/&lt;/gi,"<")
    .replace(/&gt;/gi,">")
    .replace(/\s+/g," ")
    .trim();
}

function norm(s = "") {
  return String(s).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/\s+/g," ").trim();
}

const BLOCK = [
  "πολιτικ", "εκλογ", "κομμα", "κνε", "κυβερν", "βουλευτ", "υπουργ",
  "αστυνομ", "δολοφον", "πυροβολ", "νεκρ", "ατυχημ", "νοσοκομ", "δικασ",
  "ακυρων", "ματαιων", "αναβαλλ", "καταιγιδ", "βροχ", "καιρ"
];

function sensitive(text = "") {
  const t = norm(text);
  return BLOCK.some(x => t.includes(norm(x)));
}

function localDateISO(d = new Date()) {
  // Date-only is sufficient for a 45-day publishing horizon; avoid timezone-dependent clock logic.
  return d.toISOString().slice(0,10);
}

function addDaysIso(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate()+n);
  return d.toISOString().slice(0,10);
}

function validIsoDate(s = "") { return /^\d{4}-\d{2}-\d{2}$/.test(String(s)); }
function inWindow(start, end, today, horizon) {
  if (!validIsoDate(start)) return false;
  const last = validIsoDate(end) ? end : start;
  return last >= today && start <= horizon;
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(),HTTP_TIMEOUT_MS);
  try {
    const r = await fetch(url,{redirect:"follow",signal:controller.signal,headers:{
      "user-agent":"Mozilla/5.0 (compatible; PitogyroBot/1.0; +https://github.com/KonstantinosKalaitzidis1/topitogyro)",
      "accept":"text/html,application/xhtml+xml"
    }});
    if (!r.ok) return null;
    const type=r.headers.get("content-type")||"";
    if (!type.includes("text/html")) return null;
    return {url:r.url,html:(await r.text()).slice(0,900000)};
  } catch { return null; }
  finally { clearTimeout(timer); }
}

async function anthropicJson(system,user) {
  const r=await fetch("https://api.anthropic.com/v1/messages",{
    method:"POST",
    headers:{"content-type":"application/json","x-api-key":KEY,"anthropic-version":"2023-06-01"},
    body:JSON.stringify({model:MODEL,max_tokens:750,temperature:0,system,messages:[{role:"user",content:user}]})
  });
  if(!r.ok) throw new Error(`Anthropic ${r.status}: ${await r.text()}`);
  const d=await r.json();
  const text=(d.content||[]).filter(x=>x.type==="text").map(x=>x.text).join("").trim();
  const a=text.indexOf("{"); const b=text.lastIndexOf("}");
  if(a<0||b<=a) throw new Error("non-JSON official feed response");
  return JSON.parse(text.slice(a,b+1));
}

const SYSTEM=`Είσαι αυστηρός extractor first-party agenda για το ΠΙΤΟΓΥΡΟ.\nΗ σελίδα που λαμβάνεις είναι η ΕΠΙΣΗΜΗ πηγή. Επίλεξε ΜΟΝΟ ΕΝΑ current/upcoming event που αποδεικνύεται από το κείμενο και ταιριάζει σε urban culture: μουσική, live/DJ, street culture, graffiti, design, photography, exhibition, performance, food/city festival.\nΜΗΝ επιλέγεις πολιτική/κόμματα, ειδήσεις εγκλήματος/υγείας/ατυχημάτων, ακυρώσεις, generic μηνιαίο οδηγό ή event χωρίς σαφή ημερομηνία και τοποθεσία.\nΜΗΝ χρησιμοποιείς γνώση εκτός της επίσημης σελίδας. ΜΗΝ εφευρίσκεις τιμές, ώρες, καλλιτέχνες ή περιγραφή.\nΗ start_date/end_date πρέπει να είναι YYYY-MM-DD και να προκύπτουν από τη σελίδα. Αν δεν υπάρχει κατάλληλο event, selected=false.\nFacts: 2 έως 6 σύντομες, αυτοτελείς παραφράσεις που αφορούν ΜΟΝΟ το επιλεγμένο event.\nΑπάντησε ΜΟΝΟ JSON: {"selected":true|false,"reason":"...","city":"ath|thes","title":"...","start_date":"YYYY-MM-DD","end_date":"YYYY-MM-DD","location":"...","category":"ΜΟΥΣΙΚΗ|ΔΡΟΜΟΣ|ΒΓΕΣ|ΠΙΑΤΣΑ","facts":["..."]}`;

function technopolisWeekUrl(today) {
  return `https://www.athens-technopolis.gr/index.php/en/component/djevents/weekly/day/${today}`;
}

const today=localDateISO();
const horizon=addDaysIso(today,HORIZON_DAYS);
const dayNumber=Math.floor(new Date(`${today}T12:00:00Z`).getTime()/86400000);

const sourceSets={
  ath:[
    {name:"Τεχνόπολη Δήμου Αθηναίων",url:technopolisWeekUrl(today)},
    {name:"Στέγη Ιδρύματος Ωνάση — What's On",url:"https://www.onassis.org/whats-on"}
  ],
  thes:[
    {name:"MOMus — Εκδηλώσεις",url:"https://www.momus.gr/events"}
  ]
};

// Rotate Athens source daily so the normal case is only one AI extraction per city.
if(sourceSets.ath.length>1 && dayNumber%2===1) sourceSets.ath.reverse();

const auto=await readJson("content/auto-verified.json",{ath:[],thes:[]});
const history=await readJson("content/history.json",{published_ids:[],rejected_ids:[]});
auto.ath ||= []; auto.thes ||= [];
const handled=new Set([...(history.published_ids||[]),...(history.rejected_ids||[])]);

for(const city of ["ath","thes"]){
  const usedTitles=(auto[city]||[]).map(x=>x.titlos).filter(Boolean).slice(0,20);
  let added=false;
  for(const src of sourceSets[city]){
    const page=await fetchHtml(src.url);
    if(!page){ console.log(`OFFICIAL ${city.toUpperCase()}: ${src.name} unreachable`); continue; }
    const text=cleanHtml(page.html).slice(0,MAX_TEXT);
    if(text.length<250){ console.log(`OFFICIAL ${city.toUpperCase()}: ${src.name} too little text`); continue; }
    let result;
    try{
      result=await anthropicJson(SYSTEM,
        `TODAY: ${today}\nHORIZON END: ${horizon}\nREQUIRED CITY CODE: ${city}\nOFFICIAL SOURCE: ${src.name}\nOFFICIAL URL: ${page.url}\nALREADY USED — choose a different event if possible: ${JSON.stringify(usedTitles)}\n\nOFFICIAL PAGE TEXT:\n${text}`
      );
    }catch(e){ console.log(`OFFICIAL ${city.toUpperCase()}: extractor error ${e.message}`); continue; }

    if(result?.selected!==true){ console.log(`OFFICIAL ${city.toUpperCase()}: ${src.name} → no suitable event (${result?.reason||"none"})`); continue; }
    const facts=Array.isArray(result.facts)?result.facts.map(x=>cleanHtml(String(x))).filter(Boolean).slice(0,6):[];
    const title=cleanHtml(result.title||"");
    const location=cleanHtml(result.location||"");
    const start=String(result.start_date||"");
    const end=String(result.end_date||start);
    const bundle=`${title} ${location} ${facts.join(" ")}`;
    if(result.city!==city || !title || facts.length<2 || sensitive(bundle) || !inWindow(start,end,today,horizon)){
      console.log(`OFFICIAL ${city.toUpperCase()}: rejected by deterministic gate → ${title||"untitled"}`);
      continue;
    }

    const id=`official-${hash(src.name,title,start)}`;
    if(handled.has(id) || auto[city].some(x=>x.id===id)){
      console.log(`OFFICIAL ${city.toUpperCase()}: already handled → ${title}`);
      continue;
    }

    const record={
      id,
      original_candidate_id:id,
      verified:true,
      pigi:`${src.name} — official first-party agenda`,
      pigi_url:page.url,
      source_item_url:page.url,
      titlos:title,
      imerominia:new Date().toISOString(),
      proti_yli:`Επιβεβαιωμένα facts από επίσημη first-party agenda. Ημερομηνία: ${start}${end&&end!==start?` έως ${end}`:""}. Τοποθεσία: ${location}. ${facts.join(" ")} Μην προσθέσεις άλλες ημερομηνίες, τιμές, ώρες, πρόσωπα ή αξιολογικές κρίσεις που δεν περιλαμβάνονται στα παραπάνω facts.`,
      verification:{method:"official_first_party_agenda",official_url:page.url,start_date:start,end_date:end,location,verified_at:new Date().toISOString()}
    };
    auto[city].unshift(record);
    auto[city]=auto[city].slice(0,60);
    console.log(`OFFICIAL ${city.toUpperCase()}: ✓ ${title} | ${start}${end!==start?`–${end}`:""} | ${src.name}`);
    added=true;
    break;
  }
  if(!added) console.log(`OFFICIAL ${city.toUpperCase()}: κανένα νέο first-party event για writer.`);
}

auto.updated_at=new Date().toISOString();
await writeFile("content/auto-verified.json",JSON.stringify(auto,null,2));

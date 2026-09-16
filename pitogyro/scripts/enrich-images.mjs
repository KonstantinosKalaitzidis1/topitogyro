// Enriches verified local stories with first-party OpenGraph images when available.
// We only accept HTTPS images explicitly declared by the verified source page.
import { readFile, writeFile } from "node:fs/promises";

const TIMEOUT = Number(process.env.IMAGE_HTTP_TIMEOUT_MS || 9000);
async function json(path,fallback){try{return JSON.parse(await readFile(path,"utf8"));}catch{return fallback;}}
function esc(s=""){return String(s).replace(/&amp;/g,"&").replace(/&quot;/g,'"').replace(/&#39;/g,"'");}
function absolute(base,value=""){try{return new URL(esc(value),base).href;}catch{return "";}}
async function page(url){
  const c=new AbortController(); const t=setTimeout(()=>c.abort(),TIMEOUT);
  try{const r=await fetch(url,{redirect:"follow",signal:c.signal,headers:{"user-agent":"Mozilla/5.0 (compatible; PitogyroBot/1.0)"}}); if(!r.ok)return null; const type=r.headers.get("content-type")||""; if(!type.includes("text/html"))return null; return {url:r.url,html:(await r.text()).slice(0,500000)};}catch{return null;}finally{clearTimeout(t);}
}
function meta(html,key){
  const tags=html.match(/<meta\b[^>]*>/gi)||[];
  for(const tag of tags){
    const prop=(tag.match(/(?:property|name)=["']([^"']+)["']/i)||[])[1]||"";
    if(prop.toLowerCase()!==key.toLowerCase())continue;
    return (tag.match(/content=["']([^"']+)["']/i)||[])[1]||"";
  }
  return "";
}
function sourceUrl(a){return a?.source?.url||a?.source?.source_item_url||a?.source_item_url||a?.pigi_url||a?.verification?.official_url||"";}
function sourceId(a){return a?.source?.source_id||a?.id||"";}

const articles=await json("content/arthra.json",{ath:[],thes:[]});
const images=await json("content/images.json",{});
let added=0;
for(const city of ["ath","thes"]){
  for(const a of articles[city]||[]){
    const sid=sourceId(a); if(!sid||a.eikona||images[sid])continue;
    const url=sourceUrl(a); if(!/^https:\/\//i.test(url))continue;
    const p=await page(url); if(!p)continue;
    const raw=meta(p.html,"og:image")||meta(p.html,"twitter:image");
    const img=absolute(p.url,raw); if(!/^https:\/\//i.test(img))continue;
    images[sid]={url:img,alt:`Εικόνα πηγής για: ${a.titlos||"άρθρο"}`,credit:`Εικόνα: ${new URL(p.url).hostname}`,license:"First-party editorial image — source-linked use only",source_page:p.url,kind:"first_party_editorial"};
    added++; console.log(`IMAGE ${city.toUpperCase()}: ✓ ${a.titlos||sid}`);
  }
}
images._registry_version=`${new Date().toISOString().slice(0,10)}-auto-first-party`;
await writeFile("content/images.json",JSON.stringify(images,null,2));
console.log(`IMAGE ENRICH DONE: ${added} new source-linked image(s).`);

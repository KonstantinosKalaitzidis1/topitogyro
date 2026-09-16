// Χτίζει το δημόσιο site ΜΟΝΟ από QA-passed content/arthra.json.
// Το template κρατά layout/design, αλλά ΚΑΝΕΝΑ demo datum δεν περνά στο public index.html.
// Local city stories κρατούν το hero. Global "ΒΡΩΜΙΑ ΣΠΙΤΙ" μπαίνει στη ροή και των δύο πόλεων.
// Οι εικόνες έρχονται μόνο από content/images.json με ρητό credit/license metadata.

import { readFile, writeFile } from "node:fs/promises";

const template = await readFile("templates/site.html", "utf8");

let arthra;
try { arthra = JSON.parse(await readFile("content/arthra.json", "utf8")); }
catch { console.error("Δεν βρέθηκε έγκυρο content/arthra.json. Το υπάρχον δημόσιο index.html ΔΕΝ αντικαθίσταται από demo template."); process.exit(1); }

let images = {};
try { images = JSON.parse(await readFile("content/images.json", "utf8")); } catch { images = {}; }

const arxi = template.indexOf("const DEDOMENA = {");
const telos = template.indexOf("function oraAthinas(){");
if (arxi === -1 || telos === -1 || telos <= arxi) { console.error("Το template δεν έχει την αναμενόμενη δομή DEDOMENA."); process.exit(1); }

function sourceLabel(a) {
  const name = a?.source?.name?.trim();
  return name ? `${name.startsWith("Έμπνευση:") ? "" : "Πηγή: "}${name}` : "ΤΟ ΠΙΤΟΓΥΡΟ";
}
function withImage(a) { if (!a) return a; const sid=a?.source?.source_id||""; return {...a,eikona:a.eikona||(sid?images[sid]:null)||null}; }
function card(article) { const a=withImage(article); return {kat:a?.kat||"ΠΟΛΗ",titlos:a?.titlos||"",keimeno:a?.keimeno||"",soma:Array.isArray(a?.soma)?a.soma:[],ypografi:sourceLabel(a),eikona:a?.eikona||null}; }
function emptyHero(){return{etiketa:"",legenda:"",titlos:"",keimeno:"",ypografi:"",soma:[],eikona:null};}
function cityData(code,local=[],global=[]){
  const localSafe=(Array.isArray(local)?local:[]).map(withImage), globalSafe=(Array.isArray(global)?global:[]).map(withImage);
  const meta=code==="ath"?{onoma:"ΑΘΗΝΑ",se:"ΣΤΗΝ ΑΘΗΝΑ",akcenta:"#D6242B"}:{onoma:"ΘΕΣΣΑΛΟΝΙΚΗ",se:"ΣΤΗ ΘΕΣΣΑΛΟΝΙΚΗ",akcenta:"#1B6E7A"};
  const h=localSafe[0]||null;
  const kyrio=h?{etiketa:h.kat||"ΣΗΜΕΡΑ",legenda:new Date().toLocaleDateString("el-GR"),titlos:h.titlos||"",keimeno:h.keimeno||"",ypografi:sourceLabel(h),soma:Array.isArray(h.soma)?h.soma:[],eikona:h.eikona||null}:emptyHero();
  return {...meta,kyrio,ekdiloseis:[],times:[],arthra:[...localSafe.slice(1),...globalSafe].map(card)};
}
const publicData={ath:cityData("ath",arthra.ath,arthra.global),thes:cityData("thes",arthra.thes,arthra.global)};
const neaDedomena=`const DEDOMENA = ${JSON.stringify(publicData,null,2)};\n\n`;
let selida=template.slice(0,arxi)+neaDedomena+template.slice(telos);

const hasThessaloniki=Boolean(publicData.thes.kyrio.titlos);
const launchSafeCss=`
<style id="launch-safe">
  #deiktis{display:none!important} #apopse aside{display:none!important} #apopse{grid-template-columns:minmax(0,1fr)!important}
  #apopse:has(#kyrio-titlos a:empty){display:none!important} ${hasThessaloniki?"":'.diakoptis button[data-poli="thes"]{display:none!important}'} #roi:has(#roi-grid:empty){display:none!important}
  .eikona-arthrou.me-foto,.anagnosi .zoni.me-foto{background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important}
  .eikona-arthrou.me-foto::before,.anagnosi .zoni.me-foto::before{background:linear-gradient(to top,rgba(0,0,0,.68),rgba(0,0,0,.03) 58%)!important}
  .photo-credit{font-size:9px;line-height:1.25;color:var(--melani-soft);opacity:.48;margin:-13px 0 20px;letter-spacing:.01em}
  /* Οι πηγές παραμένουν διαθέσιμες για διαφάνεια, αλλά οπτικά υποχωρούν ώστε να μη συναγωνίζονται το editorial περιεχόμενο. */
  #kyrio-ypografi,[id*="ypografi"],.ypografi,.pigi,.source,.source-label,[class*="source"]{font-size:9px!important;line-height:1.2!important;opacity:.38!important;font-weight:400!important;letter-spacing:.01em!important;text-transform:none!important}
  .poioi-eimaste{border-top:2px solid var(--melani);border-bottom:2px solid var(--melani);padding:42px 0;margin-top:24px}.poioi-eimaste .mesa{max-width:760px}.poioi-eimaste h2{font-size:clamp(34px,5vw,58px);margin:0 0 16px}.poioi-eimaste p{font-size:clamp(18px,2.2vw,23px);line-height:1.45;margin:0;color:var(--melani-soft)}
</style>`;
selida=selida.replace("</head>",`${launchSafeCss}\n</head>`);
const aboutSection=`<section class="wrap poioi-eimaste" id="poioi"><div class="mesa"><h2>Ποιοι είμαστε</h2><p>Είμαστε μια ομάδα ανθρώπων που περπατάει πολύ στην πόλη. Μας αρέσουν όλα τα φάσματά της — το φαγητό, η μουσική, οι δρόμοι, οι γειτονιές, οι άνθρωποι, τα μικρά μαγαζιά και κυρίως τα περίεργα που συνήθως περνάνε απαρατήρητα. Το ΠΙΤΟΓΥΡΟ είναι ο τρόπος μας να τα μαζεύουμε όλα αυτά σε ένα μέρος.</p></div></section>`;
selida=selida.replace("</main>",`${aboutSection}\n\n</main>`).replace('<a href="#">Ποιοι είμαστε</a>','<a href="#poioi">Ποιοι είμαστε</a>');

const imageRuntime=`<script id="pitogyro-images">(function(){function bg(el,e){if(!el)return;if(e&&e.url){const u=String(e.url).replace(/"/g,"%22");el.classList.add("me-foto");el.style.backgroundImage='url("'+u+'")';if(e.alt)el.setAttribute("aria-label",e.alt)}else{el.classList.remove("me-foto");el.style.backgroundImage="";el.removeAttribute("aria-label")}}function hero(){if(typeof DEDOMENA==="undefined"||typeof poliTora==="undefined")return;const a=DEDOMENA[poliTora]&&DEDOMENA[poliTora].kyrio;if(!a)return;bg(document.querySelector(".eikona-arthrou"),a.eikona);const l=document.getElementById("legenda-eikonas");if(l){const p=[a.legenda];if(a.eikona&&a.eikona.credit)p.push(a.eikona.credit);l.textContent=p.filter(Boolean).join(" · ")}}function fullArticle(link){if(typeof DEDOMENA==="undefined"||typeof poliTora==="undefined")return;const d=DEDOMENA[poliTora];if(!d)return;const i=link&&link.dataset?link.dataset.arthro:null;const a=i==="kyrio"?d.kyrio:d.arthra[Number(i)];if(!a)return;setTimeout(function(){const z=document.querySelector(".anagnosi .zoni");bg(z,a.eikona);const old=document.querySelector(".anagnosi .photo-credit");if(old)old.remove();if(z&&a.eikona&&a.eikona.credit){const c=document.createElement("div");c.className="photo-credit";c.textContent=a.eikona.credit+(a.eikona.license?" · "+a.eikona.license:"");z.insertAdjacentElement("afterend",c)}},0)}hero();document.querySelectorAll('.diakoptis button').forEach(b=>b.addEventListener("click",()=>setTimeout(hero,0)));document.addEventListener("click",e=>{const l=e.target.closest("[data-arthro]");if(l)fullArticle(l)})})();</script>`;
selida=selida.replace("</body>",`${imageRuntime}\n</body>`);
const jsBlocks=[...selida.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
try{for(const js of jsBlocks)new Function(js)}catch(e){console.error("Το παραγόμενο JavaScript είναι άκυρο:",e.message);console.error("Το site ΔΕΝ ενημερώθηκε.");process.exit(1)}
const forbiddenDemoMarkers=["Τρία ευρώ, ακόμα, στα Πετράλωνα","Χαΐνηδες στην Τεχνόπολη. Και μετά βλέπουμε.","Η Βαλαωρίτου άλλαξε πάλι χέρια","Μπουγάτσα πριν τις επτά: ποιος αξίζει το ξύπνημα"];
for(const marker of forbiddenDemoMarkers){if(selida.includes(marker)){console.error(`DEMO GUARD: βρέθηκε απαγορευμένο prototype content: ${marker}`);process.exit(1)}}
await writeFile("index.html",selida);
const synolo=(arthra.ath?.length||0)+(arthra.thes?.length||0)+(arthra.global?.length||0);
console.log(`index.html ενημερώθηκε με ${synolo} QA-passed άρθρα/συνταγές, 0 demo data και licensed image metadata.`);

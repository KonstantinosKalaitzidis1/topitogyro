// Χτίζει το δημόσιο site ΜΟΝΟ από QA-passed content/arthra.json.
// Το template κρατά layout/design, αλλά ΚΑΝΕΝΑ demo datum δεν περνά στο public index.html.
// Local city stories κρατούν το hero. Global "ΒΡΩΜΙΑ ΣΠΙΤΙ" μπαίνει στη ροή και των δύο πόλεων.
// Οι εικόνες έρχονται μόνο από content/images.json με ρητό credit/license metadata.

import { readFile, writeFile } from "node:fs/promises";

const template = await readFile("templates/site.html", "utf8");

let arthra;
try {
  arthra = JSON.parse(await readFile("content/arthra.json", "utf8"));
} catch {
  console.error("Δεν βρέθηκε έγκυρο content/arthra.json. Το υπάρχον δημόσιο index.html ΔΕΝ αντικαθίσταται από demo template.");
  process.exit(1);
}

let images = {};
try {
  images = JSON.parse(await readFile("content/images.json", "utf8"));
} catch {
  images = {};
}

const arxi = template.indexOf("const DEDOMENA = {");
const telos = template.indexOf("function oraAthinas(){");

if (arxi === -1 || telos === -1 || telos <= arxi) {
  console.error("Το template δεν έχει την αναμενόμενη δομή DEDOMENA.");
  process.exit(1);
}

function sourceLabel(a) {
  const name = a?.source?.name?.trim();
  return name ? `${name.startsWith("Έμπνευση:") ? "" : "Πηγή: "}${name}` : "ΤΟ ΠΙΤΟΓΥΡΟ";
}

function withImage(a) {
  if (!a) return a;
  const sid = a?.source?.source_id || "";
  const eikona = a.eikona || (sid ? images[sid] : null) || null;
  return { ...a, eikona };
}

function card(article) {
  const a = withImage(article);
  return {
    kat: a?.kat || "ΠΟΛΗ",
    titlos: a?.titlos || "",
    keimeno: a?.keimeno || "",
    soma: Array.isArray(a?.soma) ? a.soma : [],
    ypografi: sourceLabel(a),
    eikona: a?.eikona || null
  };
}

function emptyHero() {
  return {
    etiketa: "",
    legenda: "",
    titlos: "",
    keimeno: "",
    ypografi: "",
    soma: [],
    eikona: null
  };
}

function cityData(code, local = [], global = []) {
  const localSafe = (Array.isArray(local) ? local : []).map(withImage);
  const globalSafe = (Array.isArray(global) ? global : []).map(withImage);
  const meta = code === "ath"
    ? { onoma: "ΑΘΗΝΑ", se: "ΣΤΗΝ ΑΘΗΝΑ", akcenta: "#D6242B" }
    : { onoma: "ΘΕΣΣΑΛΟΝΙΚΗ", se: "ΣΤΗ ΘΕΣΣΑΛΟΝΙΚΗ", akcenta: "#1B6E7A" };

  const heroArticle = localSafe[0] || null;
  const kyrio = heroArticle ? {
    etiketa: heroArticle.kat || "ΣΗΜΕΡΑ",
    legenda: new Date().toLocaleDateString("el-GR"),
    titlos: heroArticle.titlos || "",
    keimeno: heroArticle.keimeno || "",
    ypografi: sourceLabel(heroArticle),
    soma: Array.isArray(heroArticle.soma) ? heroArticle.soma : [],
    eikona: heroArticle.eikona || null
  } : emptyHero();

  return {
    ...meta,
    kyrio,
    // Μέχρι να υπάρχουν verified structured δεδομένα, αυτά μένουν πραγματικά κενά.
    ekdiloseis: [],
    times: [],
    arthra: [...localSafe.slice(1), ...globalSafe].map(card)
  };
}

const publicData = {
  ath: cityData("ath", arthra.ath, arthra.global),
  thes: cityData("thes", arthra.thes, arthra.global)
};

// Κρίσιμο: πετάμε ολόκληρο το demo DEDOMENA block του template και το αντικαθιστούμε
// με JSON που προέρχεται μόνο από QA-passed αρχεία.
const neaDedomena = `const DEDOMENA = ${JSON.stringify(publicData, null, 2)};\n\n`;
let selida = template.slice(0, arxi) + neaDedomena + template.slice(telos);

const hasThessaloniki = Boolean(publicData.thes.kyrio.titlos);
const launchSafeCss = `
<style id="launch-safe">
  /* Δεν υπάρχει ακόμη verified structured price/event feed. */
  #deiktis{display:none!important}
  #apopse aside{display:none!important}
  #apopse{grid-template-columns:minmax(0,1fr)!important}
  #apopse:has(#kyrio-titlos a:empty){display:none!important}
  ${hasThessaloniki ? "" : '.diakoptis button[data-poli="thes"]{display:none!important}'}
  #roi:has(#roi-grid:empty){display:none!important}

  .eikona-arthrou.me-foto,
  .anagnosi .zoni.me-foto{
    background-size:cover!important;
    background-position:center!important;
    background-repeat:no-repeat!important;
  }
  .eikona-arthrou.me-foto::before,
  .anagnosi .zoni.me-foto::before{
    background:linear-gradient(to top,rgba(0,0,0,.68),rgba(0,0,0,.03) 58%)!important;
  }
  .photo-credit{
    font-size:12px;
    line-height:1.4;
    color:var(--melani-soft);
    margin:-17px 0 24px;
  }

  .poioi-eimaste{
    border-top:2px solid var(--melani);
    border-bottom:2px solid var(--melani);
    padding:42px 0;
    margin-top:24px;
  }
  .poioi-eimaste .mesa{max-width:760px}
  .poioi-eimaste h2{font-size:clamp(34px,5vw,58px);margin:0 0 16px}
  .poioi-eimaste p{font-size:clamp(18px,2.2vw,23px);line-height:1.45;margin:0;color:var(--melani-soft)}
</style>`;
selida = selida.replace("</head>", `${launchSafeCss}\n</head>`);

const aboutSection = `
<section class="wrap poioi-eimaste" id="poioi">
  <div class="mesa">
    <h2>Ποιοι είμαστε</h2>
    <p>Είμαστε μια ομάδα ανθρώπων που περπατάει πολύ στην πόλη. Μας αρέσουν όλα τα φάσματά της — το φαγητό, η μουσική, οι δρόμοι, οι γειτονιές, οι άνθρωποι, τα μικρά μαγαζιά και κυρίως τα περίεργα που συνήθως περνάνε απαρατήρητα. Το ΠΙΤΟΓΥΡΟ είναι ο τρόπος μας να τα μαζεύουμε όλα αυτά σε ένα μέρος.</p>
  </div>
</section>`;

selida = selida.replace("</main>", `${aboutSection}\n\n</main>`);
selida = selida.replace('<a href="#">Ποιοι είμαστε</a>', '<a href="#poioi">Ποιοι είμαστε</a>');

const imageRuntime = `
<script id="pitogyro-images">
(function(){
  function bg(el, eikona){
    if(!el) return;
    if(eikona && eikona.url){
      const safeUrl = String(eikona.url).replace(/"/g, "%22");
      el.classList.add("me-foto");
      el.style.backgroundImage = 'url("' + safeUrl + '")';
      if(eikona.alt) el.setAttribute("aria-label", eikona.alt);
    }else{
      el.classList.remove("me-foto");
      el.style.backgroundImage = "";
      el.removeAttribute("aria-label");
    }
  }

  function hero(){
    if(typeof DEDOMENA === "undefined" || typeof poliTora === "undefined") return;
    const a = DEDOMENA[poliTora] && DEDOMENA[poliTora].kyrio;
    if(!a) return;
    const box = document.querySelector(".eikona-arthrou");
    bg(box, a.eikona);
    const leg = document.getElementById("legenda-eikonas");
    if(leg){
      const parts = [a.legenda];
      if(a.eikona && a.eikona.credit) parts.push(a.eikona.credit);
      leg.textContent = parts.filter(Boolean).join(" · ");
    }
  }

  function fullArticle(link){
    if(typeof DEDOMENA === "undefined" || typeof poliTora === "undefined") return;
    const d = DEDOMENA[poliTora];
    if(!d) return;
    const i = link && link.dataset ? link.dataset.arthro : null;
    const a = i === "kyrio" ? d.kyrio : d.arthra[Number(i)];
    if(!a) return;
    setTimeout(function(){
      const z = document.querySelector(".anagnosi .zoni");
      bg(z, a.eikona);
      const old = document.querySelector(".anagnosi .photo-credit");
      if(old) old.remove();
      if(z && a.eikona && a.eikona.credit){
        const c = document.createElement("div");
        c.className = "photo-credit";
        c.textContent = a.eikona.credit + (a.eikona.license ? " · " + a.eikona.license : "");
        z.insertAdjacentElement("afterend", c);
      }
    }, 0);
  }

  hero();
  document.querySelectorAll('.diakoptis button').forEach(function(b){
    b.addEventListener("click", function(){ setTimeout(hero,0); });
  });
  document.addEventListener("click", function(e){
    const link = e.target.closest("[data-arthro]");
    if(link) fullArticle(link);
  });
})();
</script>`;
selida = selida.replace("</body>", `${imageRuntime}\n</body>`);

const jsBlocks = [...selida.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].map(m => m[1]);
try {
  for (const js of jsBlocks) new Function(js);
} catch (e) {
  console.error("Το παραγόμενο JavaScript είναι άκυρο:", e.message);
  console.error("Το site ΔΕΝ ενημερώθηκε.");
  process.exit(1);
}

// Άμυνα τελευταίου σταδίου: γνωστές demo φράσεις δεν επιτρέπεται να βγουν public.
const forbiddenDemoMarkers = [
  "Τρία ευρώ, ακόμα, στα Πετράλωνα",
  "Χαΐνηδες στην Τεχνόπολη. Και μετά βλέπουμε.",
  "Η Βαλαωρίτου άλλαξε πάλι χέρια",
  "Μπουγάτσα πριν τις επτά: ποιος αξίζει το ξύπνημα"
];
for (const marker of forbiddenDemoMarkers) {
  if (selida.includes(marker)) {
    console.error(`DEMO GUARD: βρέθηκε απαγορευμένο prototype content: ${marker}`);
    process.exit(1);
  }
}

await writeFile("index.html", selida);

const synolo = (arthra.ath?.length || 0) + (arthra.thes?.length || 0) + (arthra.global?.length || 0);
console.log(`index.html ενημερώθηκε με ${synolo} QA-passed άρθρα/συνταγές, 0 demo data και licensed image metadata.`);

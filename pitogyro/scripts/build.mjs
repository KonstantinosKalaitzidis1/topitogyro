// Παίρνει τα άρθρα και ξαναφτιάχνει το index.html από το template.
// Local city stories κρατούν το hero. Global "ΒΡΩΜΙΑ ΣΠΙΤΙ" μπαίνει στη ροή και των δύο πόλεων.

import { readFile, writeFile } from "node:fs/promises";

const template = await readFile("templates/site.html", "utf8");

let arthra = null;
try {
  arthra = JSON.parse(await readFile("content/arthra.json", "utf8"));
} catch {
  console.log("Δεν βρέθηκαν παραγόμενα άρθρα. Το site βγαίνει με το υπάρχον template.");
  await writeFile("index.html", template);
  process.exit(0);
}

const arxi = template.indexOf("const DEDOMENA = {");
const telos = template.indexOf("function oraAthinas(){");

if (arxi === -1 || telos === -1) {
  console.error("Το template δεν έχει την αναμενόμενη δομή DEDOMENA.");
  process.exit(1);
}

const paliaDedomena = template.slice(arxi, telos);

function sourceLabel(a) {
  const name = a?.source?.name?.trim();
  return name ? `${name.startsWith("Έμπνευση:") ? "" : "Πηγή: "}${name}` : "ΤΟ ΠΙΤΟΓΥΡΟ";
}

function card(a) {
  return {
    kat: a.kat || "ΠΟΛΗ",
    titlos: a.titlos,
    keimeno: a.keimeno || "",
    soma: a.soma,
    ypografi: sourceLabel(a)
  };
}

function antikatastasi(blok, poli, local, global) {
  const nea = Array.isArray(local) ? local : [];
  const koina = Array.isArray(global) ? global : [];
  let out = blok;

  if (nea.length) {
    const kyrio = nea[0];
    const neoKyrio = `kyrio:{
      etiketa:${JSON.stringify(kyrio.kat || "ΣΗΜΕΡΑ")},
      legenda:${JSON.stringify(new Date().toLocaleDateString("el-GR"))},
      titlos:${JSON.stringify(kyrio.titlos)},
      keimeno:${JSON.stringify(kyrio.keimeno || "")},
      ypografi:${JSON.stringify(sourceLabel(kyrio))},
      soma:${JSON.stringify(kyrio.soma)}
    }`;

    const dei = new RegExp(`(${poli}:\\s*\\{[\\s\\S]*?)kyrio:\\{[\\s\\S]*?\\n    \\}`, "m");
    out = out.replace(dei, `$1${neoKyrio}`);
  }

  const ypoloipa = [...nea.slice(1), ...koina];
  if (ypoloipa.length) {
    const neaArthra = `arthra:${JSON.stringify(ypoloipa.map(card), null, 6)}`;
    const dei2 = new RegExp(`(${poli}:\\s*\\{[\\s\\S]*?)arthra:\\[[\\s\\S]*?\\n    \\]`, "m");
    out = out.replace(dei2, `$1${neaArthra}`);
  }

  return out;
}

let neaDedomena = paliaDedomena;
neaDedomena = antikatastasi(neaDedomena, "ath", arthra.ath, arthra.global);
neaDedomena = antikatastasi(neaDedomena, "thes", arthra.thes, arthra.global);

let selida = template.slice(0, arxi) + neaDedomena + template.slice(telos);

// Launch-safe mode: prototype events/τιμές/Θεσσαλονίκη παραμένουν στο template
// μόνο για μελλοντική ενεργοποίηση, αλλά δεν εμφανίζονται δημόσια μέχρι να
// τροφοδοτούνται από verified production data.
const launchSafeCss = `
<style id="launch-safe">
  #deiktis{display:none!important}
  #apopse aside{display:none!important}
  #apopse{grid-template-columns:minmax(0,1fr)!important}
  .diakoptis button[data-poli="thes"]{display:none!important}
  #roi:has(#roi-grid:empty){display:none!important}

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

const js = selida.split("<script>")[1].split("</scr" + "ipt>")[0];
try {
  new Function(js);
} catch (e) {
  console.error("Το παραγόμενο JavaScript είναι άκυρο:", e.message);
  console.error("Το site ΔΕΝ ενημερώθηκε.");
  process.exit(1);
}

await writeFile("index.html", selida);

const synolo = (arthra.ath?.length || 0) + (arthra.thes?.length || 0) + (arthra.global?.length || 0);
console.log(`index.html ενημερώθηκε με ${synolo} QA-passed άρθρα/συνταγές σε launch-safe mode.`);

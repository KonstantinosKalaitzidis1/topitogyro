// Παίρνει τα άρθρα και ξαναφτιάχνει το index.html από το template.
// Αν δεν υπάρχουν νέα άρθρα, κρατάει το template ως έχει.

import { readFile, writeFile } from "node:fs/promises";

const template = await readFile("templates/site.html", "utf8");

let arthra = null;
try {
  arthra = JSON.parse(await readFile("content/arthra.json", "utf8"));
} catch {
  console.log("Δεν βρέθηκαν νέα άρθρα. Το site βγαίνει με το υπάρχον περιεχόμενο.");
  await writeFile("index.html", template);
  process.exit(0);
}

// Απομόνωση του μπλοκ δεδομένων μέσα στο template
const arxi = template.indexOf("const DEDOMENA = {");
const telos = template.indexOf("function oraAthinas(){");

if (arxi === -1 || telos === -1) {
  console.error("Το template δεν έχει την αναμενόμενη δομή DEDOMENA.");
  process.exit(1);
}

const paliaDedomena = template.slice(arxi, telos);

// Κρατάμε τα σταθερά κομμάτια (δείκτης, εκδηλώσεις, χρώματα) και
// αντικαθιστούμε μόνο τα άρθρα.
function antikatastasi(blok, poli, nea) {
  if (!nea || !nea.length) return blok;

  const kyrio = nea[0];
  const ypoloipa = nea.slice(1);

  const neoKyrio = `kyrio:{
      etiketa:${JSON.stringify(kyrio.kat || "ΣΗΜΕΡΑ")},
      legenda:${JSON.stringify(new Date().toLocaleDateString("el-GR"))},
      titlos:${JSON.stringify(kyrio.titlos)},
      keimeno:${JSON.stringify(kyrio.keimeno || "")},
      ypografi:"Αυτόματο άρθρο · ΤΟ ΠΙΤΟΓΥΡΟ",
      soma:${JSON.stringify(kyrio.soma)}
    }`;

  const neaArthra = `arthra:${JSON.stringify(ypoloipa.map(a => ({
    kat: a.kat || "ΠΟΛΗ",
    titlos: a.titlos,
    keimeno: a.keimeno || "",
    soma: a.soma
  })), null, 6)}`;

  // αντικατάσταση μέσα στο τμήμα της συγκεκριμένης πόλης
  const dei = new RegExp(`(${poli}:\\s*\\{[\\s\\S]*?)kyrio:\\{[\\s\\S]*?\\n    \\}`, "m");
  let out = blok.replace(dei, `$1${neoKyrio}`);

  const dei2 = new RegExp(`(${poli}:\\s*\\{[\\s\\S]*?)arthra:\\[[\\s\\S]*?\\n    \\]`, "m");
  out = out.replace(dei2, `$1${neaArthra}`);

  return out;
}

let neaDedomena = paliaDedomena;
neaDedomena = antikatastasi(neaDedomena, "ath", arthra.ath);
neaDedomena = antikatastasi(neaDedomena, "thes", arthra.thes);

const selida = template.slice(0, arxi) + neaDedomena + template.slice(telos);

// Έλεγχος ότι το αποτέλεσμα είναι έγκυρο πριν γραφτεί
const js = selida.split("<script>")[1].split("</scr" + "ipt>")[0];
try {
  new Function(js);
} catch (e) {
  console.error("Το παραγόμενο JavaScript είναι άκυρο:", e.message);
  console.error("Το site ΔΕΝ ενημερώθηκε.");
  process.exit(1);
}

await writeFile("index.html", selida);

const synolo = (arthra.ath?.length || 0) + (arthra.thes?.length || 0);
console.log(`index.html ενημερώθηκε με ${synolo} άρθρα.`);

// Γράφει άρθρα στο ύφος ΠΙΤΟΓΥΡΟ πάνω στα δεδομένα των εκδηλώσεων.
// Απαιτεί ANTHROPIC_API_KEY.

import { readFile, writeFile } from "node:fs/promises";

const KLEIDI = process.env.ANTHROPIC_API_KEY;
const MONTELO = process.env.AI_MODEL || "claude-sonnet-4-6";

if (!KLEIDI) {
  console.error("Λείπει το ANTHROPIC_API_KEY. Δες το README.");
  process.exit(1);
}

const YFOS = `Γράφεις για ΤΟ ΠΙΤΟΓΥΡΟ — καθημερινή έκδοση για την πόλη, Αθήνα και Θεσσαλονίκη.
Θέματα: street food, μουσική, εκδηλώσεις, γειτονιές, νέα ανοίγματα, νυχτερινή ζωή.

ΦΩΝΗ
- Δεύτερο πρόσωπο, καζουάλ, σαν να μιλάς σε φίλο που ρώτησε τι παίζει.
- Μικρές προτάσεις. Καθόλου δημοσιογραφική επισημότητα, καθόλου δελτίο τύπου.
- Αργκό με μέτρο και μόνο όπου βγαίνει φυσικά. Ποτέ σε κάθε παράγραφο.
- Χωρίς επίθετα-γεμίσματα ("υπέροχο", "μοναδικό", "ξεχωριστό").

ΤΙ ΚΑΝΕΙ ΤΟ ΚΕΙΜΕΝΟ ΝΑ ΑΞΙΖΕΙ
Πρακτικές λεπτομέρειες που δεν λέει κανένα δελτίο τύπου:
τι να φορέσεις, πότε να έρθεις για να προλάβεις θέση, πού να σταθείς,
πού θα φας μετά, πώς θα γυρίσεις, μέχρι τι ώρα έχει μετρό.
Αναφορές σε γειτονιές, δρόμους, τοίχους, ουρές, τιμές.

ΑΠΟΛΥΤΟΙ ΚΑΝΟΝΕΣ
- Γράφεις ΜΟΝΟ πάνω στα δεδομένα που σου δίνονται (τίτλος, ώρα, χώρος, τιμή)
  και σε γενική γνώση για την πόλη.
- ΠΟΤΕ δεν παραφράζεις και δεν αναπαράγεις κείμενο τρίτου.
- ΠΟΤΕ δεν εφευρίσκεις ώρα, τιμή, διεύθυνση ή όνομα που δεν σου δόθηκε.
  Αν λείπει στοιχείο, το παραλείπεις — δεν το συμπληρώνεις.
- Καμία αρνητική κρίση για επώνυμο μαγαζί ή πρόσωπο.
- Τίποτα για εγκλήματα, ατυχήματα, πολιτική, υγεία, δικαστικές υποθέσεις.

ΜΟΡΦΗ ΑΠΑΝΤΗΣΗΣ
Μόνο JSON, χωρίς backticks, χωρίς εισαγωγικά κείμενα:
{"kat":"ΚΑΤΗΓΟΡΙΑ","titlos":"...","keimeno":"περίληψη 1-2 προτάσεις","soma":["παράγραφος","παράγραφος"]}
Το soma: 5 έως 9 παράγραφοι.
Η kat είναι μία από: ΑΠΟΨΕ, ΜΟΥΣΙΚΗ, ΦΑΓΗΤΟ, ΓΕΙΤΟΝΙΕΣ, ΝΕΟ ΑΝΟΙΓΜΑ, ΤΟΙΧΟΙ, ΝΥΧΤΑ`;

async function grapse(item, poli) {
  const poliOnoma = poli === "ath" ? "Αθήνα" : "Θεσσαλονίκη";

  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KLEIDI,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify({
      model: MONTELO,
      max_tokens: 1600,
      system: YFOS,
      messages: [{
        role: "user",
        content: `Πόλη: ${poliOnoma}
Πηγή: ${item.pigi}
Τίτλος εκδήλωσης: ${item.titlos}
Ημερομηνία: ${item.imerominia || "άγνωστη"}
Πρώτη ύλη (ΜΗΝ την αντιγράψεις, μόνο βγάλε από μέσα ώρα/τόπο/τιμή): ${item.proti_yli}

Γράψε το άρθρο.`
      }]
    })
  });

  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);

  const d = await r.json();
  const kathara = d.content
    .filter(c => c.type === "text").map(c => c.text).join("")
    .replace(/```json|```/g, "").trim();

  return JSON.parse(kathara);
}

const items = JSON.parse(await readFile("content/items.json", "utf8"));
const ORIO_ANA_POLI = Number(process.env.ORIO_ARTHRON || 4);
const exodos = {};

for (const poli of ["ath", "thes"]) {
  exodos[poli] = [];
  const lista = (items[poli] || []).slice(0, ORIO_ANA_POLI);
  console.log(`\n${poli.toUpperCase()}: ${lista.length} άρθρα προς συγγραφή`);

  for (const item of lista) {
    try {
      const a = await grapse(item, poli);
      if (!a.titlos || !Array.isArray(a.soma) || a.soma.length < 3) {
        console.log(`  ΑΠΟΡΡΙΨΗ: ελλιπές άρθρο για "${item.titlos}"`);
        continue;
      }
      exodos[poli].push(a);
      console.log(`  ✓ ${a.titlos}`);
    } catch (e) {
      console.log(`  ΣΦΑΛΜΑ "${item.titlos}": ${e.message}`);
    }
  }
}

const synolo = Object.values(exodos).reduce((a, b) => a + b.length, 0);

if (synolo === 0) {
  console.error("\nΚανένα άρθρο δεν γράφτηκε. Το site μένει ως έχει.");
  process.exit(1);
}

await writeFile("content/arthra.json", JSON.stringify(exodos, null, 2));
console.log(`\n${synolo} άρθρα → content/arthra.json`);

// Γράφει πρωτότυπα άρθρα στο ύφος ΠΙΤΟΓΥΡΟ πάνω σε facts από εγκεκριμένες πηγές.
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
- Αργκό με μέτρο και μόνο όπου βγαίνει φυσικά.
- Χωρίς επίθετα-γεμίσματα ("υπέροχο", "μοναδικό", "ξεχωριστό").

ΑΠΟΛΥΤΟΙ ΚΑΝΟΝΕΣ
- Γράφεις ΜΟΝΟ πάνω στα facts που σου δίνονται και σε ασφαλή γενική γνώση για την πόλη.
- ΠΟΤΕ δεν παραφράζεις ή αναπαράγεις κείμενο τρίτου.
- ΠΟΤΕ δεν εφευρίσκεις ώρα, τιμή, διεύθυνση, όνομα, δρομολόγιο ή άλλη πρακτική λεπτομέρεια.
- Αν λείπει στοιχείο, το παραλείπεις.
- Καμία αρνητική κρίση για επώνυμο μαγαζί ή πρόσωπο.
- Τίποτα για εγκλήματα, ατυχήματα, πολιτική, υγεία, δικαστικές υποθέσεις.
- Μη γράφεις ότι "πήγαμε", "δοκιμάσαμε", "μιλήσαμε" ή ότι έχει γίνει επιτόπιο ρεπορτάζ αν δεν σου δίνεται τέτοιο fact.

ΜΟΡΦΗ ΑΠΑΝΤΗΣΗΣ
Μόνο JSON, χωρίς backticks:
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
URL πηγής: ${item.source_item_url || item.pigi_url || ""}
Τίτλος: ${item.titlos}
Ημερομηνία: ${item.imerominia || "άγνωστη"}
Πρώτη ύλη (μόνο για facts, ΜΗΝ την αντιγράψεις): ${item.proti_yli}

Γράψε πρωτότυπο άρθρο.`
      }]
    })
  });

  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  const d = await r.json();
  const kathara = d.content.filter(c => c.type === "text").map(c => c.text).join("").replace(/```json|```/g, "").trim();
  return JSON.parse(kathara);
}

async function diavaseJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

const items = JSON.parse(await readFile("content/items.json", "utf8"));
const ORIO_ANA_POLI = Number(process.env.ORIO_ARTHRON || 4);
const exodos = { ath: [], thes: [] };
const publishedNow = [];

for (const poli of ["ath", "thes"]) {
  const lista = (items[poli] || []).slice(0, ORIO_ANA_POLI);
  console.log(`\n${poli.toUpperCase()}: ${lista.length} άρθρα προς συγγραφή`);

  for (const item of lista) {
    try {
      const a = await grapse(item, poli);
      if (!a.titlos || !Array.isArray(a.soma) || a.soma.length < 3) {
        console.log(`  ΑΠΟΡΡΙΨΗ: ελλιπές άρθρο για "${item.titlos}"`);
        continue;
      }

      a.source = {
        name: item.pigi,
        url: item.source_item_url || item.pigi_url || "",
        source_id: item.id
      };
      a.generated_at = new Date().toISOString();
      exodos[poli].push(a);
      if (item.id) publishedNow.push(item.id);
      console.log(`  ✓ ${a.titlos}`);
    } catch (e) {
      console.log(`  ΣΦΑΛΜΑ "${item.titlos}": ${e.message}`);
    }
  }
}

const synolo = exodos.ath.length + exodos.thes.length;
if (synolo === 0) {
  console.error("\nΚανένα άρθρο δεν γράφτηκε. Το site μένει ως έχει.");
  process.exit(1);
}

await writeFile("content/arthra.json", JSON.stringify(exodos, null, 2));

const history = await diavaseJson("content/history.json", { published_ids: [] });
const deduped = [...new Set([...(history.published_ids || []), ...publishedNow])].slice(-2000);
await writeFile("content/history.json", JSON.stringify({ published_ids: deduped, updated_at: new Date().toISOString() }, null, 2));

console.log(`\n${synolo} άρθρα → content/arthra.json`);

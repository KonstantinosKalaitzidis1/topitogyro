// Γράφει πρωτότυπα άρθρα στο ύφος ΠΙΤΟΓΥΡΟ πάνω αποκλειστικά σε facts από εγκεκριμένες πηγές.
// Απαιτεί ANTHROPIC_API_KEY.

import { readFile, writeFile } from "node:fs/promises";

const KLEIDI = process.env.ANTHROPIC_API_KEY;
// Φθηνότερο default για καθημερινή αυτοματοποίηση. Μπορεί να αλλάξει από GitHub variable AI_MODEL.
const MONTELO = process.env.AI_MODEL || "claude-haiku-4-5-20251001";

if (!KLEIDI) {
  console.error("Λείπει το ANTHROPIC_API_KEY. Δες το README.");
  process.exit(1);
}

const YFOS = `Γράφεις για ΤΟ ΠΙΤΟΓΥΡΟ — καθημερινό urban μέσο για Αθήνα και Θεσσαλονίκη.
Θέματα: street food, junk food, burgers, smashed burgers, σουβλάκι, πίτσα, fried chicken, hot dog, tacos, kebab, late-night spots, νέα μαγαζιά και openings, pop-ups, μουσική, εκδηλώσεις, γειτονιές, street culture και νυχτερινή ζωή.

ΦΩΝΗ
- Δεύτερο πρόσωπο, καζουάλ, σαν να μιλάς σε φίλο που ρώτησε τι παίζει.
- Μικρές προτάσεις. Καθόλου δελτίο τύπου και καθόλου δήθεν γκουρμέ ύφος.
- Αργκό με μέτρο και μόνο όπου βγαίνει φυσικά.
- Χωρίς επίθετα-γεμίσματα ("υπέροχο", "μοναδικό", "ξεχωριστό").
- Για νέο μαγαζί ή street food γράφεις καθαρά τι άνοιξε/έρχεται και τι ακριβώς είναι, μόνο αν αυτά υπάρχουν στα facts.

ΑΠΟΛΥΤΟΙ ΚΑΝΟΝΕΣ
- Χρησιμοποιείς ΜΟΝΟ τα facts που δίνονται στο συγκεκριμένο input. ΟΧΙ γενική γνώση, μνήμη ή υποθέσεις.
- ΠΟΤΕ δεν παραφράζεις ή αναπαράγεις κείμενο τρίτου. Γράφεις νέο κείμενο βασισμένο στα επιβεβαιωμένα facts.
- ΠΟΤΕ δεν εφευρίσκεις ώρα, τιμή, διεύθυνση, γειτονιά, menu item, όνομα, ημερομηνία, δρομολόγιο, opening date ή άλλη πρακτική λεπτομέρεια.
- Αν λείπει στοιχείο, το παραλείπεις. Δεν το συμπληρώνεις.
- Αν τα facts δεν αρκούν για τουλάχιστον 3 ουσιαστικές μικρές παραγράφους, επέστρεψε {"publish":false,"reason":"insufficient_facts"}.
- Αν το θέμα αφορά πολιτική, εκλογές, εγκλήματα, σοβαρά ατυχήματα, υγεία, δικαστικές/νομικές καταγγελίες ή προσωπικά δεδομένα, επέστρεψε {"publish":false,"reason":"sensitive_topic"}.
- Καμία αρνητική κρίση ή μη τεκμηριωμένος ισχυρισμός για επώνυμο μαγαζί ή πρόσωπο.
- Μη γράφεις ότι "πήγαμε", "δοκιμάσαμε", "μιλήσαμε" ή ότι έγινε επιτόπιο ρεπορτάζ αν δεν δίνεται τέτοιο fact.

ΜΟΡΦΗ ΑΠΑΝΤΗΣΗΣ
Μόνο JSON, χωρίς backticks.
Για δημοσιεύσιμο θέμα:
{"publish":true,"kat":"ΚΑΤΗΓΟΡΙΑ","titlos":"...","keimeno":"περίληψη 1-2 προτάσεις","soma":["παράγραφος","παράγραφος","παράγραφος"]}
Το soma: 3 έως 6 σύντομες παραγράφους.
Η kat είναι μία από: ΝΕΑ ΑΦΙΞΗ, STREET FOOD, ΦΑΓΗΤΟ, ΑΠΟΨΕ, ΜΟΥΣΙΚΗ, ΓΕΙΤΟΝΙΕΣ, ΤΟΙΧΟΙ, ΝΥΧΤΑ, ΠΟΛΗ.`;

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
      max_tokens: 900,
      system: YFOS,
      messages: [{
        role: "user",
        content: `Πόλη: ${poliOnoma}\nΠηγή: ${item.pigi}\nURL πηγής: ${item.source_item_url || item.pigi_url || ""}\nΤίτλος: ${item.titlos}\nΗμερομηνία: ${item.imerominia || "άγνωστη"}\nΠρώτη ύλη (μόνο για facts, ΜΗΝ την αντιγράψεις): ${item.proti_yli}\n\nΑξιολόγησε αν είναι ασφαλές και αρκετά τεκμηριωμένο για δημοσίευση. Αν ναι, γράψε πρωτότυπο άρθρο.`
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
// Χαμηλό default για κόστος. Αλλάζει με GitHub variable ORIO_ARTHRON.
const ORIO_ANA_POLI = Number(process.env.ORIO_ARTHRON || 2);
const exodos = { ath: [], thes: [] };
const publishedNow = [];

for (const poli of ["ath", "thes"]) {
  const lista = (items[poli] || []).slice(0, ORIO_ANA_POLI);
  console.log(`\n${poli.toUpperCase()}: ${lista.length} στοιχεία προς αξιολόγηση/συγγραφή`);

  for (const item of lista) {
    try {
      const a = await grapse(item, poli);

      if (a.publish === false) {
        console.log(`  SKIP: ${a.reason || "not_publishable"} — "${item.titlos}"`);
        continue;
      }

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

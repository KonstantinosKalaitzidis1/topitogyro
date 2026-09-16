// Γράφει πρωτότυπα άρθρα στο ύφος ΠΙΤΟΓΥΡΟ πάνω αποκλειστικά σε facts από εγκεκριμένες πηγές.
// Απαιτεί ANTHROPIC_API_KEY.

import { readFile, writeFile } from "node:fs/promises";

const KLEIDI = process.env.ANTHROPIC_API_KEY;
const MONTELO = process.env.AI_MODEL || "claude-haiku-4-5-20251001";

if (!KLEIDI) {
  console.error("Λείπει το ANTHROPIC_API_KEY. Δες το README.");
  process.exit(1);
}

const YFOS = `Γράφεις για ΤΟ ΠΙΤΟΓΥΡΟ — καθημερινό urban μέσο για Αθήνα και Θεσσαλονίκη.
Θέματα: street food, junk food, burgers, smashed burgers, σουβλάκι, πίτσα, fried chicken, hot dog, tacos, kebab, late-night spots, νέα μαγαζιά και openings, pop-ups, μουσική, εκδηλώσεις, γειτονιές, street culture και νυχτερινή ζωή.

ΦΩΝΗ
- Καζουάλ, άμεση, καθαρή ελληνική γλώσσα. Μικρές προτάσεις.
- Καθόλου δελτίο τύπου και καθόλου δήθεν γκουρμέ ύφος.
- Αργκό μόνο αν είναι απολύτως φυσική και σαφής. Αν υπάρχει αμφιβολία, μην τη χρησιμοποιείς.
- Χωρίς επίθετα-γεμίσματα και χωρίς hype.
- Για νέο μαγαζί ή street food λες καθαρά τι είναι και τι επιβεβαιωμένα γνωρίζουμε.

ΑΠΟΛΥΤΟΙ ΚΑΝΟΝΕΣ
- Χρησιμοποιείς ΜΟΝΟ τα facts που δίνονται στο συγκεκριμένο input. ΟΧΙ γενική γνώση, μνήμη ή υποθέσεις.
- ΠΟΤΕ δεν παραφράζεις ή αναπαράγεις κείμενο τρίτου. Γράφεις νέο κείμενο βασισμένο στα επιβεβαιωμένα facts.
- ΠΟΤΕ δεν εφευρίσκεις ώρα, τιμή, διεύθυνση, γειτονιά, menu item, όνομα, ημερομηνία, δρομολόγιο, opening date ή άλλη πρακτική λεπτομέρεια.
- ΠΟΤΕ δεν προσθέτεις αξιολογική κρίση, θετική ή αρνητική, αν δεν δίνεται ως fact.
- ΠΟΤΕ δεν συμπεραίνεις ότι κάτι λείπει από το menu ή το concept αν δεν δίνεται ρητά.
- ΠΟΤΕ δεν χαρακτηρίζεις μια περιοχή ως «κέντρο», «γειτονιά», «πιάτσα» κ.λπ. αν αυτό δεν δίνεται ρητά στα facts. Χρησιμοποίησε μόνο την ακριβή τοποθεσία που δίνεται.
- ΠΟΤΕ δεν γράφεις «περισσότερες λεπτομέρειες θα ανακοινωθούν», «αναμένονται πληροφορίες» ή άλλη εικασία για άγνωστα μελλοντικά στοιχεία.
- Πρόσεχε τον χρόνο: αν το input λέει ότι ένα μαγαζί λειτουργεί ήδη επί μήνες, ΜΗ γράψεις ότι «ανοίγει τώρα» ή «ανοίγει τις πόρτες του».
- Αν λείπει στοιχείο, το παραλείπεις. Δεν το συμπληρώνεις.
- Κάθε πρόταση πρέπει να μπορεί να στηριχθεί άμεσα σε fact του input. Αν μια πρόταση υπάρχει μόνο για ύφος/εντύπωση, κόψ' την.
- Αν τα facts δεν αρκούν για τουλάχιστον 3 ουσιαστικές μικρές παραγράφους, επέστρεψε {"publish":false,"reason":"insufficient_facts"}.
- Αν το θέμα αφορά πολιτική, εκλογές, εγκλήματα, σοβαρά ατυχήματα, υγεία, δικαστικές/νομικές καταγγελίες ή προσωπικά δεδομένα, επέστρεψε {"publish":false,"reason":"sensitive_topic"}.
- Μη γράφεις ότι «πήγαμε», «δοκιμάσαμε», «μιλήσαμε» ή ότι έγινε επιτόπιο ρεπορτάζ αν δεν δίνεται τέτοιο fact.
- Το κείμενο πρέπει να είναι γραμματικά σωστό, φυσικό και κατανοητό. Καμία ακατανόητη αργκό ή κομμένη φράση.

ΜΟΡΦΗ ΑΠΑΝΤΗΣΗΣ
Απάντησε με ΕΝΑ πλήρες και έγκυρο JSON object, χωρίς backticks και χωρίς κείμενο πριν ή μετά.
Για δημοσιεύσιμο θέμα:
{"publish":true,"kat":"ΚΑΤΗΓΟΡΙΑ","titlos":"...","keimeno":"περίληψη 1-2 προτάσεις","soma":["παράγραφος","παράγραφος","παράγραφος"]}
Το soma: 3 έως 5 σύντομες παραγράφους.
Η kat είναι μία από: ΝΕΑ ΑΦΙΞΗ, STREET FOOD, ΦΑΓΗΤΟ, ΑΠΟΨΕ, ΜΟΥΣΙΚΗ, ΓΕΙΤΟΝΙΕΣ, ΤΟΙΧΟΙ, ΝΥΧΤΑ, ΠΟΛΗ.`;

const QA = `Είσαι αυστηρός fact-checker και copy editor για αυτόματο urban site.
Ελέγχεις ένα draft ΜΟΝΟ απέναντι στα facts που σου δίνονται.
Απόρριψε το draft αν:
- περιέχει οποιαδήποτε πληροφορία, αξιολογική κρίση, σύσταση ή συμπέρασμα που δεν στηρίζεται άμεσα στα facts,
- αλλάζει χρονικά το νόημα,
- περιέχει ακατανόητη/λανθασμένη φράση,
- παρουσιάζει εμπειρία ή γνώμη σαν να προέρχεται από το μέσο,
- αντιγράφει εμφανώς φράση της πρώτης ύλης.
Απάντησε μόνο με ΕΝΑ πλήρες έγκυρο JSON object: {"ok":true,"reason":""} ή {"ok":false,"reason":"σύντομη σαφής αιτία"}.`;

function parseJson(text) {
  const clean = String(text || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const first = clean.indexOf("{");
  const last = clean.lastIndexOf("}");
  if (first === -1 || last <= first) return null;
  try { return JSON.parse(clean.slice(first, last + 1)); }
  catch { return null; }
}

async function anthropicRaw(body) {
  const r = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": KLEIDI,
      "anthropic-version": "2023-06-01"
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`API ${r.status}: ${await r.text()}`);
  const d = await r.json();
  return {
    text: (d.content || []).filter(c => c.type === "text").map(c => c.text).join("").trim(),
    stopReason: d.stop_reason || ""
  };
}

async function anthropic(body) {
  let raw = await anthropicRaw(body);
  let parsed = parseJson(raw.text);
  if (parsed) return parsed;

  console.log(`  JSON RETRY: μη έγκυρο JSON${raw.stopReason ? ` (stop_reason=${raw.stopReason})` : ""}`);
  raw = await anthropicRaw({
    ...body,
    max_tokens: Math.max(Number(body.max_tokens || 0), 1400),
    system: `${body.system}\n\nΚΡΙΣΙΜΟ: Η προηγούμενη απάντηση δεν ήταν parseable JSON. Ολοκλήρωσε ολόκληρο το JSON object, κλείσε όλα τα strings/arrays/braces και μην γράψεις τίποτα εκτός JSON.`
  });
  parsed = parseJson(raw.text);
  if (!parsed) throw new Error(`Μη έγκυρο JSON μετά από retry${raw.stopReason ? ` (stop_reason=${raw.stopReason})` : ""}`);
  return parsed;
}

async function grapse(item, poli, feedback = "") {
  const poliOnoma = poli === "ath" ? "Αθήνα" : "Θεσσαλονίκη";
  return anthropic({
    model: MONTELO,
    max_tokens: 1200,
    temperature: 0.1,
    system: YFOS,
    messages: [{
      role: "user",
      content: `Πόλη: ${poliOnoma}\nΠηγή: ${item.pigi}\nURL πηγής: ${item.source_item_url || item.pigi_url || ""}\nΤίτλος αναφοράς: ${item.titlos}\nΗμερομηνία: ${item.imerominia || "άγνωστη"}\nΠρώτη ύλη (μόνο για facts, ΜΗΝ την αντιγράψεις): ${item.proti_yli}${feedback ? `\n\nΥΠΟΧΡΕΩΤΙΚΗ ΔΙΟΡΘΩΣΗ: Το προηγούμενο draft απορρίφθηκε για: ${feedback}. Στο νέο draft αφαίρεσε πλήρως το συγκεκριμένο πρόβλημα και μην το αντικαταστήσεις με άλλη υπόθεση.` : ""}\n\nΑξιολόγησε αν είναι ασφαλές και αρκετά τεκμηριωμένο για δημοσίευση. Αν ναι, γράψε πρωτότυπο άρθρο.`
    }]
  });
}

async function elegxos(item, a) {
  return anthropic({
    model: MONTELO,
    max_tokens: 260,
    temperature: 0,
    system: QA,
    messages: [{
      role: "user",
      content: `FACTS:\n${item.proti_yli}\n\nDRAFT:\n${JSON.stringify({titlos:a.titlos, keimeno:a.keimeno, soma:a.soma})}`
    }]
  });
}

async function diavaseJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

const items = JSON.parse(await readFile("content/items.json", "utf8"));
const ORIO_ANA_POLI = Number(process.env.ORIO_ARTHRON || 2);
const exodos = { ath: [], thes: [] };
const publishedNow = [];

for (const poli of ["ath", "thes"]) {
  const lista = (items[poli] || []).slice(0, ORIO_ANA_POLI);
  console.log(`\n${poli.toUpperCase()}: ${lista.length} στοιχεία προς αξιολόγηση/συγγραφή`);

  for (const item of lista) {
    try {
      let a = await grapse(item, poli);
      let passed = false;

      for (let attempt = 0; attempt < 3; attempt++) {
        if (a.publish === false) {
          console.log(`  SKIP: ${a.reason || "not_publishable"} — "${item.titlos}"`);
          break;
        }
        if (!a.titlos || !Array.isArray(a.soma) || a.soma.length < 3) {
          console.log(`  ΑΠΟΡΡΙΨΗ: ελλιπές άρθρο για "${item.titlos}"`);
          break;
        }

        const qa = await elegxos(item, a);
        if (qa.ok) {
          passed = true;
          break;
        }

        if (attempt === 2) {
          console.log(`  QA ΑΠΟΡΡΙΨΗ μετά από 3 drafts: ${qa.reason || "failed"} — "${item.titlos}"`);
          break;
        }

        console.log(`  QA RETRY ${attempt + 1}: ${qa.reason || "failed"}`);
        a = await grapse(item, poli, qa.reason || "unsupported or unclear content");
      }

      if (!passed) continue;

      a.source = {
        name: item.pigi,
        url: item.source_item_url || item.pigi_url || "",
        source_id: item.id
      };
      a.generated_at = new Date().toISOString();
      exodos[poli].push(a);
      if (item.id) publishedNow.push(item.id);
      console.log(`  ✓ QA PASS: ${a.titlos}`);
    } catch (e) {
      console.log(`  ΣΦΑΛΜΑ "${item.titlos}": ${e.message}`);
    }
  }
}

const synolo = exodos.ath.length + exodos.thes.length;
if (synolo === 0) {
  console.error("\nΚανένα άρθρο δεν πέρασε το QA. Το site μένει ως έχει.");
  process.exit(1);
}

await writeFile("content/arthra.json", JSON.stringify(exodos, null, 2));

const history = await diavaseJson("content/history.json", { published_ids: [] });
const deduped = [...new Set([...(history.published_ids || []), ...publishedNow])].slice(-2000);
await writeFile("content/history.json", JSON.stringify({ published_ids: deduped, updated_at: new Date().toISOString() }, null, 2));

console.log(`\n${synolo} άρθρα πέρασαν QA → content/arthra.json`);

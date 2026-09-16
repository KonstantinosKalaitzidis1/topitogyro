// Γράφει πρωτότυπα άρθρα ΠΙΤΟΓΥΡΟ.
// City stories: μόνο verified facts.
// Global "ΒΡΩΜΙΑ ΣΠΙΤΙ": τρίτο άρθρο = έμπνευση μόνο, και παράγεται εντελώς πρωτότυπη συνταγή.

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
- Αργκό μόνο αν είναι απολύτως φυσική και σαφής.
- Χωρίς hype και χωρίς δήθεν γευστικές κρίσεις που δεν έχουμε δοκιμάσει.
- Για νέο μαγαζί ή street food λες καθαρά τι είναι και τι επιβεβαιωμένα γνωρίζουμε.
- Επιτρέπεται ΕΝΑ σύντομο editorial κλείσιμο τύπου «αν θες να φας κάτι διαφορετικό / να ξεφύγεις από τα συνηθισμένα, βάλε το στη λίστα», μόνο όταν προκύπτει λογικά από τα verified facts. Δεν λες ότι είναι νόστιμο, καλύτερο, αυθεντικό ή «αξίζει» αν δεν υπάρχει τέτοια τεκμηρίωση.

ΑΠΟΛΥΤΟΙ ΚΑΝΟΝΕΣ
- Χρησιμοποιείς ΜΟΝΟ τα facts που δίνονται στο συγκεκριμένο input. ΟΧΙ γενική γνώση, μνήμη ή υποθέσεις.
- ΠΟΤΕ δεν παραφράζεις ή αναπαράγεις κείμενο τρίτου. Γράφεις νέο κείμενο βασισμένο στα επιβεβαιωμένα facts.
- ΠΟΤΕ δεν εφευρίσκεις ώρα, τιμή, διεύθυνση, γειτονιά, menu item, όνομα, ημερομηνία, δρομολόγιο, opening date ή άλλη πρακτική λεπτομέρεια.
- ΠΟΤΕ δεν προσθέτεις γευστική/ποιοτική κρίση αν δεν δίνεται ως fact.
- ΠΟΤΕ δεν συμπεραίνεις ότι κάτι λείπει από το menu ή το concept αν δεν δίνεται ρητά.
- ΠΟΤΕ δεν χαρακτηρίζεις μια περιοχή ως «κέντρο», «γειτονιά», «πιάτσα» κ.λπ. αν αυτό δεν δίνεται ρητά στα facts.
- ΠΟΤΕ δεν γράφεις «περισσότερες λεπτομέρειες θα ανακοινωθούν» ή άλλη εικασία.
- Πρόσεχε τον χρόνο: αν ένα μαγαζί λειτουργεί ήδη, ΜΗ γράψεις ότι «ανοίγει τώρα».
- Αν λείπει στοιχείο, το παραλείπεις.
- Κάθε factual πρόταση πρέπει να στηρίζεται άμεσα σε fact του input.
- Αν τα facts δεν αρκούν για τουλάχιστον 3 ουσιαστικές μικρές παραγράφους, επέστρεψε {"publish":false,"reason":"insufficient_facts"}.
- Αν το θέμα αφορά πολιτική, εκλογές, εγκλήματα, σοβαρά ατυχήματα, υγεία, δικαστικές/νομικές καταγγελίες ή προσωπικά δεδομένα, επέστρεψε {"publish":false,"reason":"sensitive_topic"}.
- Μη γράφεις ότι «πήγαμε», «δοκιμάσαμε», «μιλήσαμε» ή ότι έγινε επιτόπιο ρεπορτάζ αν δεν δίνεται τέτοιο fact.
- Το κείμενο πρέπει να είναι γραμματικά σωστό, φυσικό και κατανοητό.

ΜΟΡΦΗ ΑΠΑΝΤΗΣΗΣ
Απάντησε με ΕΝΑ πλήρες και έγκυρο JSON object, χωρίς backticks και χωρίς κείμενο πριν ή μετά.
Για δημοσιεύσιμο θέμα:
{"publish":true,"kat":"ΚΑΤΗΓΟΡΙΑ","titlos":"...","keimeno":"περίληψη 1-2 προτάσεις","soma":["παράγραφος","παράγραφος","παράγραφος"]}
Το soma: 3 έως 5 σύντομες παραγράφους.
Η kat είναι μία από: ΝΕΑ ΑΦΙΞΗ, STREET FOOD, ΦΑΓΗΤΟ, ΑΠΟΨΕ, ΜΟΥΣΙΚΗ, ΓΕΙΤΟΝΙΕΣ, ΤΟΙΧΟΙ, ΝΥΧΤΑ, ΠΟΛΗ.`;

const QA = `Είσαι αυστηρός fact-checker και copy editor για αυτόματο urban site.
Ελέγχεις ένα draft ΜΟΝΟ απέναντι στα facts που σου δίνονται.
Επιτρέπεται μόνο ένα σύντομο conditional editorial κλείσιμο («αν θες κάτι διαφορετικό…») που δεν κάνει γευστική/ποιοτική δήλωση και δεν προσθέτει νέο fact.
Απόρριψε το draft αν:
- περιέχει factual πληροφορία, γευστική/ποιοτική κρίση ή συμπέρασμα που δεν στηρίζεται άμεσα στα facts,
- αλλάζει χρονικά το νόημα,
- περιέχει ακατανόητη/λανθασμένη φράση,
- παρουσιάζει εμπειρία σαν να προέρχεται από το μέσο,
- αντιγράφει εμφανώς φράση της πρώτης ύλης.
Απάντησε μόνο με ΕΝΑ πλήρες έγκυρο JSON object: {"ok":true,"reason":""} ή {"ok":false,"reason":"σύντομη σαφής αιτία"}.`;

const RECIPE_STYLE = `Γράφεις για ΤΟ ΠΙΤΟΓΥΡΟ, στη στήλη «ΒΡΩΜΙΑ ΣΠΙΤΙ».
Σου δίνεται τίτλος/σύντομο snippet από ξένη food πηγή ΜΟΝΟ ως αφορμή/έμπνευση.

ΣΤΟΧΟΣ
Φτιάχνεις εντελώς πρωτότυπη, πρακτική, «βρώμικη» συνταγή για σπίτι: sauces, dips, loaded fries, burgers, sandwiches, fried chicken, tacos, wraps, hot dogs, nachos, wings και παρόμοια.

ΚΑΝΟΝΕΣ ΠΝΕΥΜΑΤΙΚΗΣ ΙΔΙΟΚΤΗΣΙΑΣ
- ΜΗΝ μεταφράζεις, ανακατασκευάζεις ή παραφράζεις τη συνταγή της πηγής.
- ΜΗΝ παρουσιάζεις ποσότητες, βήματα ή μυστικά ως προερχόμενα από την πηγή.
- Χρησιμοποίησε μόνο τη γενική ιδέα/τάση του τίτλου ως inspiration και δημιούργησε δική σου εκδοχή.
- ΜΗΝ αντιγράφεις φράσεις του snippet.
- Η πηγή θα εμφανίζεται ξεχωριστά ως «Έμπνευση: …».

ΥΦΟΣ
- Ελληνικά, άμεσο, urban, λίγο βρώμικο αλλά καθαρό.
- Όχι chef-talk. Να μπορεί να το κάνει κάποιος σπίτι χωρίς ειδικό εξοπλισμό.
- Δώσε σαφείς ποσότητες για 2-4 άτομα, εύκολα υλικά, και σύντομα βήματα.
- Επιτρέπεται playful κλείσιμο τύπου «βάλε χαρτοπετσέτες κοντά».
- Μην ισχυρίζεσαι ότι το δοκιμάσαμε ή ότι είναι «το καλύτερο».

ΑΣΦΑΛΕΙΑ
- Καμία επικίνδυνη τεχνική.
- Για ωμό κρέας/κοτόπουλο δώσε ασφαλή, συμβατική οδηγία πλήρους ψησίματος χωρίς ακραίες/επισφαλείς πρακτικές.
- Μην προτείνεις κατανάλωση ωμών αυγών ή μη παστεριωμένων επικίνδυνων υλικών.

ΜΟΡΦΗ
Απάντησε μόνο με ΕΝΑ πλήρες JSON:
{"publish":true,"kat":"ΒΡΩΜΙΑ ΣΠΙΤΙ","titlos":"...","keimeno":"1-2 προτάσεις","soma":["Τι θα χρειαστείς: ...","Πώς το κάνεις: ...","...","..."]}
Το soma έχει 4 έως 6 σύντομες παραγράφους.`;

const RECIPE_QA = `Είσαι QA editor για τη στήλη «ΒΡΩΜΙΑ ΣΠΙΤΙ».
Το SOURCE είναι μόνο έμπνευση. Το draft ΠΡΕΠΕΙ να είναι νέα, πρωτότυπη συνταγή και όχι μετάφραση/ανακατασκευή της πηγής.
Απόρριψε αν:
- ισχυρίζεται ότι η πηγή έδωσε συγκεκριμένες ποσότητες/βήματα,
- αντιγράφει ή μεταφράζει εμφανώς wording του source snippet,
- λέει ότι «δοκιμάσαμε» ή κάνει ψεύτικη εμπειρική κρίση,
- δεν έχει σαφείς ποσότητες ή πρακτικά βήματα,
- περιέχει προφανώς επισφαλή food-safety οδηγία,
- δεν ταιριάζει σε sauces/street/junk/comfort/home dirty food.
Απάντησε μόνο: {"ok":true,"reason":""} ή {"ok":false,"reason":"σύντομη αιτία"}.`;

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
    max_tokens: Math.max(Number(body.max_tokens || 0), 1500),
    system: `${body.system}\n\nΚΡΙΣΙΜΟ: Η προηγούμενη απάντηση δεν ήταν parseable JSON. Ολοκλήρωσε ολόκληρο το JSON object και μην γράψεις τίποτα εκτός JSON.`
  });
  parsed = parseJson(raw.text);
  if (!parsed) throw new Error(`Μη έγκυρο JSON μετά από retry${raw.stopReason ? ` (stop_reason=${raw.stopReason})` : ""}`);
  return parsed;
}

async function grapse(item, poli, feedback = "") {
  const recipe = item.content_mode === "recipe_inspiration";

  if (recipe) {
    return anthropic({
      model: MONTELO,
      max_tokens: 1400,
      temperature: 0.45,
      system: RECIPE_STYLE,
      messages: [{
        role: "user",
        content: `Πηγή έμπνευσης: ${item.pigi}\nURL: ${item.source_item_url || item.pigi_url || ""}\nΤίτλος/ιδέα: ${item.titlos}\nΣύντομο snippet μόνο για να καταλάβεις το θέμα — ΜΗΝ το αντιγράψεις: ${item.proti_yli}${feedback ? `\n\nΔΙΟΡΘΩΣΗ QA: ${feedback}. Ξαναγράψε από την αρχή με νέα διατύπωση/εκτέλεση.` : ""}\n\nΦτιάξε πρωτότυπη ΠΙΤΟΓΥΡΟ «ΒΡΩΜΙΑ ΣΠΙΤΙ» συνταγή εμπνευσμένη μόνο από τη γενική ιδέα.`
      }]
    });
  }

  const poliOnoma = poli === "ath" ? "Αθήνα" : "Θεσσαλονίκη";
  return anthropic({
    model: MONTELO,
    max_tokens: 1300,
    temperature: 0.15,
    system: YFOS,
    messages: [{
      role: "user",
      content: `Πόλη: ${poliOnoma}\nΠηγή: ${item.pigi}\nURL πηγής: ${item.source_item_url || item.pigi_url || ""}\nΤίτλος αναφοράς: ${item.titlos}\nΗμερομηνία: ${item.imerominia || "άγνωστη"}\nΠρώτη ύλη (μόνο για facts, ΜΗΝ την αντιγράψεις): ${item.proti_yli}${feedback ? `\n\nΥΠΟΧΡΕΩΤΙΚΗ ΔΙΟΡΘΩΣΗ: Το προηγούμενο draft απορρίφθηκε για: ${feedback}. Αφαίρεσε πλήρως το πρόβλημα.` : ""}\n\nΑξιολόγησε αν είναι ασφαλές και αρκετά τεκμηριωμένο για δημοσίευση. Αν ναι, γράψε πρωτότυπο άρθρο με λίγο περισσότερη ανάπτυξη και ένα σύντομο conditional «γιατί να πας» στο τέλος, χωρίς να εφεύρεις γεύση ή ποιότητα.`
    }]
  });
}

async function elegxos(item, a) {
  const recipe = item.content_mode === "recipe_inspiration";

  return anthropic({
    model: MONTELO,
    max_tokens: 320,
    temperature: 0,
    system: recipe ? RECIPE_QA : QA,
    messages: [{
      role: "user",
      content: recipe
        ? `SOURCE IDEA:\n${item.titlos}\n${item.proti_yli}\n\nDRAFT:\n${JSON.stringify({titlos:a.titlos, keimeno:a.keimeno, soma:a.soma})}`
        : `FACTS:\n${item.proti_yli}\n\nDRAFT:\n${JSON.stringify({titlos:a.titlos, keimeno:a.keimeno, soma:a.soma})}`
    }]
  });
}

async function diavaseJson(path, fallback) {
  try { return JSON.parse(await readFile(path, "utf8")); }
  catch { return fallback; }
}

const items = JSON.parse(await readFile("content/items.json", "utf8"));
const ORIO_ANA_POLI = Number(process.env.ORIO_ARTHRON || 2);
const ORIO_GLOBAL = Number(process.env.ORIO_GLOBAL || 1);
const exodos = { ath: [], thes: [], global: [] };
const publishedNow = [];

for (const poli of ["ath", "thes", "global"]) {
  const orio = poli === "global" ? ORIO_GLOBAL : ORIO_ANA_POLI;
  const lista = (items[poli] || []).slice(0, orio);
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

        const minParas = item.content_mode === "recipe_inspiration" ? 4 : 3;
        if (!a.titlos || !Array.isArray(a.soma) || a.soma.length < minParas) {
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
        name: item.content_mode === "recipe_inspiration" ? `Έμπνευση: ${item.pigi}` : item.pigi,
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

const synolo = exodos.ath.length + exodos.thes.length + exodos.global.length;
if (synolo === 0) {
  console.error("\nΚανένα άρθρο δεν πέρασε το QA. Το site μένει ως έχει.");
  process.exit(1);
}

await writeFile("content/arthra.json", JSON.stringify(exodos, null, 2));

const history = await diavaseJson("content/history.json", { published_ids: [] });
const deduped = [...new Set([...(history.published_ids || []), ...publishedNow])].slice(-2000);
await writeFile("content/history.json", JSON.stringify({ published_ids: deduped, updated_at: new Date().toISOString() }, null, 2));

console.log(`\n${synolo} άρθρα πέρασαν QA → content/arthra.json`);

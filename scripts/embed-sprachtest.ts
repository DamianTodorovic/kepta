// Liegt es an der Sprache? Dieselben vier Dokumente und Fragen, einmal deutsch,
// einmal englisch. Wenn Englisch trifft und Deutsch nicht, ist das Modell die
// Ursache — und die Zusage "findet, was anders formuliert ist" gilt fuer
// deutsche Notizen mit dem Standardmodell nicht.
import { embedTexts, embedQuery, cosineSimilarity } from "../src/core/embeddings";

async function durchlauf(name: string, dok: [string, string][], fragen: [string, string][]) {
  const res = await embedTexts(dok.map(([, x]) => x));
  let richtig = 0;
  const zeilen: string[] = [];
  for (const [frage, ziel] of fragen) {
    const qv = await embedQuery(frage);
    if (!qv) continue;
    const rang = dok.map(([l], i) => [l, cosineSimilarity(qv, res.embeddings[i]!)] as [string, number]).sort((a, b) => b[1] - a[1]);
    if (rang[0]![0] === ziel) richtig++;
    zeilen.push(`     ${rang[0]![0] === ziel ? "richtig" : "FALSCH "}  ${frage.slice(0, 40).padEnd(40)} -> ${rang[0]![0]}`);
  }
  console.log(`\n  ${name}: ${richtig}/${fragen.length}`);
  zeilen.forEach((z) => console.log(z));
  return richtig;
}

async function main() {
  const de = await durchlauf("Deutsch", [
    ["Carbonara", "Spaghetti Carbonara: Guanciale, Pecorino Romano, Eigelb, schwarzer Pfeffer."],
    ["Bitwarden", "Bitwarden Vault, Master-Passwort mit 2FA via Yubikey."],
    ["Ruecken", "Physiotherapie zweimal woechentlich, Uebungen fuer den unteren Ruecken."],
    ["Reifen", "Winterbereifung ab Oktober, Sommersatz eingelagert bei der Werkstatt."],
  ], [
    ["Was koche ich mit Nudeln?", "Carbonara"],
    ["Wie bewahre ich meine Zugangsdaten auf?", "Bitwarden"],
    ["Was tue ich fuer meinen Ruecken?", "Ruecken"],
    ["Wann wechsle ich die Reifen?", "Reifen"],
  ]);

  const en = await durchlauf("Englisch", [
    ["Carbonara", "Spaghetti carbonara: guanciale, pecorino romano, egg yolk, black pepper."],
    ["Bitwarden", "Bitwarden vault, master password with 2FA via Yubikey."],
    ["Back", "Physiotherapy twice a week, exercises for the lower back."],
    ["Tyres", "Winter tyres from October, summer set stored at the garage."],
  ], [
    ["What do I cook with pasta?", "Carbonara"],
    ["Where do I keep my credentials?", "Bitwarden"],
    ["What do I do for my back?", "Back"],
    ["When do I change my tyres?", "Tyres"],
  ]);

  console.log(`\n  Deutsch ${de}/4 · Englisch ${en}/4 — Modell: nomic-embed-text\n`);
}
main();

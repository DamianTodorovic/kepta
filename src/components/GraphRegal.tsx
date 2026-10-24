// Das Regal ueber seinem Wissen — die Lesung des Bestands in drei Baendern.
//
// Warum dieses Stueck neben dem Baum steht und nicht statt ihm: der Baum teilt nach
// Art und Marke, und an seinem echten Bestand (21 066 Notizen, 18.10.) legt seine
// zweite Ebene 18 993 Stuecke = 90,16 % in EIN Fach namens `#machine-scan`. Was der
// Leser sieht, ist eine Klammer um den ganzen Laden. Das Regal fragt dagegen drei
// Dinge, die ein Mensch wirklich fragt: **woher** kam das Stueck, **worum** geht es,
// und **wann** es geschrieben wurde. Gerechnet wird das in
// `src/lib/graphHierarchy.ts → baueRegal`; hier steht nur die Zeile, die es sagt.
//
// Klickflaeche, aber nur wo sie fuehrt: die **Wann-Koerbe** sind Knöpfe von 44 px und
// oeffnen die Liste ihrer Stuecke (zweiter Klick schliesst). Die Zeilen von Band 1 und 2
// bleiben Text und damit 14 px hoch — eine Zeile, die beim Klick filtert, ohne ein Ziel
// von der Steuerungs-Latte des Hauses zu sein, waere eine Steuerung unter der Latte.
//
// Zwei Eigenschaften, die kein Mass sieht und nur eine Hand prueft (beides gemessen an der
// ausgelieferten 3.2.33, 21.10. 20:05 MESZ): das Panel haengt in der Legende, und die weist
// Zeiger ab (`KnowledgeGraph.tsx:5019`, Klasse `pointer-events-none`) — also braucht jeder
// Korb seine eigne Zeiger-Eigenschaft, sonst geht der Klick durch ihn hindurch ins Bild.
// Und die Liste waechst nach oben, weil die Legende am unteren Rand klebt: ungekapped
// schubst sie ihren eignen Schliess-Knopf aus dem Fenster (Mitte y 628 -> -417 bei 1440 px).
// Deshalb Rolle mit Obergrenze, und eine Rolle, die niemand greifen kann, ist keine Rolle.
import { useEffect, useRef, useState } from "react";
import type { Regal, WannKoerb } from "../lib/graphHierarchy";
import { achsenSatz, type Achsen, type FarbGruppen, type GruppenSteuerung } from "../lib/gruppen";
import { kappeListe } from "../lib/kappe";

/** Die drei Traeger, in der Reihenfolge, in der die Flaeche sie nennt. */
const TRAEGER_REIHENFOLGE = ["Notes", "Files", "Code"] as const;
const TRAEGER_TOKEN: Record<string, string> = {
  Notes: "--type-semantic",
  Files: "--type-reference",
  Code: "--type-procedural",
};

function zahl(n: number): string {
  return n.toLocaleString("en-US");
}

function prozent(p: number): string {
  return p.toFixed(1).replace(".", ",");
}

export interface GraphRegalEigenschaften {
  regal: Regal;
  /** Der Titel der Flaeche, an den sich die Zeile haengt ("the tree" / "the field"). */
  ansichtsName?: string;
  /**
   * Band 4 — die Gruppen, die ein Mensch selbst aus einem Tag baut. Es kommt aus
   * `src/lib/gruppen.ts → zaehleGruppen`, und der Gang ruft **denselben** Aufruf auf
   * demselben Bestand: deshalb kann diese Zeile nie eine andre Zahl nennen als spaeter
   * die Farbe im Bilde. `undefined` heisst: niemand hat gezaehlt — dann steht hier kein
   * Band und keine halbe Wahrheit.
   */
  gruppen?: FarbGruppen;
  /**
   * Die drei Achsen in Menschensprache. Der Satz ueber diesem Band kommt aus
   * `achsenSatz(achsen, gruppen)` — und derselbe Satz steht neben dem Knopf im Gang. Zwei
   * Flaechen, die eine Sache in zwei Worten sagen, hoeren hier auf, weil sie denselben
   * Aufruf lesen.
   */
  achsen?: Achsen;
  /** Die Griffe ans Modell. Ohne sie zeigt das Band Zahlen ohne Knöpfe — kein toter Knopf. */
  steuerung?: GruppenSteuerung;
  /**
   * Marke -> Zahl der Knoten, die diesen Ton WIRKLICH tragen (#90). Ohne diese Zahl
   * verspricht die Zeile eine Farbe, die am Bestand auf keinem Knoten liegt (`json`:
   * 8 485 Mitglieder, 0 gemalt). `undefined` heisst: niemand hat gezaehlt — dann steht
   * hier keine halbe Wahrheit, sondern gar keine Zahl.
   */
  gemalt?: Record<string, number>;
}

export function GraphRegal({ regal, ansichtsName, gruppen, achsen, steuerung, gemalt }: GraphRegalEigenschaften) {
  const { woher, worum, wann } = regal;
  /** Welcher Wann-Korb gerade offen ist. Einer auf einmal: zwei offene Listen in einem
   *  Panel von sechs Zeilen sind keine Auswahl, sondern ein Stapel. */
  const [offen, setOffen] = useState<WannKoerb | null>(null);
  /**
   * Die Liste des geoeffneten Korbs. Sie bekommt beim Oeffnen ihren Blick in den Panel:
   * die Liste liegt tief in einem Kasten, der am unteren Rand klebt, und ohne diesen Griff
   * oeffnet ein Klick etwas unter der Kante — gemessen am Bestand 23.10. in der
   * ausgelieferten 3.2.40: die Liste y 541..861 in einem Panel, das bis y 732 zeigt
   * (1024 x 768) und y 665..985 in einem bis y 768 (390 x 844). Der Nutzer sieht 103 von
   * 320 px und keine Meldung, dass darunter etwas liegt.
   */
  const koerbListeRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (offen && koerbListeRef.current) koerbListeRef.current.scrollIntoView({ block: "nearest" });
  }, [offen]);
  // Band 1 in der Reihenfolge des Hauses, nicht in der der Groesse: der Leser hat
  // Notes, Files, Code schon in der Legende und sucht sie dort.
  const geordnet = [...woher].sort(
    (a, b) => TRAEGER_REIHENFOLGE.indexOf(a.name as (typeof TRAEGER_REIHENFOLGE)[number]) -
      TRAEGER_REIHENFOLGE.indexOf(b.name as (typeof TRAEGER_REIHENFOLGE)[number]) || b.notizen - a.notizen,
  );
  const gesamt = Math.max(1, regal.bestand);
  const groesstesWorum = worum.reduce((n, f) => Math.max(n, f.prozent), 0) || 1;

  return (
    <div data-testid="graph-regal" className="flex flex-col gap-1">
      <div className="hud-label" style={{ color: "var(--text-3)" }}>
        {zahl(gesamt)} notes, in three bands{ansichtsName ? ` — ${ansichtsName}` : ""}
      </div>

      {/* Band 1 — woher. Die Breiten sind der Bestand, nicht eine Rangfolge: wer
          0,44 % sieht, sieht 0,44 %. Ein Fach unter einem Pixel bleibt als Strich
          stehen und wird unter der Zeile beim Namen genannt. */}
      <div
        className="flex w-full overflow-hidden rounded"
        style={{ height: 6, border: "1px solid var(--kante-kontrolle)" }}
        role="img"
        aria-label={geordnet.map((f) => `${f.name} ${f.notizen}`).join(", ")}
      >
        {geordnet.map((f) => (
          <div
            key={f.name}
            className="regal-woher-fach"
            data-notizen={f.notizen}
            style={{ width: `${(100 * f.notizen) / gesamt}%`, background: `var(${TRAEGER_TOKEN[f.name] ?? "--type-neutral"})` }}
          />
        ))}
      </div>
      <div className="hud-label tnum" style={{ color: "var(--text-2)" }}>
        {geordnet.map((f) => `${f.name} ${zahl(f.notizen)}`).join(" · ")}
      </div>

      {/* Band 3 — wann. Jeder Korb ist ein Knopf: die Achse hat bis zu sechs Werte, und
          einer davon ist oft klein genug, dass ein Mensch ihn ganz lesen kann ("2–4 weeks
          ago": dreissig Stuecke an seinem Bestand). Ein Klick oeffnet die Liste, der
          zweite schliesst sie, und ein leerer Korb antwortet mit seinem leeren Satz. */}
      <div className="flex flex-wrap items-center gap-1" data-testid="regal-wann">
        <span className="hud-label" style={{ color: "var(--text-3)" }}>when </span>
        {wann.map((f) => (
          <button
            key={f.name}
            type="button"
            data-testid="regal-koerb"
            aria-expanded={offen === f.name}
            onClick={() => setOffen(offen === f.name ? null : (f.name as WannKoerb))}
            className="hud-label tnum"
            style={{
              minHeight: 44,
              padding: "0 10px",
              color: "var(--text-2)",
              background: "transparent",
              border: "1px solid var(--kante-kontrolle)",
              borderRadius: 6,
              cursor: "pointer",
              pointerEvents: "auto",
            }}
          >
            {f.name} {zahl(f.notizen)}
          </button>
        ))}
      </div>
      {(() => {
        const k = wann.find((f) => f.name === offen);
        if (!k) return null;
        return (
          <div
            ref={koerbListeRef}
            data-testid="regal-koerb-liste"
            className="flex flex-col gap-1"
            style={kappeListe()}
          >
            {k.notizen === 0 ? (
              <div className="hud-label" style={{ color: "var(--text-3)" }}>
                nothing in this basket yet
              </div>
            ) : (
              <>
                {k.stuecke.map((s) => (
                  <div
                    key={s.kennung}
                    data-testid="regal-koerb-stueck"
                    className="hud-label tnum flex items-baseline gap-2"
                    style={{ color: "var(--text-2)" }}
                  >
                    <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text-1)" }}>
                      {s.titel}
                    </span>
                    <span style={{ color: "var(--text-3)" }}>
                      {s.alterTage === null ? "no date" : `${s.alterTage.toFixed(1).replace(".", ",")} d`}
                    </span>
                  </div>
                ))}
                {k.uebrig > 0 && (
                  <div className="hud-label" style={{ color: "var(--text-3)" }}>
                    {zahl(k.uebrig)} more in this basket — the page shows {zahl(k.stuecke.length)}
                  </div>
                )}
              </>
            )}
          </div>
        );
      })()}

      {/* Band 4 — die Gruppen, die ein Mensch selbst baut. Die Zahlen kommen aus
          `src/lib/gruppen.ts`, und der Gang ruft dieselbe Funktion auf demselben Bestand,
          darum kann dieses Band nie eine andre Zahl nennen als spaeter die Farbe im Bilde.
          Ohne Steuerung stehen hier Zahlen ohne Knöpfe; ohne Modell steht hier gar nichts. */}
      {gruppen && (
        <div data-testid="regal-farbgruppe" className="flex flex-col gap-1">
          <div className="hud-label" style={{ color: "var(--text-3)" }}>
            {achsen
              ? achsenSatz(achsen, gruppen)
              : `grouped by your tags · ${zahl(gruppen.bestand - gruppen.ohneGruppe)} of ${zahl(gruppen.bestand)} notes carry a group you made${gruppen.mehrfach > 0 ? ` · ${zahl(gruppen.mehrfach)} carry two of them` : ""}${gruppen.ohneGruppe > 0 ? ` · ${zahl(gruppen.ohneGruppe)} carry none` : ""}`}
          </div>
          {gruppen.gruppen.length === 0 && (
            <div className="hud-label" style={{ color: "var(--text-3)" }}>
              no groups yet — pick a tag below and it becomes one
            </div>
          )}
          <div
            className="flex flex-col gap-1"
            style={kappeListe()}
          >
            {gruppen.gruppen.map((g) => (
              <div
                key={g.marke}
                data-testid="regal-farbgruppe-zeile"
                className="hud-label tnum flex items-center gap-2 regal-zeile"
                style={{ color: "var(--text-2)" }}
              >
                {steuerung ? (
                  <input
                    type="color"
                    data-testid="regal-farbgruppe-farbe"
                    value={g.farbe}
                    aria-label={`Colour for group ${g.marke}`}
                    title="This group's colour — the aisle paints its nodes with it"
                    onChange={(e) => steuerung.farbe(g.marke, e.target.value)}
                    className="graph-swatch shrink-0"
                    style={{ pointerEvents: "auto", minHeight: 44 }}
                  />
                ) : (
                  <span
                    aria-hidden
                    style={{ width: 8, height: 8, borderRadius: 99, flex: "0 0 auto", background: g.farbe }}
                  />
                )}
                <span className="min-w-0 flex-1 truncate regal-marke" style={{ color: "var(--text-1)" }}>
                  #{g.marke}
                </span>
                <span>{zahl(g.notizen)}</span>
                <span style={{ color: "var(--text-3)" }}>{prozent(g.prozent)} %</span>
                {gemalt && (
                  <span
                    data-testid="regal-farbgruppe-gemalt"
                    style={{ color: "var(--text-3)" }}
                    title="Nodes that really wear this group's colour — a note in two groups is painted in the first group's tone"
                  >
                    {zahl(gemalt[g.marke] ?? 0)} painted
                  </span>
                )}
                {steuerung && (
                  <button
                    type="button"
                    data-testid="regal-farbgruppe-loeschen"
                    onClick={() => steuerung.entferne(g.marke)}
                    aria-label={`Remove group ${g.marke}`}
                    className="hud-label tnum shrink-0"
                    style={{
                      minHeight: 44,
                      padding: "0 10px",
                      color: "var(--text-2)",
                      background: "transparent",
                      border: "1px solid var(--kante-kontrolle)",
                      borderRadius: 6,
                      cursor: "pointer",
                      pointerEvents: "auto",
                    }}
                  >
                    remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {steuerung && gruppen.baubar.length > 0 && (
            <div className="flex flex-wrap items-center gap-1">
              {gruppen.baubar.map((b) => (
                <button
                  key={b.marke}
                  type="button"
                  data-testid="regal-farbgruppe-bauen"
                  onClick={() => steuerung.baue(b.marke)}
                  aria-label={`Make a group from tag ${b.marke}`}
                  className="hud-label tnum"
                  style={{
                    minHeight: 44,
                    padding: "0 10px",
                    color: "var(--text-2)",
                    background: "transparent",
                    border: "1px solid var(--kante-kontrolle)",
                    borderRadius: 6,
                    cursor: "pointer",
                    pointerEvents: "auto",
                  }}
                >
                  + #{b.marke} {zahl(b.notizen)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Band 2 — worum. Ein Fach je Stueck, Betreff wo einer greift, sonst der
          Ordnerzweig, sonst das Restfach. Sortiert nach Menge, damit die erste
          Zeile die groesste Wahrheit ist. */}
      {worum.slice(0, 8).map((f) => (
        <div key={`${f.herkunft}:${f.name}`} className="hud-label tnum flex items-baseline gap-2" style={{ color: "var(--text-2)" }}>
          <span
            aria-hidden
            style={{
              width: 6,
              height: 6,
              borderRadius: 99,
              flex: "0 0 auto",
              background: f.herkunft === "betreff" ? "var(--accent)" : "var(--text-3)",
            }}
          />
          <span className="min-w-0 flex-1 truncate" style={{ color: "var(--text-1)" }}>{f.name}</span>
          <span>{zahl(f.notizen)}</span>
          <span style={{ color: "var(--text-3)" }}>
            {f.prozent.toFixed(1).replace(".", ",")} %
          </span>
          {/* Der Streifen ist die Groessenordnung im Vergleich zum groessten Fach —
              dieselbe Skala fuer alle Zeilen, sonst zaehlt jede Zeile gegen sich. */}
          <span
            aria-hidden
            style={{
              width: 46,
              height: 3,
              flex: "0 0 auto",
              background: "var(--kante-dekor)",
              position: "relative",
            }}
          >
            <span
              style={{
                position: "absolute",
                inset: 0,
                width: `${(100 * f.prozent) / groesstesWorum}%`,
                background: "var(--accent)",
              }}
            />
          </span>
        </div>
      ))}

      {/* Die Luecke, die das Regal laesst, steht da statt zu schweigen: 57,69 %
          seines Bestands hat keinen Betreff, und was kein Betreff hat, faellt auf
          den Ordner zurueck. Ohne diese Zeile verkaufte das Panel sechs Woerter
          als seine Wissensstruktur. */}
      <div className="hud-label" style={{ color: "var(--text-3)" }}>
        {zahl(regal.luecken.ohneBetreff)} of them carry no subject at all —{" "}
        {((100 * regal.luecken.ohneBetreff) / gesamt).toFixed(1).replace(".", ",")} %
        {regal.luecken.ohnePfad > 0 ? ` · ${zahl(regal.luecken.ohnePfad)} name no file either` : ""}
      </div>
    </div>
  );
}

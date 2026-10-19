// Das Regal ueber seinem Wissen — die Lesung des Bestands in zwei Baendern.
//
// Warum dieses Stueck neben dem Baum steht und nicht statt ihm: der Baum teilt nach
// Art und Marke, und an seinem echten Bestand (21 066 Notizen, 18.10.) legt seine
// zweite Ebene 18 993 Stuecke = 90,16 % in EIN Fach namens `#machine-scan`. Was der
// Leser sieht, ist eine Klammer um den ganzen Laden. Das Regal fragt dagegen zwei
// Dinge, die ein Mensch wirklich fragt: **woher** kam das Stueck, und **worum** geht
// es. Gerechnet wird das in `src/lib/graphHierarchy.ts → baueRegal`; hier steht nur
// die Zeile, die es sagt.
//
// Bewusst **keine Klickfläche**: eine Zeile in diesem Panel ist 14 px hoch. Die
// Steuerungs-Latte des Hauses verlangt 44 px für alles, was eine Hand trifft — eine
// Zeile, die beim Klick filtert, wäre eine Steuerung unter der Latte. Der Griff auf
// ein Fach ist der naechste Schlag und braucht eine echte Zeilenhoehe; bis dahin ist
// das hier die Antwort auf die Frage, nicht der Weg dorthin.
import type { Regal } from "../lib/graphHierarchy";

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

export interface GraphRegalEigenschaften {
  regal: Regal;
  /** Der Titel der Flaeche, an den sich die Zeile haengt ("the tree" / "the field"). */
  ansichtsName?: string;
}

export function GraphRegal({ regal, ansichtsName }: GraphRegalEigenschaften) {
  const { woher, worum } = regal;
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
        {zahl(gesamt)} notes, in two bands{ansichtsName ? ` — ${ansichtsName}` : ""}
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

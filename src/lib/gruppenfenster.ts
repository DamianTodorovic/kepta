/**
 * Das Sichtfenster der gruppierten Liste. "Load more" verschiebt die Fenster-groesse, nicht die
 * Gruppen: eine Gruppe, die beginnt, wird ganz gezeigt.
 *
 * Die Regel lebte bis P130 nur im Baum (src/components/Dashboard.tsx:1405-1419). Ein Satz, den
 * ein Kunde liest und den kein Fall faehrt, ist eine Behauptung — hier steht sie als Funktion,
 * damit tests/lib/gruppenfenster.test.ts sie faehrt und die Flaeche sie ruft.
 */
export function sichtbareGruppen<T extends { memories: readonly unknown[] }>(
  gruppen: T[],
  fenster: number
): T[] {
  const out: T[] = [];
  let laufend = 0;
  for (const gruppe of gruppen) {
    if (laufend >= fenster) break;
    out.push(gruppe);
    laufend += gruppe.memories.length;
  }
  return out;
}

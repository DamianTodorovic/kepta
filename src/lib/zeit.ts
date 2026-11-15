// P202, Mockup-Grammatik (k3pta-app-fenster .zeile-item .zeit): die Zeit in den
// Listen steht KURZ — „14:22“ für heute, „02.11.“ für dieses Jahr, „02.11.25“
// für älteres. Kein „2 minutes ago“ an der Kante der Zeile.
export function kurzeZeit(ms: number, jetzt = Date.now()): string {
  const d = new Date(ms);
  const heute = new Date(jetzt);
  const tag = (x: Date) => `${x.getFullYear()}-${x.getMonth()}-${x.getDate()}`;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  if (tag(d) === tag(heute)) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (d.getFullYear() === heute.getFullYear()) return `${dd}.${mm}.`;
  return `${dd}.${mm}.${String(d.getFullYear()).slice(2)}`;
}

/* Die vier Rechen-Arten des Mockups: --art-facts/--art-events/--art-howtos/
   --art-docs stehen im E1-Satz als --type-semantic/--type-episodic/
   --type-procedural/--type-reference (Index.css hält die Wachen der Farben). */
export function typFarbe(typ: string | undefined): string {
  if (typ === 'episodic') return 'var(--type-episodic)';
  if (typ === 'procedural') return 'var(--type-procedural)';
  if (typ === 'reference') return 'var(--type-reference)';
  return 'var(--type-semantic)';
}

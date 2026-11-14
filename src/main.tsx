import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import {MotionConfig} from 'motion/react';
import App from './App.tsx';
import {Fehlerschirm} from './components/Fehlerschirm';
import './index.css';
import './mockup-masse.css';
import {starteEinstellungen} from './lib/settings';
import {spanneCrashWachter} from './lib/crashZeug';
import {leseTypFarben, trageTypVar} from './lib/typFarben';

// Erst die abgelegten Einstellungen holen, dann rendern. Sonst baut sich die
// Oberflaeche mit den Standardwerten auf und schreibt sie prompt zurueck —
// aus "noch nicht geladen" wuerde "zurueckgesetzt".
// P190: die Fenster-Wache zuerst — jeder Absturz zeigt sich als Text statt schwarz.
spanneCrashWachter();
// P202: der Zoom-Reset sitzt im main-Prozess (electron.js: setZoomLevel(0) nach
// der Fenster-Konfiguration) — der renderer trägt kein electron-Modul: der
// statische import brach den Browser-Modul-Load und warf den Blackscreen.
// P196: die Typ-Farben tragen schon beim Boot — Karten und Listen zeigen die
// gewaehlten Toene sofort, nicht erst, wenn jemand den Graphen oeffnet.
for (const [rolle, ton] of Object.entries(leseTypFarben())) trageTypVar(rolle, ton);

void starteEinstellungen().finally(() => {
  createRoot(document.getElementById('root')!).render(
    // Der Rand sitzt AUCH ausserhalb von StrictMode: ein Wurf im Render darf
    // nie wieder ein graues Fenster sein, sondern muss sagen, was warf.
    <Fehlerschirm>
      <StrictMode>
        {/* P199 (Emil-Audit §6): der eine Gatter-Punkt für die ganze App —
            unter „Bewegung reduzieren" schalten alle Framer-Transforms sofort,
            Deckkraft- und Farb-Quittungen bleiben. Vorher liefen Schubladen,
            Wizard und Toasts ungebremst weiter, während das CSS alles tötete. */}
        <MotionConfig reducedMotion="user">
          <App />
        </MotionConfig>
      </StrictMode>
    </Fehlerschirm>,
  );
});

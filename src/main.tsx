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
import {webFrame} from 'electron';

// Erst die abgelegten Einstellungen holen, dann rendern. Sonst baut sich die
// Oberflaeche mit den Standardwerten auf und schreibt sie prompt zurueck —
// aus "noch nicht geladen" wuerde "zurueckgesetzt".
// P190: die Fenster-Wache zuerst — jeder Absturz zeigt sich als Text statt schwarz.
spanneCrashWachter();
// P202, Damian 14.11.: die Zoom-Stufe blieb pro Fenster dauerhaft hängen (~1.7×)
// und machte die Fläche unlesbar — der Boot setzt die Maschine auf 100 % und
// der Pinch-Zoom fliegt. Die Maße des Mockups gelten unvergrößert.
try { webFrame.setZoomLevel(0); webFrame.setVisualZoomLevelLimits(1, 1); } catch { /* im Browser ohne electron: nichts zu setzen */ }
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

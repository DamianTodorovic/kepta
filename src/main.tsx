import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {Fehlerschirm} from './components/Fehlerschirm';
import './index.css';
import {starteEinstellungen} from './lib/settings';
import {spanneCrashWachter} from './lib/crashZeug';

// Erst die abgelegten Einstellungen holen, dann rendern. Sonst baut sich die
// Oberflaeche mit den Standardwerten auf und schreibt sie prompt zurueck —
// aus "noch nicht geladen" wuerde "zurueckgesetzt".
// P190: die Fenster-Wache zuerst — jeder Absturz zeigt sich als Text statt schwarz.
spanneCrashWachter();

void starteEinstellungen().finally(() => {
  createRoot(document.getElementById('root')!).render(
    // Der Rand sitzt AUCH ausserhalb von StrictMode: ein Wurf im Render darf
    // nie wieder ein graues Fenster sein, sondern muss sagen, was warf.
    <Fehlerschirm>
      <StrictMode>
        <App />
      </StrictMode>
    </Fehlerschirm>,
  );
});

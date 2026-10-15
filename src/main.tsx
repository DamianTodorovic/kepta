import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import {Fehlerschirm} from './components/Fehlerschirm';
import './index.css';
import {starteEinstellungen} from './lib/settings';

// Erst die abgelegten Einstellungen holen, dann rendern. Sonst baut sich die
// Oberflaeche mit den Standardwerten auf und schreibt sie prompt zurueck —
// aus "noch nicht geladen" wuerde "zurueckgesetzt".
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

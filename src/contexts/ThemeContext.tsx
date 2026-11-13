import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

interface ThemeContextType {
  isDark: boolean;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeContextType>({ isDark: false, toggle: () => {} });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [isDark, setIsDark] = useState(() => {
    // P202, der Weltwechsel: die Werkbank ist HELL — und eine gespeicherte
    // „dark"-Wahl aus der Welt VOR dem Umbau ist keine Wahl für das neue Design,
    // sondern die Alt-Last des früheren dunklen Defaults. Darum trägt die Wahl
    // seit dem Umbau ihren eignen Schlüssel: die alte stirbt mit der alten Welt,
    // wer danach dunkel wählt, speichert bewusst.
    const saved = localStorage.getItem('theme-werkbank');
    return saved ? saved === 'dark' : false;
  });

  useEffect(() => {
    localStorage.setItem('theme-werkbank', isDark ? 'dark' : 'light');
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDark]);

  return (
    <ThemeContext.Provider value={{ isDark, toggle: () => setIsDark(!isDark) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);

import { AuthProvider } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastProvider } from './components/ui/Toast';
import { Dashboard } from './components/Dashboard';

// Premium minimal — kein Sci-Fi, nur Ruhe und Fokus
function AppContent() {
  return (
    <div className="relative h-screen w-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <div className="relative z-10 h-full">
        <Dashboard />
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

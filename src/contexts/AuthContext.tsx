import { createContext, useContext, useState, ReactNode } from 'react';
import { UserProfile } from '../types';

interface AuthContextType {
  user: UserProfile;
  loading: boolean;
  authError: string | null;
  login: () => Promise<void>;
  loginAnonymously: () => Promise<void>;
  logout: () => Promise<void>;
}

// Rein lokale App: kein Login, kein Cloud-Zwang. Alle Daten bleiben auf diesem Gerät.
const localUser: UserProfile = {
  uid: 'local',
  email: null,
  displayName: 'Lokal',
  photoURL: null,
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user] = useState<UserProfile>(localUser);
  const [loading] = useState(false);
  const [authError] = useState<string | null>(null);

  const noop = async () => {};

  return (
    <AuthContext.Provider value={{ user, loading, authError, login: noop, loginAnonymously: noop, logout: noop }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

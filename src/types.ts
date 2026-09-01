export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
}

export interface Memory {
  id: string;
  userId: string;
  title: string;
  content: string;
  tags: string[];
  createdAt: number;
  updatedAt: number;
  // v2-Felder (optional, vom Server geliefert)
  type?: 'semantic' | 'episodic' | 'procedural';
  scope?: string;
  confidence?: number;
  validFrom?: number | null;
  validTo?: number | null;
  supersededBy?: string | null;
  deletedAt?: number | null;
  lastAccessAt?: number | null;
  accessCount?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}


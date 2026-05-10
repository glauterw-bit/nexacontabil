'use client';
import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: string;
  companyId: string | null;
}

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);


export function AuthProvider({ children }: { children: ReactNode }) {
  // Inicializar sincronicamente do localStorage — sem loading inicial
  const [user, setUser] = useState<AuthUser | null>(() => {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('aura_user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return localStorage.getItem('aura_token');
  });
  const loading = false; // nunca bloqueia — validação em background

  const saveSession = (accessToken: string, userData: AuthUser) => {
    localStorage.setItem('aura_token', accessToken);
    localStorage.setItem('aura_user', JSON.stringify(userData));
    setToken(accessToken);
    setUser(userData);
  };

  const logout = useCallback(() => {
    localStorage.removeItem('aura_token');
    localStorage.removeItem('aura_user');
    setToken(null);
    setUser(null);
  }, []);

  // Validação silenciosa em background (não bloqueia a UI)
  useEffect(() => {
    const stored = localStorage.getItem('aura_token');
    if (!stored) return;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    fetch(`${API}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${stored}` },
      signal: controller.signal,
    })
      .then(r => r.ok ? r.json() : Promise.reject())
      .then(data => {
        setUser(data);
        localStorage.setItem('aura_user', JSON.stringify(data));
      })
      .catch(() => {
        // Token inválido: faz logout
        logout();
      })
      .finally(() => clearTimeout(timeout));
  }, []);

  const login = async (email: string, password: string) => {
    const r = await fetch(`${API}/api/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.message || 'Credenciais inválidas');
    }
    const data = await r.json();
    saveSession(data.access_token, data.user);
  };

  const register = async (name: string, email: string, password: string) => {
    const r = await fetch(`${API}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, password }),
    });
    if (!r.ok) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.message || 'Erro ao criar conta');
    }
    const data = await r.json();
    saveSession(data.access_token, data.user);
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

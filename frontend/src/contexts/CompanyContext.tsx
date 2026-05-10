'use client';
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export interface Company {
  id: string;
  name: string;
  cnpj: string;
  taxRegime: string;
  email?: string;
  phone?: string;
  address?: string;
  active: boolean;
}

interface CompanyContextType {
  selectedCompany: Company | null;
  setSelectedCompany: (c: Company) => void;
}

const CompanyContext = createContext<CompanyContextType | null>(null);

export function CompanyProvider({ children }: { children: ReactNode }) {
  const [selectedCompany, setSelectedCompanyState] = useState<Company | null>(null);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem('aura_selected_company');
      if (stored) setSelectedCompanyState(JSON.parse(stored));
    } catch {}
  }, []);

  const setSelectedCompany = (company: Company) => {
    setSelectedCompanyState(company);
    try {
      localStorage.setItem('aura_selected_company', JSON.stringify(company));
    } catch {}
  };

  return (
    <CompanyContext.Provider value={{ selectedCompany, setSelectedCompany }}>
      {children}
    </CompanyContext.Provider>
  );
}

export function useCompany() {
  const ctx = useContext(CompanyContext);
  if (!ctx) throw new Error('useCompany must be used inside CompanyProvider');
  return ctx;
}

'use client';
import { useState } from 'react';
import { Download, CheckCircle, Clock, Send, FileText, ChevronRight, RefreshCw, ChevronLeft } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

type ObStatus = 'rascunho' | 'validado' | 'transmitido' | 'aceito' | 'erro';

interface Obrigacao {
  id: string;
  nome: string;
  competencia: string;
  status: ObStatus;
  arquivo?: string;
  erros?: string[];
  dataTransmissao?: string;
  protocolo?: string;
}

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

const MOCK_OBRIGACOES: Record<string, Obrigacao[]> = {
  dctf: [
    { id: '1', nome: 'DCTF Mensal', competencia: 'Fev/2026', status: 'aceito', arquivo: 'DCTF_2026_02.xml', dataTransmissao: '2026-03-15', protocolo: '15032026001234' },
    { id: '2', nome: 'DCTF Mensal', competencia: 'Jan/2026', status: 'aceito', arquivo: 'DCTF_2026_01.xml', dataTransmissao: '2026-02-14', protocolo: '14022026005678' },
    { id: '3', nome: 'DCTF Mensal', competencia: 'Mar/2026', status: 'rascunho' },
  ],
  efdreinf: [
    { id: '4', nome: 'EFD-Reinf R-1000', competencia: 'Fev/2026', status: 'aceito', arquivo: 'EFD_R1000_2026_02.xml', dataTransmissao: '2026-03-15', protocolo: '15032026009012' },
    { id: '5', nome: 'EFD-Reinf R-2010', competencia: 'Fev/2026', status: 'transmitido', arquivo: 'EFD_R2010_2026_02.xml', dataTransmissao: '2026-03-20' },
    { id: '6', nome: 'EFD-Reinf R-1000', competencia: 'Mar/2026', status: 'rascunho' },
  ],
  esocial: [
    { id: '7', nome: 'eSocial S-1200', competencia: 'Fev/2026', status: 'aceito', arquivo: 'ESOCIAL_S1200_2026_02.xml', dataTransmissao: '2026-03-10', protocolo: '10032026003456' },
    { id: '8', nome: 'eSocial S-1210', competencia: 'Fev/2026', status: 'validado', arquivo: 'ESOCIAL_S1210_2026_02.xml' },
    { id: '9', nome: 'eSocial S-1200', competencia: 'Mar/2026', status: 'rascunho' },
  ],
  ecf: [
    { id: '10', nome: 'ECF Anual 2025', competencia: 'Ano 2025', status: 'transmitido', arquivo: 'ECF_2025.txt', dataTransmissao: '2026-03-01', protocolo: '01032026007890' },
  ],
  sped: [
    { id: '11', nome: 'SPED Contribuições', competencia: 'Fev/2026', status: 'aceito', arquivo: 'SPED_PIS_COFINS_2026_02.txt', dataTransmissao: '2026-03-14', protocolo: '14032026002345' },
    { id: '12', nome: 'SPED Contribuições', competencia: 'Mar/2026', status: 'rascunho' },
  ],
};

const statusConfig: Record<ObStatus, { label: string; color: string; bg: string; border: string; icon: any; step: number }> = {
  rascunho:    { label: 'Rascunho',    color: 'text-gray-400',   bg: 'bg-gray-400/10',   border: 'border-gray-400/30',   icon: FileText,     step: 0 },
  validado:    { label: 'Validado',    color: 'text-blue-400',   bg: 'bg-blue-400/10',   border: 'border-blue-400/30',   icon: CheckCircle,  step: 1 },
  transmitido: { label: 'Transmitido', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30', icon: Send,         step: 2 },
  aceito:      { label: 'Aceito',      color: 'text-green-400',  bg: 'bg-green-400/10',  border: 'border-green-400/30',  icon: CheckCircle,  step: 3 },
  erro:        { label: 'Erro',        color: 'text-red-400',    bg: 'bg-red-400/10',    border: 'border-red-400/30',    icon: FileText,     step: -1 },
};

const TABS = [
  { id: 'dctf', label: 'DCTF' },
  { id: 'efdreinf', label: 'EFD-Reinf' },
  { id: 'esocial', label: 'eSocial' },
  { id: 'ecf', label: 'ECF' },
  { id: 'sped', label: 'SPED Contrib.' },
];

const STEPS = ['Gerado', 'Validado', 'Transmitido', 'Aceito'];

export default function ObrigacoesPage() {
  const { selectedCompany } = useCompany();
  const [tab, setTab] = useState('dctf');
  const [mes, setMes] = useState(2);
  const [ano, setAno] = useState(2026);
  const [obrigacoes, setObrigacoes] = useState(MOCK_OBRIGACOES);

  const avancar = (id: string, tabKey: string) => {
    const ordem: ObStatus[] = ['rascunho', 'validado', 'transmitido', 'aceito'];
    setObrigacoes(prev => ({
      ...prev,
      [tabKey]: prev[tabKey].map(o => {
        if (o.id !== id) return o;
        const idx = ordem.indexOf(o.status);
        const next = idx < ordem.length - 1 ? ordem[idx + 1] : o.status;
        return { ...o, status: next, dataTransmissao: next === 'transmitido' ? new Date().toISOString().split('T')[0] : o.dataTransmissao, protocolo: next === 'aceito' ? String(Date.now()).slice(-14) : o.protocolo, arquivo: o.arquivo || `${tabKey.toUpperCase()}_${ano}_${String(mes + 1).padStart(2, '0')}.xml` };
      }),
    }));
  };

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para gerenciar obrigações acessórias.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  const current = obrigacoes[tab] || [];

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Obrigações Acessórias</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => { if (mes === 0) { setMes(11); setAno(a => a - 1); } else setMes(m => m - 1); }} className="btn-ghost p-1.5"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-white font-medium min-w-[130px] text-center">{MESES[mes]} {ano}</span>
          <button onClick={() => { if (mes === 11) { setMes(0); setAno(a => a + 1); } else setMes(m => m + 1); }} className="btn-ghost p-1.5"><ChevronRight className="h-4 w-4" /></button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#161b2e] border border-[#1e2740] rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${tab === t.id ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-4 gap-3">
        {STEPS.map((step, i) => {
          const count = current.filter(o => statusConfig[o.status].step >= i).length;
          return (
            <div key={step} className={`card-aura text-center ${i === 3 ? 'border-green-500/30' : ''}`}>
              <p className="text-xs text-gray-500 mb-1">{step}</p>
              <p className={`text-2xl font-bold ${i === 3 ? 'text-green-400' : i === 2 ? 'text-yellow-400' : i === 1 ? 'text-blue-400' : 'text-gray-400'}`}>{count}</p>
            </div>
          );
        })}
      </div>

      {/* List */}
      <div className="card-aura space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">{TABS.find(t => t.id === tab)?.label}</h2>
          <button onClick={() => avancar(current.find(o => o.status === 'rascunho')?.id || '', tab)} className="btn-primary text-sm">
            <FileText className="h-4 w-4" /> Gerar Arquivo
          </button>
        </div>

        {current.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="h-12 w-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 text-sm">Nenhuma obrigação cadastrada para este período.</p>
          </div>
        ) : (
          current.map(o => {
            const cfg = statusConfig[o.status];
            const StatusIcon = cfg.icon;
            return (
              <div key={o.id} className="p-4 bg-[#0f1117] rounded-lg border border-[#1e2740]">
                <div className="flex items-center gap-4">
                  <div className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
                    <StatusIcon className={`h-5 w-5 ${cfg.color}`} />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-white font-medium text-sm">{o.nome}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>{cfg.label}</span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>Competência: {o.competencia}</span>
                      {o.arquivo && <span className="font-mono">{o.arquivo}</span>}
                      {o.protocolo && <span>Protocolo: {o.protocolo}</span>}
                      {o.dataTransmissao && <span>Transmitido: {new Date(o.dataTransmissao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>}
                    </div>
                  </div>

                  {/* Timeline */}
                  <div className="flex items-center gap-1 mr-4">
                    {STEPS.map((step, i) => (
                      <div key={step} className="flex items-center gap-1">
                        <div className={`h-2 w-2 rounded-full ${statusConfig[o.status].step >= i ? 'bg-indigo-500' : 'bg-[#1e2740]'}`} title={step} />
                        {i < STEPS.length - 1 && <div className={`h-0.5 w-4 ${statusConfig[o.status].step > i ? 'bg-indigo-500' : 'bg-[#1e2740]'}`} />}
                      </div>
                    ))}
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {o.arquivo && (
                      <button className="btn-ghost p-1.5 text-gray-400 hover:text-white" title="Download XML">
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {o.status !== 'aceito' && o.status !== 'erro' && (
                      <button onClick={() => avancar(o.id, tab)} className="btn-ghost text-xs text-indigo-400 hover:text-indigo-300 border border-indigo-500/30 px-2 py-1">
                        {o.status === 'rascunho' ? 'Validar' : o.status === 'validado' ? 'Transmitir' : 'Confirmar'}
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </button>
                    )}
                    {o.status === 'rascunho' && (
                      <button className="btn-ghost p-1.5 text-gray-400 hover:text-white" title="Regenerar">
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { Plus, Copy, X, CheckCircle, Clock, AlertTriangle, Users, FileText, Link2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

type AssinaturaStatus = 'pendente' | 'parcialmente_assinado' | 'concluido' | 'expirado';

interface Signatario {
  nome: string;
  email: string;
  assinado: boolean;
  dataAssinatura?: string;
}

interface SolicitacaoAssinatura {
  id: string;
  titulo: string;
  signatarios: Signatario[];
  status: AssinaturaStatus;
  expiracao: string;
  criacao: string;
  link: string;
}

const MOCK_ASSINATURAS: SolicitacaoAssinatura[] = [
  {
    id: '1',
    titulo: 'Contrato de Prestação de Serviços Contábeis — Empresa ABC',
    signatarios: [
      { nome: 'João Silva (Cliente)', email: 'joao@abc.com.br', assinado: true, dataAssinatura: '2026-03-20T14:30:00' },
      { nome: 'Ana Ferreira (Contadora)', email: 'ana@aura.com.br', assinado: true, dataAssinatura: '2026-03-20T15:00:00' },
    ],
    status: 'concluido',
    expiracao: '2026-04-20',
    criacao: '2026-03-19',
    link: 'https://sign.aura.com.br/doc/abc123',
  },
  {
    id: '2',
    titulo: 'Procuração Eletrônica SPED e eSocial — Tech Solutions',
    signatarios: [
      { nome: 'Carlos Mendes (Sócio)', email: 'carlos@tech.com.br', assinado: true, dataAssinatura: '2026-03-21T10:00:00' },
      { nome: 'Maria Costa (Sócia)', email: 'maria@tech.com.br', assinado: false },
      { nome: 'Contador Responsável', email: 'contador@aura.com.br', assinado: false },
    ],
    status: 'parcialmente_assinado',
    expiracao: '2026-04-05',
    criacao: '2026-03-21',
    link: 'https://sign.aura.com.br/doc/def456',
  },
  {
    id: '3',
    titulo: 'Declaração de Imposto de Renda PJ 2025 — Comércio Beta',
    signatarios: [
      { nome: 'Roberto Alves (Diretor)', email: 'roberto@beta.com.br', assinado: false },
    ],
    status: 'pendente',
    expiracao: '2026-03-31',
    criacao: '2026-03-22',
    link: 'https://sign.aura.com.br/doc/ghi789',
  },
  {
    id: '4',
    titulo: 'Contrato de Serviço — Indústria Gamma',
    signatarios: [
      { nome: 'Pedro Lima', email: 'pedro@gamma.com.br', assinado: true },
      { nome: 'Sandra Gomes', email: 'sandra@gamma.com.br', assinado: true },
    ],
    status: 'expirado',
    expiracao: '2026-02-28',
    criacao: '2026-02-14',
    link: 'https://sign.aura.com.br/doc/jkl012',
  },
];

const statusConfig: Record<AssinaturaStatus, { label: string; color: string; bg: string; border: string; icon: any }> = {
  pendente: { label: 'Pendente', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30', icon: Clock },
  parcialmente_assinado: { label: 'Parcialmente Assinado', color: 'text-blue-400', bg: 'bg-blue-400/10', border: 'border-blue-400/30', icon: Users },
  concluido: { label: 'Concluído', color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/30', icon: CheckCircle },
  expirado: { label: 'Expirado', color: 'text-gray-500', bg: 'bg-gray-500/10', border: 'border-gray-500/30', icon: AlertTriangle },
};

interface NovaForm {
  titulo: string;
  signatarios: { nome: string; email: string }[];
  expiracao: string;
}

export default function AssinaturasPage() {
  const { selectedCompany } = useCompany();
  const [assinaturas, setAssinaturas] = useState<SolicitacaoAssinatura[]>(MOCK_ASSINATURAS);
  const [showNova, setShowNova] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState<NovaForm>({
    titulo: '',
    signatarios: [{ nome: '', email: '' }],
    expiracao: '',
  });

  const copiarLink = (id: string, link: string) => {
    navigator.clipboard.writeText(link).catch(() => {});
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const cancelar = (id: string) => {
    if (!confirm('Cancelar esta solicitação de assinatura?')) return;
    setAssinaturas(prev => prev.filter(a => a.id !== id));
  };

  const adicionarSignatario = () => {
    setForm(f => ({ ...f, signatarios: [...f.signatarios, { nome: '', email: '' }] }));
  };

  const removeSignatario = (idx: number) => {
    setForm(f => ({ ...f, signatarios: f.signatarios.filter((_, i) => i !== idx) }));
  };

  const criarSolicitacao = () => {
    if (!form.titulo || form.signatarios.every(s => !s.nome)) return;
    const nova: SolicitacaoAssinatura = {
      id: crypto.randomUUID(),
      titulo: form.titulo,
      signatarios: form.signatarios.filter(s => s.nome).map(s => ({ ...s, assinado: false })),
      status: 'pendente',
      expiracao: form.expiracao || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      criacao: new Date().toISOString().split('T')[0],
      link: `https://sign.aura.com.br/doc/${Math.random().toString(36).slice(2, 8)}`,
    };
    setAssinaturas(prev => [nova, ...prev]);
    setShowNova(false);
    setForm({ titulo: '', signatarios: [{ nome: '', email: '' }], expiracao: '' });
  };

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para gerenciar assinaturas digitais.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  const pendentes = assinaturas.filter(a => a.status === 'pendente' || a.status === 'parcialmente_assinado').length;

  return (
    <div className="p-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Assinatura Digital</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name} · {pendentes} solicitação(ões) ativa(s)</p>
        </div>
        <button onClick={() => setShowNova(true)} className="btn-primary">
          <Plus className="h-4 w-4" /> Nova Solicitação
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {(Object.keys(statusConfig) as AssinaturaStatus[]).map(s => {
          const cfg = statusConfig[s];
          const count = assinaturas.filter(a => a.status === s).length;
          const Icon = cfg.icon;
          return (
            <div key={s} className="card-aura">
              <div className={`inline-flex items-center gap-2 text-xs px-2 py-1 rounded-full border mb-2 ${cfg.bg} ${cfg.color} ${cfg.border}`}>
                <Icon className="h-3 w-3" /> {cfg.label}
              </div>
              <p className={`text-2xl font-bold ${cfg.color}`}>{count}</p>
            </div>
          );
        })}
      </div>

      {/* List */}
      <div className="space-y-3">
        {assinaturas.map(a => {
          const cfg = statusConfig[a.status];
          const StatusIcon = cfg.icon;
          const assinados = a.signatarios.filter(s => s.assinado).length;
          const total = a.signatarios.length;
          const pct = (assinados / total) * 100;
          const isExpanded = expandedId === a.id;
          const expirado = new Date(a.expiracao) < new Date();

          return (
            <div key={a.id} className={`card-aura transition-all ${a.status === 'expirado' ? 'opacity-60' : ''}`}>
              <div className="flex items-start gap-4">
                <div className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
                  <StatusIcon className={`h-5 w-5 ${cfg.color}`} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <button onClick={() => setExpandedId(isExpanded ? null : a.id)} className="text-left">
                      <p className="text-white font-medium text-sm hover:text-indigo-400 transition-colors">{a.titulo}</p>
                      <div className="flex items-center gap-3 mt-1 text-xs text-gray-400">
                        <span><Users className="inline h-3 w-3 mr-0.5" />{assinados}/{total} signatários</span>
                        <span><FileText className="inline h-3 w-3 mr-0.5" />Criado: {new Date(a.criacao + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                        <span className={expirado && a.status !== 'concluido' ? 'text-red-400' : ''}>
                          Expira: {new Date(a.expiracao + 'T12:00:00').toLocaleDateString('pt-BR')}
                        </span>
                      </div>
                    </button>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border}`}>{cfg.label}</span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="flex items-center gap-2 mt-2">
                    <div className="flex-1 bg-[#0f1117] rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${a.status === 'concluido' ? 'bg-green-500' : 'bg-indigo-500'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-xs text-gray-400">{assinados}/{total}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => copiarLink(a.id, a.link)}
                    className={`btn-ghost p-1.5 ${copiedId === a.id ? 'text-green-400' : 'text-gray-400 hover:text-white'}`} title="Copiar link">
                    {copiedId === a.id ? <CheckCircle className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  </button>
                  {a.status !== 'concluido' && a.status !== 'expirado' && (
                    <button onClick={() => cancelar(a.id)} className="btn-ghost p-1.5 text-red-400 hover:text-red-300" title="Cancelar">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>

              {/* Expanded signatories */}
              {isExpanded && (
                <div className="mt-4 pt-4 border-t border-[#1e2740] space-y-2">
                  <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">Signatários</p>
                  {a.signatarios.map((sig, i) => (
                    <div key={i} className="flex items-center gap-3 p-2 bg-[#0f1117] rounded-lg">
                      <div className={`h-7 w-7 rounded-full flex items-center justify-center flex-shrink-0 ${sig.assinado ? 'bg-green-400/20' : 'bg-gray-400/20'}`}>
                        {sig.assinado ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Clock className="h-4 w-4 text-gray-400" />}
                      </div>
                      <div className="flex-1">
                        <p className="text-white text-sm">{sig.nome}</p>
                        <p className="text-gray-500 text-xs">{sig.email}</p>
                      </div>
                      {sig.assinado && sig.dataAssinatura && (
                        <span className="text-xs text-green-400">{new Date(sig.dataAssinatura).toLocaleString('pt-BR')}</span>
                      )}
                      {!sig.assinado && (
                        <button onClick={() => copiarLink(a.id + '-' + i, a.link + '?signer=' + i)}
                          className="btn-ghost text-xs text-indigo-400 flex items-center gap-1 border border-indigo-500/30 px-2 py-1">
                          <Link2 className="h-3 w-3" /> Copiar link
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Nova Solicitação Modal */}
      {showNova && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1117] border border-[#1e2740] rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-5">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-white">Nova Solicitação de Assinatura</h2>
              <button onClick={() => setShowNova(false)} className="btn-ghost p-1.5"><X className="h-5 w-5" /></button>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Título do Documento *</label>
              <input value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
                className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500"
                placeholder="Contrato de Prestação de Serviços" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1.5">Data de Expiração</label>
              <input type="date" value={form.expiracao} onChange={e => setForm(f => ({ ...f, expiracao: e.target.value }))}
                className="w-full bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500" />
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm text-gray-400">Signatários *</label>
                <button onClick={adicionarSignatario} className="btn-ghost text-xs text-indigo-400">
                  <Plus className="h-3 w-3" /> Adicionar
                </button>
              </div>
              <div className="space-y-2">
                {form.signatarios.map((sig, i) => (
                  <div key={i} className="flex gap-2">
                    <input value={sig.nome} onChange={e => setForm(f => ({ ...f, signatarios: f.signatarios.map((s, j) => j === i ? { ...s, nome: e.target.value } : s) }))}
                      className="flex-1 bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500"
                      placeholder="Nome do signatário" />
                    <input value={sig.email} onChange={e => setForm(f => ({ ...f, signatarios: f.signatarios.map((s, j) => j === i ? { ...s, email: e.target.value } : s) }))}
                      className="flex-1 bg-[#161b2e] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-indigo-500"
                      placeholder="email@dominio.com" />
                    {form.signatarios.length > 1 && (
                      <button onClick={() => removeSignatario(i)} className="btn-ghost p-2 text-red-400"><X className="h-4 w-4" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowNova(false)} className="btn-ghost flex-1">Cancelar</button>
              <button onClick={criarSolicitacao} className="btn-primary flex-1">
                <CheckCircle className="h-4 w-4" /> Criar Solicitação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

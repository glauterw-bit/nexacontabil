'use client';
import { useState, useEffect } from 'react';
import { Calendar, List, CheckCircle, Clock, AlertTriangle, ChevronLeft, ChevronRight, Download, Filter, RefreshCw, Sparkles } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { useToast } from '@/components/ui/Toast';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';

function mapBackendToObrigacao(item: any): Obrigacao {
  const tipoMap: Record<string, ObrigacaoTipo> = {
    DAS: 'DAS', DARF: 'DARF', GPS: 'GPS', FGTS: 'FGTS', ICMS: 'ICMS',
    ISS: 'ISS', PIS: 'PIS', COFINS: 'COFINS', IRPJ: 'IRPJ', CSLL: 'CSLL',
  };
  const statusMap: Record<string, ObrigacaoStatus> = {
    pendente: 'pendente', em_apuracao: 'pendente', apurada: 'pendente',
    paga: 'pago', vencida: 'vencido',
  };
  return {
    id: item.id,
    tipo: (tipoMap[item.tipo] || 'DARF') as ObrigacaoTipo,
    descricao: item.descricao,
    vencimento: String(item.dataVencimento).slice(0, 10),
    valor: item.valorEstimado || item.valorPago || 0,
    status: statusMap[item.status] || 'pendente',
    competencia: item.competencia,
  };
}

type ObrigacaoStatus = 'pendente' | 'pago' | 'vencido';
type ObrigacaoTipo = 'DARF' | 'GPS' | 'FGTS' | 'SIMPLES' | 'DAS' | 'IRPJ' | 'CSLL' | 'PIS' | 'COFINS' | 'ISS' | 'ICMS';

interface Obrigacao {
  id: string;
  tipo: ObrigacaoTipo;
  descricao: string;
  vencimento: string;
  valor: number;
  status: ObrigacaoStatus;
  competencia: string;
  codigoReceita?: string;
}


const statusConfig: Record<ObrigacaoStatus, { label: string; color: string; bg: string; border: string; icon: any }> = {
  pendente: { label: 'Pendente', color: 'text-yellow-400', bg: 'bg-yellow-400/10', border: 'border-yellow-400/30', icon: Clock },
  pago: { label: 'Pago', color: 'text-green-400', bg: 'bg-green-400/10', border: 'border-green-400/30', icon: CheckCircle },
  vencido: { label: 'Vencido', color: 'text-red-400', bg: 'bg-red-400/10', border: 'border-red-400/30', icon: AlertTriangle },
};

const tipoColors: Record<ObrigacaoTipo, string> = {
  DAS: 'bg-indigo-600/20 text-indigo-400',
  DARF: 'bg-purple-600/20 text-purple-400',
  GPS: 'bg-blue-600/20 text-blue-400',
  FGTS: 'bg-cyan-600/20 text-cyan-400',
  SIMPLES: 'bg-indigo-600/20 text-indigo-400',
  IRPJ: 'bg-orange-600/20 text-orange-400',
  CSLL: 'bg-yellow-600/20 text-yellow-400',
  PIS: 'bg-pink-600/20 text-pink-400',
  COFINS: 'bg-rose-600/20 text-rose-400',
  ISS: 'bg-teal-600/20 text-teal-400',
  ICMS: 'bg-emerald-600/20 text-emerald-400',
};

const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function AgendaPage() {
  const { selectedCompany } = useCompany();
  const toast = useToast();
  const [view, setView] = useState<'lista' | 'calendario'>('lista');
  const [mes, setMes] = useState(new Date().getMonth());
  const [ano, setAno] = useState(new Date().getFullYear());
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos');
  const [obrigacoes, setObrigacoes] = useState<Obrigacao[]>([]);
  const [usandoDadosReais, setUsandoDadosReais] = useState(false);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);

  async function carregar() {
    if (!selectedCompany) return;
    setLoading(true);
    try {
      const res = await fetch(`${API}/api/v1/fiscal-calendar?companyId=${selectedCompany.id}`);
      if (!res.ok) throw new Error('fetch failed');
      const data = await res.json();
      if (Array.isArray(data)) {
        setObrigacoes(data.map(mapBackendToObrigacao));
        setUsandoDadosReais(true);
      } else {
        setObrigacoes([]);
        setUsandoDadosReais(false);
      }
    } catch (e) {
      setObrigacoes([]);
      setUsandoDadosReais(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    carregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCompany?.id]);

  async function gerarCalendario() {
    if (!selectedCompany) return;
    setGenerating(true);
    try {
      const res = await fetch(`${API}/api/v1/fiscal-calendar/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId: selectedCompany.id, ano }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || 'Erro ao gerar');
      toast.push(`${data.generated} obrigações criadas para ${ano}`, { variant: 'success', title: 'Calendário gerado' });
      await carregar();
    } catch (e: any) {
      toast.push(e?.message || 'Falha ao gerar calendário', { variant: 'error' });
    } finally {
      setGenerating(false);
    }
  }

  async function marcarPago(id: string) {
    setObrigacoes(prev => prev.map(o => o.id === id ? { ...o, status: 'pago' as ObrigacaoStatus } : o));
    if (usandoDadosReais && selectedCompany) {
      const o = obrigacoes.find(x => x.id === id);
      if (!o) return;
      try {
        await fetch(`${API}/api/v1/fiscal-calendar/${id}/pagar`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ valorPago: o.valor }),
        });
        toast.push(`Obrigação marcada como paga`, { variant: 'success' });
      } catch (e) {
        toast.push('Falha ao sincronizar com servidor (mudança local mantida)', { variant: 'warning' });
      }
    }
  }

  const mesAtual = `${ano}-${String(mes + 1).padStart(2, '0')}`;
  const obrigacoesFiltradas = obrigacoes.filter(o => {
    const matchMes = o.vencimento.startsWith(mesAtual);
    const matchTipo = tipoFiltro === 'todos' || o.tipo === tipoFiltro;
    return matchMes && matchTipo;
  });

  const proximas30 = obrigacoes.filter(o => {
    const diff = (new Date(o.vencimento).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= 30 && o.status === 'pendente';
  }).sort((a, b) => a.vencimento.localeCompare(b.vencimento));

  // Calendar grid
  const primeiroDia = new Date(ano, mes, 1).getDay();
  const diasNoMes = new Date(ano, mes + 1, 0).getDate();

  const diasComObrigacoes: Record<number, Obrigacao[]> = {};
  obrigacoesFiltradas.forEach(o => {
    const dia = parseInt(o.vencimento.split('-')[2]);
    if (!diasComObrigacoes[dia]) diasComObrigacoes[dia] = [];
    diasComObrigacoes[dia].push(o);
  });

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-8">
        <Building2 className="h-12 w-12 text-gray-600" />
        <p className="text-gray-400 text-sm">Selecione uma empresa para ver a agenda fiscal.</p>
        <Link href="/companies" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  const totalPendente = obrigacoesFiltradas.filter(o => o.status === 'pendente').reduce((s, o) => s + o.valor, 0);
  const totalPago = obrigacoesFiltradas.filter(o => o.status === 'pago').reduce((s, o) => s + o.valor, 0);
  const totalVencido = obrigacoesFiltradas.filter(o => o.status === 'vencido').reduce((s, o) => s + o.valor, 0);

  return (
    <div className="p-8 space-y-6">
      {!usandoDadosReais && (
        <div className="flex items-start gap-3 px-4 py-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <AlertTriangle className="h-4 w-4 text-amber-400 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-amber-300 font-medium">Dados de demonstração</p>
            <p className="text-xs text-amber-200/70 mt-0.5">
              Clique em <strong>Gerar Calendário {ano}</strong> para criar todas as obrigações fiscais reais
              dessa empresa, conforme o regime tributário. O calendário inclui DAS, DARF, FGTS, eSocial,
              DCTFWeb, EFD-REINF, ECD, ECF, DEFIS e demais obrigações aplicáveis.
            </p>
          </div>
        </div>
      )}
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Agenda de Obrigações Fiscais</h1>
          <p className="text-gray-400 text-sm mt-1">{selectedCompany.name}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={gerarCalendario}
            disabled={generating || !selectedCompany}
            className="btn-ghost flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            title={`Gera todas as obrigações fiscais de ${ano} para essa empresa, conforme o regime tributário`}
          >
            {generating ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {generating ? 'Gerando...' : `Gerar Calendário ${ano}`}
          </button>
          <button
            onClick={carregar}
            disabled={loading}
            className="btn-ghost flex items-center gap-2 text-sm"
            title="Atualizar"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <div className="flex rounded-lg border border-[#1e2740] overflow-hidden">
            <button
              onClick={() => setView('lista')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${view === 'lista' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <List className="h-4 w-4" /> Lista
            </button>
            <button
              onClick={() => setView('calendario')}
              className={`px-3 py-1.5 text-sm flex items-center gap-1.5 transition-colors ${view === 'calendario' ? 'bg-indigo-600 text-white' : 'text-gray-400 hover:text-white'}`}
            >
              <Calendar className="h-4 w-4" /> Calendário
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card-aura">
          <p className="text-xs text-gray-500 mb-1">A pagar</p>
          <p className="text-xl font-bold text-yellow-400">{totalPendente.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          <p className="text-xs text-gray-500 mt-1">{obrigacoesFiltradas.filter(o => o.status === 'pendente').length} obrigações</p>
        </div>
        <div className="card-aura">
          <p className="text-xs text-gray-500 mb-1">Pago</p>
          <p className="text-xl font-bold text-green-400">{totalPago.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          <p className="text-xs text-gray-500 mt-1">{obrigacoesFiltradas.filter(o => o.status === 'pago').length} obrigações</p>
        </div>
        <div className="card-aura">
          <p className="text-xs text-gray-500 mb-1">Vencido</p>
          <p className="text-xl font-bold text-red-400">{totalVencido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
          <p className="text-xs text-gray-500 mt-1">{obrigacoesFiltradas.filter(o => o.status === 'vencido').length} obrigações</p>
        </div>
      </div>

      {/* Month selector + filter */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <button onClick={() => { if (mes === 0) { setMes(11); setAno(a => a - 1); } else setMes(m => m - 1); }}
            className="btn-ghost p-1.5"><ChevronLeft className="h-4 w-4" /></button>
          <span className="text-white font-medium min-w-[140px] text-center">{MESES[mes]} {ano}</span>
          <button onClick={() => { if (mes === 11) { setMes(0); setAno(a => a + 1); } else setMes(m => m + 1); }}
            className="btn-ghost p-1.5"><ChevronRight className="h-4 w-4" /></button>
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <Filter className="h-4 w-4 text-gray-400" />
          <select
            value={tipoFiltro}
            onChange={e => setTipoFiltro(e.target.value)}
            className="bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-1.5 text-sm text-white outline-none focus:border-indigo-500"
          >
            <option value="todos">Todos os tipos</option>
            {(['DAS', 'DARF', 'GPS', 'FGTS', 'IRPJ', 'CSLL', 'ISS'] as ObrigacaoTipo[]).map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Main view */}
        <div className="xl:col-span-2">
          {view === 'lista' ? (
            <div className="card-aura space-y-3">
              <h2 className="text-lg font-semibold text-white mb-2">{MESES[mes]} {ano}</h2>
              {obrigacoesFiltradas.length === 0 ? (
                <div className="text-center py-12">
                  <Calendar className="h-12 w-12 text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-400 text-sm">Nenhuma obrigação neste período.</p>
                </div>
              ) : (
                obrigacoesFiltradas.sort((a, b) => a.vencimento.localeCompare(b.vencimento)).map(o => {
                  const cfg = statusConfig[o.status];
                  const StatusIcon = cfg.icon;
                  return (
                    <div key={o.id} className="flex items-center gap-4 p-4 bg-[#0f1117] rounded-lg border border-[#1e2740] hover:border-indigo-500/40 transition-colors">
                      <div className={`flex-shrink-0 h-10 w-10 rounded-lg flex items-center justify-center ${cfg.bg} border ${cfg.border}`}>
                        <StatusIcon className={`h-5 w-5 ${cfg.color}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${tipoColors[o.tipo]}`}>{o.tipo}</span>
                          <p className="text-white text-sm font-medium truncate">{o.descricao}</p>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span>Venc: {new Date(o.vencimento + 'T12:00:00').toLocaleDateString('pt-BR')}</span>
                          <span>Comp: {o.competencia}</span>
                          {o.codigoReceita && <span>Código: {o.codigoReceita}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0">
                        <div className="text-right">
                          <p className="text-white font-medium font-mono">{o.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full ${cfg.bg} ${cfg.color} border ${cfg.border}`}>{cfg.label}</span>
                        </div>
                        {o.status === 'pendente' && (
                          <button onClick={() => marcarPago(o.id)} className="btn-ghost text-xs text-green-400 hover:text-green-300 border border-green-400/20 hover:border-green-400/40 px-3 py-1.5">
                            Marcar como pago
                          </button>
                        )}
                        {o.status === 'vencido' && (
                          <button onClick={() => marcarPago(o.id)} className="btn-ghost text-xs text-red-400 hover:text-red-300 border border-red-400/20 hover:border-red-400/40 px-3 py-1.5">
                            Regularizar
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="card-aura">
              <h2 className="text-lg font-semibold text-white mb-4">{MESES[mes]} {ano}</h2>
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
                  <div key={d} className="text-center text-xs text-gray-500 font-medium py-1">{d}</div>
                ))}
              </div>
              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: primeiroDia }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}
                {Array.from({ length: diasNoMes }).map((_, i) => {
                  const dia = i + 1;
                  const obs = diasComObrigacoes[dia] || [];
                  const temVencido = obs.some(o => o.status === 'vencido');
                  const temPendente = obs.some(o => o.status === 'pendente');
                  const hoje = new Date();
                  const isHoje = hoje.getDate() === dia && hoje.getMonth() === mes && hoje.getFullYear() === ano;
                  return (
                    <div
                      key={dia}
                      className={`aspect-square rounded-lg p-1 flex flex-col items-center justify-start text-sm transition-colors ${
                        isHoje ? 'bg-indigo-600/30 border border-indigo-500/50' : obs.length > 0 ? 'bg-[#0f1117] border border-[#1e2740] hover:border-indigo-500/40' : 'hover:bg-white/5'
                      }`}
                    >
                      <span className={`text-xs font-medium ${isHoje ? 'text-indigo-400' : 'text-gray-400'}`}>{dia}</span>
                      {obs.length > 0 && (
                        <div className="flex flex-wrap gap-0.5 mt-0.5 justify-center">
                          {obs.slice(0, 2).map(o => (
                            <span key={o.id} className={`w-1.5 h-1.5 rounded-full ${o.status === 'pago' ? 'bg-green-400' : o.status === 'vencido' ? 'bg-red-400' : 'bg-yellow-400'}`} title={o.descricao} />
                          ))}
                          {obs.length > 2 && <span className="text-[8px] text-gray-500">+{obs.length - 2}</span>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[#1e2740]">
                <div className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2 h-2 rounded-full bg-green-400" />Pago</div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2 h-2 rounded-full bg-yellow-400" />Pendente</div>
                <div className="flex items-center gap-1.5 text-xs text-gray-400"><span className="w-2 h-2 rounded-full bg-red-400" />Vencido</div>
              </div>
            </div>
          )}
        </div>

        {/* Próximas 30 dias */}
        <div className="card-aura">
          <h3 className="text-base font-semibold text-white mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-yellow-400" />
            Próximos 30 dias
          </h3>
          {proximas30.length === 0 ? (
            <div className="text-center py-8">
              <CheckCircle className="h-8 w-8 text-green-400 mx-auto mb-2" />
              <p className="text-gray-400 text-sm">Nenhum vencimento próximo!</p>
            </div>
          ) : (
            <div className="space-y-2">
              {proximas30.map(o => {
                const dias = Math.ceil((new Date(o.vencimento).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={o.id} className="p-3 bg-[#0f1117] rounded-lg border border-[#1e2740]">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${tipoColors[o.tipo]}`}>{o.tipo}</span>
                      <span className={`text-xs font-medium ${dias <= 5 ? 'text-red-400' : dias <= 10 ? 'text-yellow-400' : 'text-gray-400'}`}>
                        {dias === 0 ? 'Hoje' : `${dias}d`}
                      </span>
                    </div>
                    <p className="text-white text-xs truncate">{o.descricao}</p>
                    <p className="text-gray-400 text-xs mt-1">{o.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

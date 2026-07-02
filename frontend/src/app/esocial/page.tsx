'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Briefcase, Send, CheckCircle, AlertCircle, Clock, RefreshCw, Plus } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

const LISTAR_EVENTOS = gql`
  query ListarEventosEsocial($companyId: ID!, $status: String) {
    listarEventosEsocial(companyId: $companyId, status: $status) {
      id tipoEvento grupo status referenceMonth nrRecibo errorMessage createdAt
    }
  }
`;

const DASHBOARD = gql`
  query EsocialDashboard($companyId: ID!) {
    esocialDashboard(companyId: $companyId) {
      total pendentes enviados processados erros
    }
  }
`;

const GERAR_S1000 = gql`mutation GerarS1000($companyId: ID!) { gerarS1000(companyId: $companyId) { id tipoEvento status } }`;
const GERAR_S1200 = gql`mutation GerarS1200($companyId: ID!, $referenceMonth: String!) { gerarS1200(companyId: $companyId, referenceMonth: $referenceMonth) { id tipoEvento status } }`;
const GERAR_S1299 = gql`mutation GerarS1299($companyId: ID!, $referenceMonth: String!) { gerarS1299(companyId: $companyId, referenceMonth: $referenceMonth) { id tipoEvento status } }`;
const TRANSMITIR = gql`mutation TransmitirLote($eventIds: [ID!]!) { transmitirLoteEsocial(eventIds: $eventIds) { loteId nrRecibo eventCount status } }`;

const STATUS_COLORS: Record<string, string> = {
  pendente: 'text-warn bg-yellow-400/10',
  enviado: 'text-info bg-blue-400/10',
  processado: 'text-ok bg-green-400/10',
  erro: 'text-err bg-red-400/10',
};

const STATUS_ICONS: Record<string, any> = {
  pendente: Clock,
  enviado: Send,
  processado: CheckCircle,
  erro: AlertCircle,
};

export default function EsocialPage() {
  const { selectedCompany } = useCompany();
  const [refMonth, setRefMonth] = useState(new Date().toISOString().substring(0, 7));
  const [selected, setSelected] = useState<string[]>([]);
  const [msg, setMsg] = useState('');

  const companyId = selectedCompany?.id ?? '';

  const { data: dash, refetch: refetchDash } = useQuery(DASHBOARD, { variables: { companyId }, skip: !companyId });
  const { data: evData, refetch } = useQuery(LISTAR_EVENTOS, { variables: { companyId }, skip: !companyId });

  const [gerarS1000] = useMutation(GERAR_S1000, { onCompleted: () => { setMsg('S-1000 gerado!'); refetch(); refetchDash(); } });
  const [gerarS1200] = useMutation(GERAR_S1200, { onCompleted: () => { setMsg('S-1200 gerado!'); refetch(); refetchDash(); } });
  const [gerarS1299] = useMutation(GERAR_S1299, { onCompleted: () => { setMsg('S-1299 gerado!'); refetch(); refetchDash(); } });
  const [transmitir] = useMutation(TRANSMITIR, {
    onCompleted: (d) => { setMsg(`Lote ${d.transmitirLoteEsocial.loteId} transmitido (${d.transmitirLoteEsocial.eventCount} eventos)`); setSelected([]); refetch(); refetchDash(); },
  });

  const eventos = evData?.listarEventosEsocial ?? [];
  const dashboard = dash?.esocialDashboard;

  const toggleSelect = (id: string) =>
    setSelected(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  if (!selectedCompany) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Building2 className="h-12 w-12 text-tx-faint mx-auto mb-4" />
          <p className="text-tx-muted">Selecione uma empresa no menu lateral</p>
          <Link href="/carteira" className="mt-4 inline-block text-acao hover:underline">Cadastrar empresa</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Briefcase className="h-7 w-7 text-acao" />
          <div>
            <h1 className="text-2xl font-bold text-tx-strong">eSocial</h1>
            <p className="text-tx-muted text-sm">Geração e transmissão de eventos</p>
          </div>
        </div>
        <button onClick={() => { refetch(); refetchDash(); }} className="text-tx-muted hover:text-tx-strong">
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {msg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-ok text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4" /> {msg}
          <button onClick={() => setMsg('')} className="ml-auto text-ok hover:opacity-80">✕</button>
        </div>
      )}

      {/* Dashboard */}
      {dashboard && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {[
            { label: 'Total', value: dashboard.total, color: 'text-tx-strong' },
            { label: 'Pendentes', value: dashboard.pendentes, color: 'text-warn' },
            { label: 'Enviados', value: dashboard.enviados, color: 'text-info' },
            { label: 'Processados', value: dashboard.processados, color: 'text-ok' },
            { label: 'Erros', value: dashboard.erros, color: 'text-err' },
          ].map(({ label, value, color }) => (
            <div key={label} className="bg-card border border-line rounded-xl p-4 text-center">
              <p className={`text-2xl font-bold ${color}`}>{value}</p>
              <p className="text-tx-muted text-xs mt-1">{label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="bg-card border border-line rounded-xl p-5 space-y-4">
        <h2 className="text-tx-strong font-semibold">Gerar Eventos</h2>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-tx-muted text-sm">Competência:</label>
            <input
              type="month"
              value={refMonth}
              onChange={e => setRefMonth(e.target.value)}
              className="bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>
          <button
            onClick={() => gerarS1000({ variables: { companyId } })}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <Plus className="h-4 w-4" /> S-1000 (Empregador)
          </button>
          <button
            onClick={() => gerarS1200({ variables: { companyId, referenceMonth: refMonth } })}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <Plus className="h-4 w-4" /> S-1200 (Remuneração)
          </button>
          <button
            onClick={() => gerarS1299({ variables: { companyId, referenceMonth: refMonth } })}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg text-sm transition-colors"
          >
            <Plus className="h-4 w-4" /> S-1299 (Fechamento)
          </button>
          {selected.length > 0 && (
            <button
              onClick={() => transmitir({ variables: { eventIds: selected } })}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm transition-colors ml-auto"
            >
              <Send className="h-4 w-4" /> Transmitir ({selected.length})
            </button>
          )}
        </div>
      </div>

      {/* Events list */}
      <div className="bg-card border border-line rounded-xl overflow-hidden">
        <div className="p-4 border-b border-line">
          <h2 className="text-tx-strong font-semibold">Eventos ({eventos.length})</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-tx-muted">
                <th className="px-4 py-3 text-left w-8">
                  <input type="checkbox" onChange={e => setSelected(e.target.checked ? eventos.filter((ev: any) => ev.status === 'pendente').map((ev: any) => ev.id) : [])} className="rounded" />
                </th>
                <th className="px-4 py-3 text-left">Evento</th>
                <th className="px-4 py-3 text-left">Grupo</th>
                <th className="px-4 py-3 text-left">Competência</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-left">Recibo</th>
                <th className="px-4 py-3 text-left">Data</th>
              </tr>
            </thead>
            <tbody>
              {eventos.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-tx-muted">Nenhum evento. Gere um evento acima.</td></tr>
              ) : eventos.map((ev: any) => {
                const Icon = STATUS_ICONS[ev.status] || Clock;
                return (
                  <tr key={ev.id} className="border-b border-line hover:bg-inset transition-colors">
                    <td className="px-4 py-3">
                      {ev.status === 'pendente' && (
                        <input type="checkbox" checked={selected.includes(ev.id)} onChange={() => toggleSelect(ev.id)} className="rounded" />
                      )}
                    </td>
                    <td className="px-4 py-3 text-tx-strong font-mono font-medium">{ev.tipoEvento}</td>
                    <td className="px-4 py-3 text-tx-muted">{ev.grupo}</td>
                    <td className="px-4 py-3 text-tx-muted">{ev.referenceMonth || '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${STATUS_COLORS[ev.status] || 'text-tx-muted bg-gray-400/10'}`}>
                        <Icon className="h-3 w-3" /> {ev.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-tx-muted font-mono text-xs">{ev.nrRecibo || '—'}</td>
                    <td className="px-4 py-3 text-tx-muted text-xs">{new Date(ev.createdAt).toLocaleDateString('pt-BR')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

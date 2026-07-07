'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Briefcase, Send, CheckCircle, AlertCircle, Clock, RefreshCw, Plus } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { PageHeader, SectionTitle, COLORS, tint, EmptyState, Kpi, StatusChip, StatusTone } from '@/components/ui/kit';

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

const STATUS_TONES: Record<string, StatusTone> = {
  pendente: 'pendente',
  enviado: 'processando',
  processado: 'ok',
  erro: 'critico',
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
      <div className="page">
        <EmptyState icon={<Building2 size={40} />} title="Selecione uma empresa no menu lateral" />
        <div className="flex justify-center">
          <Link href="/carteira" className="btn-primary">Cadastrar empresa</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="page space-y-6">
      <PageHeader
        icon={<Briefcase size={22} color={COLORS.acao} />}
        title="eSocial"
        subtitle="Geração e transmissão de eventos"
        action={
          <button onClick={() => { refetch(); refetchDash(); }} className="btn-ghost" title="Atualizar">
            <RefreshCw className="h-5 w-5" />
          </button>
        }
      />

      {msg && (
        <div className="rounded-lg p-3 text-ok text-sm flex items-center gap-2"
          style={{ background: tint(COLORS.dotOk, 10), border: `1px solid ${tint(COLORS.dotOk, 30)}` }}>
          <CheckCircle className="h-4 w-4" /> {msg}
          <button onClick={() => setMsg('')} className="ml-auto text-ok hover:opacity-80">✕</button>
        </div>
      )}

      {/* Dashboard */}
      {dashboard && (
        <div className="flex flex-wrap gap-3">
          <Kpi label="Total" value={dashboard.total} />
          <Kpi label="Pendentes" value={dashboard.pendentes} cor={COLORS.atencao} />
          <Kpi label="Enviados" value={dashboard.enviados} cor={COLORS.info} />
          <Kpi label="Processados" value={dashboard.processados} cor={COLORS.ok} />
          <Kpi label="Erros" value={dashboard.erros} cor={COLORS.erro} />
        </div>
      )}

      {/* Actions */}
      <div className="card-aura space-y-4">
        <h3 className="text-[15px] font-semibold text-tx-strong m-0">Gerar Eventos</h3>
        <div className="flex flex-wrap gap-3 items-center">
          <div className="flex items-center gap-2">
            <label className="text-tx-muted text-sm">Competência:</label>
            <input
              type="month"
              value={refMonth}
              onChange={e => setRefMonth(e.target.value)}
              className="input-aura"
            />
          </div>
          <button
            onClick={() => gerarS1000({ variables: { companyId } })}
            className="btn-secondary"
          >
            <Plus className="h-4 w-4" /> S-1000 (Empregador)
          </button>
          <button
            onClick={() => gerarS1200({ variables: { companyId, referenceMonth: refMonth } })}
            className="btn-secondary"
          >
            <Plus className="h-4 w-4" /> S-1200 (Remuneração)
          </button>
          <button
            onClick={() => gerarS1299({ variables: { companyId, referenceMonth: refMonth } })}
            className="btn-secondary"
          >
            <Plus className="h-4 w-4" /> S-1299 (Fechamento)
          </button>
          {selected.length > 0 && (
            <button
              onClick={() => transmitir({ variables: { eventIds: selected } })}
              className="btn-primary ml-auto"
            >
              <Send className="h-4 w-4" /> Transmitir ({selected.length})
            </button>
          )}
        </div>
      </div>

      {/* Events list */}
      <div>
        <SectionTitle>Eventos ({eventos.length})</SectionTitle>
        <div className="card-aura overflow-x-auto" style={{ padding: 0 }}>
          <table className="table-aura">
            <thead>
              <tr>
                <th className="w-8">
                  <input type="checkbox" onChange={e => setSelected(e.target.checked ? eventos.filter((ev: any) => ev.status === 'pendente').map((ev: any) => ev.id) : [])} className="rounded" />
                </th>
                <th>Evento</th>
                <th>Grupo</th>
                <th>Competência</th>
                <th>Status</th>
                <th>Recibo</th>
                <th>Data</th>
              </tr>
            </thead>
            <tbody>
              {eventos.length === 0 ? (
                <tr><td colSpan={7}><EmptyState icon={<Briefcase size={32} />} title="Nenhum evento. Gere um evento acima." /></td></tr>
              ) : eventos.map((ev: any) => (
                <tr key={ev.id}>
                  <td>
                    {ev.status === 'pendente' && (
                      <input type="checkbox" checked={selected.includes(ev.id)} onChange={() => toggleSelect(ev.id)} className="rounded" />
                    )}
                  </td>
                  <td className="text-tx-strong font-mono font-medium">{ev.tipoEvento}</td>
                  <td className="text-tx-muted">{ev.grupo}</td>
                  <td className="text-tx-muted">{ev.referenceMonth || '—'}</td>
                  <td>
                    <StatusChip tone={STATUS_TONES[ev.status] ?? 'pendente'} label={ev.status} size="sm" />
                  </td>
                  <td className="text-tx-muted font-mono text-xs">{ev.nrRecibo || '—'}</td>
                  <td className="text-tx-muted text-xs">{new Date(ev.createdAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

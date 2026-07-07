'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Globe, Plus, MessageSquare, Send, Copy, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { PageHeader, EmptyState, COLORS } from '@/components/ui/kit';

const LISTAR = gql`query ListarPortais($companyId: ID!) { listarPortaisCliente(companyId: $companyId) { id clientName clientEmail active lastAccessAt createdAt } }`;
const MENSAGENS = gql`query Mensagens($portalId: ID!) { listarMensagensPortal(portalId: $portalId) { id sender message readAt createdAt } }`;
const CRIAR = gql`mutation CriarPortal($companyId: ID!, $clientName: String!, $clientEmail: String!, $clientPhone: String) { criarPortalCliente(companyId: $companyId, clientName: $clientName, clientEmail: $clientEmail, clientPhone: $clientPhone) { id clientName accessToken linkAcesso active } }`;
const RESPONDER = gql`mutation Responder($mensagemId: ID!, $portalId: ID!, $resposta: String!) { responderMensagemPortal(mensagemId: $mensagemId, portalId: $portalId, resposta: $resposta) { id sender message } }`;
const ENVIAR = gql`mutation Enviar($portalId: ID!, $conteudo: String!) { enviarMensagemPortal(portalId: $portalId, conteudo: $conteudo) { id sender message } }`;

export default function PortalClientePage() {
  const { selectedCompany } = useCompany();
  const [showForm, setShowForm] = useState(false);
  const [selectedPortal, setSelectedPortal] = useState<any>(null);
  const [resposta, setResposta] = useState('');
  const [msg, setMsg] = useState('');
  const [copied, setCopied] = useState('');

  const [form, setForm] = useState({ clientName: '', clientEmail: '', clientPhone: '' });

  const companyId = selectedCompany?.id ?? '';
  const { data, refetch } = useQuery(LISTAR, { variables: { companyId }, skip: !companyId });
  const { data: msgData, refetch: refetchMsgs } = useQuery(MENSAGENS, { variables: { portalId: selectedPortal?.id }, skip: !selectedPortal });

  const [criar, { data: criadoData }] = useMutation(CRIAR, {
    onCompleted: d => { setMsg('Portal criado!'); setShowForm(false); refetch(); },
    onError: e => setMsg('Erro: ' + e.message),
  });
  const [responderMsg] = useMutation(RESPONDER, {
    onCompleted: () => { setResposta(''); refetchMsgs(); },
  });
  const [enviarMsg] = useMutation(ENVIAR, {
    onCompleted: () => { setResposta(''); refetchMsgs(); },
  });

  const portais = data?.listarPortaisCliente ?? [];
  const mensagens = msgData?.listarMensagensPortal ?? [];
  const novasMsgs = mensagens.filter((m: any) => m.sender === 'cliente' && !m.readAt).length;
  const linkCriado = criadoData?.criarPortalCliente?.linkAcesso;

  const copyLink = (link: string) => {
    navigator.clipboard.writeText(link);
    setCopied(link);
    setTimeout(() => setCopied(''), 2000);
  };

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
    <div className="page space-y-6">
      <PageHeader
        icon={<Globe size={22} color={COLORS.acao} />}
        title="Portal do Cliente"
        subtitle="Acesso seguro para seus clientes"
        action={
          <button onClick={() => setShowForm(!showForm)} className="btn-primary">
            <Plus className="h-4 w-4" /> Criar Portal
          </button>
        }
      />

      {msg && (
        <div className="bg-[color-mix(in_srgb,var(--dot-ok)_10%,transparent)] border border-[color-mix(in_srgb,var(--dot-ok)_30%,transparent)] rounded-lg p-3 text-ok text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4" /> {msg} <button onClick={() => setMsg('')} className="ml-auto">✕</button>
        </div>
      )}

      {linkCriado && (
        <div className="bg-[color-mix(in_srgb,var(--acao)_10%,transparent)] border border-[color-mix(in_srgb,var(--acao)_30%,transparent)] rounded-xl p-4">
          <p className="text-acao font-semibold mb-2">Portal criado! Compartilhe o link com o cliente:</p>
          <div className="flex items-center gap-2 bg-inset rounded-lg px-3 py-2">
            <span className="text-tx text-sm flex-1 truncate font-mono">{linkCriado}</span>
            <button onClick={() => copyLink(linkCriado)} className="text-acao hover:opacity-80 flex-shrink-0">
              {copied === linkCriado ? <CheckCircle className="h-4 w-4 text-ok" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="card-aura space-y-4">
          <h2 className="text-tx-strong font-semibold text-[15px]">Novo Portal de Cliente</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: 'Nome do Cliente', key: 'clientName', type: 'text' },
              { label: 'E-mail', key: 'clientEmail', type: 'email' },
              { label: 'Telefone (opcional)', key: 'clientPhone', type: 'tel' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="text-tx-muted text-sm block mb-1">{label}</label>
                <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="input-aura w-full" />
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="btn-secondary">Cancelar</button>
            <button
              disabled={!form.clientName || !form.clientEmail}
              onClick={() => criar({ variables: { companyId, ...form } })}
              className="btn-primary flex-1 justify-center">
              Criar Portal
            </button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Portal list */}
        <div className="md:col-span-1 space-y-3">
          <h2 className="text-tx-strong font-semibold text-[15px]">Portais ({portais.length})</h2>
          {portais.length === 0 ? (
            <div className="card-aura">
              <EmptyState icon={<Globe size={28} />} title="Nenhum portal criado" />
            </div>
          ) : portais.map((p: any) => (
            <button
              key={p.id}
              onClick={() => setSelectedPortal(p)}
              className={`w-full text-left bg-card border rounded-xl p-4 transition-all ${selectedPortal?.id === p.id ? 'border-[color-mix(in_srgb,var(--acao)_50%,transparent)]' : 'border-line hover:border-[color-mix(in_srgb,var(--acao)_40%,transparent)]'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-tx font-medium text-sm">{p.clientName}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${p.active ? 'bg-[color-mix(in_srgb,var(--dot-ok)_13%,transparent)] text-ok' : 'bg-inset text-tx-muted'}`}>
                  {p.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <p className="text-tx-muted text-xs">{p.clientEmail}</p>
              <p className="text-tx-faint text-xs mt-1">
                {p.lastAccessAt ? `Último acesso: ${new Date(p.lastAccessAt).toLocaleDateString('pt-BR')}` : 'Nunca acessado'}
              </p>
            </button>
          ))}
        </div>

        {/* Chat */}
        {selectedPortal && (
          <div className="md:col-span-2 bg-card border border-line rounded-xl flex flex-col h-[500px]">
            <div className="p-4 border-b border-line flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-acao" />
              <span className="text-tx-strong font-medium">Chat — {selectedPortal.clientName}</span>
              {novasMsgs > 0 && <span className="ml-auto text-xs bg-err text-white px-2 py-0.5 rounded-full">{novasMsgs} nova(s)</span>}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {mensagens.length === 0 ? (
                <div className="text-center py-8 text-tx-muted text-sm">Nenhuma mensagem ainda.</div>
              ) : mensagens.map((m: any) => (
                <div key={m.id} className={`flex ${m.sender === 'contador' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${m.sender === 'contador' ? 'bg-acao text-white' : 'bg-inset border border-line text-tx'}`}>
                    <p className="text-sm">{m.message}</p>
                    <p className={`text-xs mt-1 ${m.sender === 'contador' ? 'text-white/70' : 'text-tx-faint'}`}>
                      {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-line flex gap-2">
              <input
                value={resposta}
                onChange={e => setResposta(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && resposta.trim() && enviarMsg({ variables: { portalId: selectedPortal.id, conteudo: resposta } })}
                placeholder="Responder ao cliente..."
                className="input-aura flex-1"
              />
              <button
                disabled={!resposta.trim()}
                onClick={() => enviarMsg({ variables: { portalId: selectedPortal.id, conteudo: resposta } })}
                className="btn-primary px-3"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

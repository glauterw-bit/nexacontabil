'use client';
import { useState } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { gql } from '@apollo/client';
import { useCompany } from '@/contexts/CompanyContext';
import { Globe, Plus, MessageSquare, Send, Copy, CheckCircle } from 'lucide-react';
import Link from 'next/link';
import { Building2 } from 'lucide-react';

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
          <Building2 className="h-12 w-12 text-gray-600 mx-auto mb-4" />
          <p className="text-gray-400">Selecione uma empresa no menu lateral</p>
          <Link href="/carteira" className="mt-4 inline-block text-indigo-400 hover:underline">Cadastrar empresa</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 p-6 space-y-6 overflow-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Globe className="h-7 w-7 text-indigo-400" />
          <div>
            <h1 className="text-2xl font-bold text-white">Portal do Cliente</h1>
            <p className="text-gray-400 text-sm">Acesso seguro para seus clientes</p>
          </div>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm transition-colors">
          <Plus className="h-4 w-4" /> Criar Portal
        </button>
      </div>

      {msg && (
        <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 text-green-400 text-sm flex items-center gap-2">
          <CheckCircle className="h-4 w-4" /> {msg} <button onClick={() => setMsg('')} className="ml-auto">✕</button>
        </div>
      )}

      {linkCriado && (
        <div className="bg-indigo-500/10 border border-indigo-500/30 rounded-xl p-4">
          <p className="text-indigo-400 font-semibold mb-2">Portal criado! Compartilhe o link com o cliente:</p>
          <div className="flex items-center gap-2 bg-[#0f1117] rounded-lg px-3 py-2">
            <span className="text-gray-300 text-sm flex-1 truncate font-mono">{linkCriado}</span>
            <button onClick={() => copyLink(linkCriado)} className="text-indigo-400 hover:text-indigo-300 flex-shrink-0">
              {copied === linkCriado ? <CheckCircle className="h-4 w-4 text-green-400" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <div className="bg-[#161b2e] border border-indigo-500/30 rounded-xl p-5 space-y-4">
          <h2 className="text-white font-semibold">Novo Portal de Cliente</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { label: 'Nome do Cliente', key: 'clientName', type: 'text' },
              { label: 'E-mail', key: 'clientEmail', type: 'email' },
              { label: 'Telefone (opcional)', key: 'clientPhone', type: 'tel' },
            ].map(({ label, key, type }) => (
              <div key={key}>
                <label className="text-gray-400 text-sm block mb-1">{label}</label>
                <input type={type} value={(form as any)[key]} onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))}
                  className="w-full bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500" />
              </div>
            ))}
          </div>
          <div className="flex gap-3">
            <button onClick={() => setShowForm(false)} className="px-4 py-2 border border-[#1e2740] text-gray-400 hover:text-white rounded-lg text-sm">Cancelar</button>
            <button
              disabled={!form.clientName || !form.clientEmail}
              onClick={() => criar({ variables: { companyId, ...form } })}
              className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white py-2 rounded-lg text-sm transition-colors">
              Criar Portal
            </button>
          </div>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-6">
        {/* Portal list */}
        <div className="md:col-span-1 space-y-3">
          <h2 className="text-white font-semibold">Portais ({portais.length})</h2>
          {portais.length === 0 ? (
            <div className="bg-[#161b2e] border border-[#1e2740] rounded-xl p-6 text-center">
              <Globe className="h-8 w-8 text-gray-600 mx-auto mb-2" />
              <p className="text-gray-500 text-sm">Nenhum portal criado</p>
            </div>
          ) : portais.map((p: any) => (
            <button
              key={p.id}
              onClick={() => setSelectedPortal(p)}
              className={`w-full text-left bg-[#161b2e] border rounded-xl p-4 transition-all ${selectedPortal?.id === p.id ? 'border-indigo-500/50' : 'border-[#1e2740] hover:border-[#2e3750]'}`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className="text-white font-medium text-sm">{p.clientName}</p>
                <span className={`text-xs px-2 py-0.5 rounded-full ${p.active ? 'bg-green-500/10 text-green-400' : 'bg-gray-500/10 text-gray-400'}`}>
                  {p.active ? 'Ativo' : 'Inativo'}
                </span>
              </div>
              <p className="text-gray-400 text-xs">{p.clientEmail}</p>
              <p className="text-gray-600 text-xs mt-1">
                {p.lastAccessAt ? `Último acesso: ${new Date(p.lastAccessAt).toLocaleDateString('pt-BR')}` : 'Nunca acessado'}
              </p>
            </button>
          ))}
        </div>

        {/* Chat */}
        {selectedPortal && (
          <div className="md:col-span-2 bg-[#161b2e] border border-[#1e2740] rounded-xl flex flex-col h-[500px]">
            <div className="p-4 border-b border-[#1e2740] flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-indigo-400" />
              <span className="text-white font-medium">Chat — {selectedPortal.clientName}</span>
              {novasMsgs > 0 && <span className="ml-auto text-xs bg-red-500 text-white px-2 py-0.5 rounded-full">{novasMsgs} nova(s)</span>}
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {mensagens.length === 0 ? (
                <div className="text-center py-8 text-gray-500 text-sm">Nenhuma mensagem ainda.</div>
              ) : mensagens.map((m: any) => (
                <div key={m.id} className={`flex ${m.sender === 'contador' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-xl px-4 py-2.5 ${m.sender === 'contador' ? 'bg-indigo-600 text-white' : 'bg-[#0f1117] border border-[#1e2740] text-gray-300'}`}>
                    <p className="text-sm">{m.message}</p>
                    <p className={`text-xs mt-1 ${m.sender === 'contador' ? 'text-indigo-300' : 'text-gray-600'}`}>
                      {new Date(m.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-[#1e2740] flex gap-2">
              <input
                value={resposta}
                onChange={e => setResposta(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && !e.shiftKey && resposta.trim() && enviarMsg({ variables: { portalId: selectedPortal.id, conteudo: resposta } })}
                placeholder="Responder ao cliente..."
                className="flex-1 bg-[#0f1117] border border-[#1e2740] rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-indigo-500"
              />
              <button
                disabled={!resposta.trim()}
                onClick={() => enviarMsg({ variables: { portalId: selectedPortal.id, conteudo: resposta } })}
                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-700 text-white p-2 rounded-lg transition-colors"
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

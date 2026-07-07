'use client';
import { useState, useEffect, useCallback } from 'react';
import axios from 'axios';
import {
  Phone, Plus, Trash2, RefreshCw, QrCode, CheckCircle2,
  XCircle, Loader2, MessageSquare, FileText, Mic, ChevronRight, ChevronDown,
  Wifi, WifiOff, Bot, User, Building2, Power, PowerOff, Volume2,
  Receipt, TrendingUp, AlertTriangle, Lightbulb, Package, Percent
} from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { PageHeader, SectionTitle, StatusChip, EmptyState, COLORS } from '@/components/ui/kit';
import Link from 'next/link';

const AI_URL = process.env.NEXT_PUBLIC_AI_URL || 'http://localhost:8001';

interface Instance {
  instance_name: string;
  status: string;
  phone_number: string;
  company_id: string;
  company_name: string;
  attendant_name: string;
  ai_enabled: boolean;
  tts_voice_gender: string;
}

interface Conversation {
  phone: string;
  instance: string;
  stage: string;
  client_name: string | null;
  client_cnpj: string | null;
  messages: number;
  docs: number;
  updated_at: string;
}

interface ConvDetail {
  phone: string;
  stage: string;
  client_name: string | null;
  client_cnpj: string | null;
  messages: Array<{ role: string; content: string; type: string; timestamp: string }>;
  collected_docs: any[];
}

const stageLabel: Record<string, string> = {
  greeting: 'Saudação',
  identify: 'Identificando',
  collect_docs: 'Coletando Docs',
  ask_details: 'Detalhes',
  process: 'Processando',
  review: 'Revisão',
  completed: 'Concluído',
};

const stageColor: Record<string, string> = {
  greeting: 'text-tx-muted',
  identify: 'text-warn',
  collect_docs: 'text-info',
  ask_details: 'text-info',
  process: 'text-info',
  review: 'text-warn',
  completed: 'text-ok',
};

export default function WhatsAppPage() {
  const { selectedCompany } = useCompany();
  const [instances, setInstances] = useState<Instance[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConv, setSelectedConv] = useState<ConvDetail | null>(null);
  const [qrcode, setQrcode] = useState<{ instance: string; data: string } | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(false);
  const [togglingAI, setTogglingAI] = useState<string | null>(null);
  const [togglingVoice, setTogglingVoice] = useState<string | null>(null);
  const [expandedDoc, setExpandedDoc] = useState<number | null>(null);
  const [form, setForm] = useState({
    instance_name: '',
    phone_number: '',
    attendant_name: 'Ana',
  });

  const loadInstances = useCallback(async () => {
    try {
      const r = await axios.get(`${AI_URL}/api/v1/whatsapp/instances`);
      const filtered = (r.data as Instance[]).filter(
        i => !selectedCompany || i.company_id === selectedCompany.id
      );
      setInstances(filtered);
    } catch {
      setInstances([]);
    }
  }, [selectedCompany?.id]);

  const loadConversations = useCallback(async () => {
    if (!selectedCompany) return;
    try {
      const r = await axios.get(`${AI_URL}/api/v1/whatsapp/conversations`, {
        params: { company_id: selectedCompany.id },
      });
      setConversations(r.data as Conversation[]);
    } catch {
      setConversations([]);
    }
  }, [selectedCompany?.id]);

  useEffect(() => {
    loadInstances();
    loadConversations();
    const interval = setInterval(() => {
      loadInstances();
      loadConversations();
    }, 5000); // atualiza a cada 5s para espelhar conversas
    return () => clearInterval(interval);
  }, [loadInstances, loadConversations]);

  const createInstance = async () => {
    if (!selectedCompany || !form.instance_name || !form.phone_number) return;
    setLoading(true);
    try {
      await axios.post(`${AI_URL}/api/v1/whatsapp/instances`, {
        instance_name: form.instance_name,
        phone_number: form.phone_number,
        company_id: selectedCompany.id,
        company_name: selectedCompany.name,
        attendant_name: form.attendant_name,
        ai_enabled: true,
      });
      setShowCreate(false);
      setForm({ instance_name: '', phone_number: '', attendant_name: 'Ana' });
      await loadInstances();
      const instName = form.instance_name;
      try {
        const qr = await axios.get(`${AI_URL}/api/v1/whatsapp/instances/${encodeURIComponent(instName)}/qrcode`);
        setQrcode({ instance: instName, data: qr.data.qrcode });
      } catch {}
    } catch (e: any) {
      alert('Erro ao criar instância: ' + (e.response?.data?.detail || e.message));
    } finally {
      setLoading(false);
    }
  };

  const deleteInstance = async (name: string) => {
    if (!confirm(`Remover instância "${name}"?`)) return;
    await axios.delete(`${AI_URL}/api/v1/whatsapp/instances/${encodeURIComponent(name)}`);
    await loadInstances();
  };

  const showQR = async (name: string) => {
    try {
      const r = await axios.get(`${AI_URL}/api/v1/whatsapp/instances/${encodeURIComponent(name)}/qrcode`);
      setQrcode({ instance: name, data: r.data.qrcode });
    } catch {
      alert('QR Code não disponível. A instância pode já estar conectada.');
    }
  };

  const toggleAI = async (inst: Instance) => {
    setTogglingAI(inst.instance_name);
    try {
      await axios.patch(`${AI_URL}/api/v1/whatsapp/instances/${encodeURIComponent(inst.instance_name)}/toggle-ai`, {
        ai_enabled: !inst.ai_enabled,
      });
      // Atualiza localmente sem esperar o reload
      setInstances(prev => prev.map(i =>
        i.instance_name === inst.instance_name ? { ...i, ai_enabled: !i.ai_enabled } : i
      ));
    } catch (e: any) {
      alert('Erro ao alterar IA: ' + (e.response?.data?.detail || e.message));
    } finally {
      setTogglingAI(null);
    }
  };

  const toggleVoice = async (inst: Instance) => {
    setTogglingVoice(inst.instance_name);
    const newGender = inst.tts_voice_gender === 'female' ? 'male' : 'female';
    try {
      await axios.patch(`${AI_URL}/api/v1/whatsapp/instances/${encodeURIComponent(inst.instance_name)}/voice-gender`, {
        tts_voice_gender: newGender,
      });
      setInstances(prev => prev.map(i =>
        i.instance_name === inst.instance_name ? { ...i, tts_voice_gender: newGender } : i
      ));
    } catch (e: any) {
      alert('Erro ao alterar voz: ' + (e.response?.data?.detail || e.message));
    } finally {
      setTogglingVoice(null);
    }
  };

  const loadConvDetail = async (conv: Conversation) => {
    if (!selectedCompany) return;
    setExpandedDoc(null);
    try {
      const r = await axios.get(
        `${AI_URL}/api/v1/whatsapp/conversations/${encodeURIComponent(conv.instance)}/${conv.phone}`,
        { params: { company_id: selectedCompany.id } }
      );
      setSelectedConv(r.data);
    } catch {
      setSelectedConv(null);
    }
  };

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-8">
        <EmptyState icon={<Building2 size={34} />} title="Selecione uma empresa para gerenciar o WhatsApp." />
        <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="page space-y-8">
      <PageHeader
        icon={<MessageSquare size={22} color={COLORS.acao} />}
        title="WhatsApp IA"
        subtitle={`${selectedCompany.name} · Atendente contábil humanizado`}
        action={
          <button onClick={() => setShowCreate(true)} className="btn-primary">
            <Plus className="h-4 w-4" />
            Nova Instância
          </button>
        }
      />

      {/* Create Instance Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-line rounded-xl p-8 w-full max-w-md space-y-6 shadow-pop">
            <h2 className="text-[15px] font-semibold text-tx-strong m-0">Conectar WhatsApp</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-tx-muted mb-2">Nome da instância</label>
                <input
                  value={form.instance_name}
                  onChange={e => setForm(f => ({ ...f, instance_name: e.target.value }))}
                  placeholder="ex: contabilidade-cliente1"
                  className="input-aura w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-2">Número WhatsApp (com DDI e DDD)</label>
                <input
                  value={form.phone_number}
                  onChange={e => setForm(f => ({ ...f, phone_number: e.target.value.replace(/\D/g, '') }))}
                  placeholder="5511999998888"
                  className="input-aura w-full"
                />
              </div>
              <div>
                <label className="block text-sm text-tx-muted mb-2">Nome do atendente IA</label>
                <input
                  value={form.attendant_name}
                  onChange={e => setForm(f => ({ ...f, attendant_name: e.target.value }))}
                  placeholder="Ana"
                  className="input-aura w-full"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowCreate(false)} className="btn-secondary flex-1 justify-center">Cancelar</button>
              <button
                onClick={createInstance}
                disabled={loading || !form.instance_name || !form.phone_number}
                className="btn-primary flex-1 flex items-center justify-center gap-2 disabled:opacity-40"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
                Conectar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal */}
      {qrcode && (
        <div className="fixed inset-0 bg-[rgba(13,17,25,0.45)] backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-card border border-line rounded-xl p-8 w-full max-w-sm space-y-6 text-center shadow-pop">
            <div>
              <QrCode className="h-8 w-8 text-tx-muted mx-auto mb-2" />
              <h2 className="text-[15px] font-semibold text-tx-strong m-0">Escanear QR Code</h2>
              <p className="text-tx-muted text-sm mt-1">Instância: {qrcode.instance}</p>
            </div>
            <div className="bg-white p-4 rounded-xl inline-block">
              {qrcode.data.startsWith('data:') ? (
                <img src={qrcode.data} alt="QR Code" className="w-48 h-48" />
              ) : (
                <img src={`data:image/png;base64,${qrcode.data}`} alt="QR Code" className="w-48 h-48" />
              )}
            </div>
            <p className="text-tx-muted text-xs">Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo</p>
            <button onClick={() => setQrcode(null)} className="btn-secondary w-full justify-center">Fechar</button>
          </div>
        </div>
      )}

      {/* Instances Grid */}
      <div>
        <SectionTitle>
          <Phone size={16} className="text-tx-muted" />
          Instâncias Conectadas
        </SectionTitle>
        {instances.length === 0 ? (
          <div className="card-aura">
            <EmptyState icon={<Phone size={34} />} title="Nenhuma instância cadastrada."
              sub={'Clique em "Nova Instância" para conectar um número.'} />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {instances.map(inst => {
              const connected = inst.status === 'open' || inst.status === 'connected';
              const isToggling = togglingAI === inst.instance_name;
              const isTogglingVoice = togglingVoice === inst.instance_name;
              const isFemale = (inst.tts_voice_gender ?? 'female') === 'female';
              return (
                <div key={inst.instance_name} className="card-aura space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        {connected
                          ? <Wifi className="h-4 w-4 text-ok" />
                          : <WifiOff className="h-4 w-4 text-err" />}
                        <span className="font-medium text-tx-strong text-sm">{inst.instance_name}</span>
                      </div>
                      <p className="text-tx-muted text-xs mt-1">{inst.phone_number || '—'}</p>
                    </div>
                    <StatusChip tone={connected ? 'ok' : 'critico'} label={connected ? 'Online' : inst.status || 'Offline'} size="sm" />
                  </div>

                  <div className="flex items-center gap-2 text-xs text-tx-muted">
                    <Bot className="h-3.5 w-3.5 text-tx-muted" />
                    <span>Atendente: <strong className="text-tx-strong">{inst.attendant_name}</strong></span>
                  </div>

                  {/* Toggle IA */}
                  <div className="flex items-center justify-between bg-inset rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Bot className={`h-3.5 w-3.5 ${inst.ai_enabled ? 'text-ok' : 'text-tx-muted'}`} />
                      <span className="text-xs text-tx-muted">
                        IA: <span className={inst.ai_enabled ? 'text-ok font-medium' : 'text-tx-muted'}>
                          {inst.ai_enabled ? 'Ativada' : 'Desativada'}
                        </span>
                      </span>
                    </div>
                    <button
                      onClick={() => toggleAI(inst)}
                      disabled={isToggling}
                      className="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50"
                      style={{ background: inst.ai_enabled ? 'var(--dot-ok)' : 'var(--border)' }}
                    >
                      <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        inst.ai_enabled ? 'translate-x-4' : 'translate-x-1'
                      }`} />
                    </button>
                  </div>

                  {/* Toggle Voz */}
                  <div className="flex items-center justify-between bg-inset rounded-lg px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Volume2 className="h-3.5 w-3.5 text-tx-muted" />
                      <span className="text-xs text-tx-muted">
                        Voz: <span className="text-tx-strong font-medium">
                          {isFemale ? '♀ Feminina' : '♂ Masculina'}
                        </span>
                      </span>
                    </div>
                    <button
                      onClick={() => toggleVoice(inst)}
                      disabled={isTogglingVoice}
                      title={isFemale ? 'Trocar para masculina' : 'Trocar para feminina'}
                      className="btn-secondary"
                      style={{ padding: '4px 8px', fontSize: 12 }}
                    >
                      {isTogglingVoice
                        ? <Loader2 className="h-3 w-3 animate-spin" />
                        : <RefreshCw className="h-3 w-3" />}
                      Trocar
                    </button>
                  </div>

                  <div className="flex gap-2">
                    {!connected && (
                      <button
                        onClick={() => showQR(inst.instance_name)}
                        className="btn-ghost flex items-center gap-1.5 text-xs flex-1 justify-center"
                      >
                        <QrCode className="h-3.5 w-3.5" />
                        Reconectar
                      </button>
                    )}
                    <button
                      onClick={() => loadInstances()}
                      className="btn-ghost flex items-center gap-1.5 text-xs flex-1 justify-center"
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                      Atualizar
                    </button>
                    <button
                      onClick={() => deleteInstance(inst.instance_name)}
                      className="btn-ghost flex items-center gap-1.5 text-xs text-err flex-1 justify-center"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Remover
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Conversations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <SectionTitle>
            <MessageSquare size={16} className="text-tx-muted" />
            Conversas Ativas
            {conversations.length > 0 && (
              <span className="ml-auto text-xs bg-inset text-tx-muted border border-line px-2 py-0.5 rounded-full">
                {conversations.length}
              </span>
            )}
          </SectionTitle>
          {conversations.length === 0 ? (
            <div className="card-aura">
              <EmptyState icon={<MessageSquare size={28} />} title="Nenhuma conversa ativa."
                sub="Aguardando mensagens no WhatsApp..." />
            </div>
          ) : (
            <div className="card-aura space-y-2">
              {conversations.map((conv, i) => (
                <button
                  key={i}
                  onClick={() => loadConvDetail(conv)}
                  className="w-full flex items-center gap-4 p-3 bg-inset rounded-lg border border-line-soft hover:border-acao transition-colors text-left"
                >
                  <div className="h-10 w-10 rounded-full bg-card border border-line flex items-center justify-center flex-shrink-0">
                    <User className="h-5 w-5 text-tx-muted" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-tx-strong text-sm font-medium truncate">
                      {conv.client_name || conv.phone}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs ${stageColor[conv.stage] || 'text-tx-muted'}`}>
                        {stageLabel[conv.stage] || conv.stage}
                      </span>
                      {conv.docs > 0 && (
                        <span className="text-xs text-tx-muted flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {conv.docs} doc{conv.docs !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs text-tx-muted">{conv.messages} msgs</p>
                    <ChevronRight className="h-4 w-4 text-tx-faint ml-auto mt-1" />
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Conversation Detail */}
        {selectedConv && (
          <div className="space-y-4">
            {/* Header da conversa */}
            <SectionTitle>
              <MessageSquare size={16} className="text-tx-muted" />
              {selectedConv.client_name || selectedConv.phone}
            </SectionTitle>

            {/* Info resumida */}
            <div className="card-aura flex flex-wrap items-center gap-4 text-xs">
              <span className="text-tx-muted">Etapa: <span className={stageColor[selectedConv.stage]}>{stageLabel[selectedConv.stage]}</span></span>
              {selectedConv.client_cnpj && (
                <span className="text-tx-muted">CNPJ: <span className="text-tx-strong font-mono">{selectedConv.client_cnpj}</span></span>
              )}
              <span className="text-tx-muted">{selectedConv.collected_docs.length} documento(s) · {selectedConv.messages.length} mensagem(ns)</span>
            </div>

            {/* Documentos analisados */}
            {selectedConv.collected_docs.length > 0 && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-tx-strong flex items-center gap-2 m-0">
                  <Receipt className="h-4 w-4 text-tx-muted" />
                  Documentos Analisados pela IA
                </h3>
                {selectedConv.collected_docs.map((doc, i) => {
                  const d = doc.data || doc;
                  const isOpen = expandedDoc === i;
                  const taxes: any[] = d.taxes || [];
                  const items: any[] = d.line_items || [];
                  const alerts: string[] = d.alerts || [];
                  const suggestions: string[] = d.suggestions || [];
                  const fmt = (v: any) => v != null ? `R$ ${Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';
                  const typeLabel: Record<string, string> = {
                    nota_fiscal: 'Nota Fiscal', boleto: 'Boleto', extrato_bancario: 'Extrato Bancário',
                    contrato: 'Contrato', recibo: 'Recibo', other: 'Outro',
                  };
                  return (
                    <div key={i} className="bg-inset border border-line rounded-xl overflow-hidden">
                      {/* Cabeçalho clicável */}
                      <button
                        onClick={() => setExpandedDoc(isOpen ? null : i)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-card transition-colors text-left"
                      >
                        <FileText className="h-4 w-4 text-tx-muted flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-tx-strong text-sm font-medium">
                              {typeLabel[d.document_type] || d.document_type || 'Documento'}
                              {d.number ? ` nº ${d.number}` : ''}
                            </span>
                            {d.confidence_score != null && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full border border-line-soft bg-inset ${
                                d.confidence_score >= 0.8 ? 'text-ok'
                                : d.confidence_score >= 0.5 ? 'text-warn'
                                : 'text-err'
                              }`}>
                                {Math.round(d.confidence_score * 100)}%
                              </span>
                            )}
                          </div>
                          <p className="text-tx-muted text-xs truncate">
                            {d.issuer_name || '—'} {d.issue_date ? `· ${d.issue_date}` : ''}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          {d.total_value != null && (
                            <p className="num text-tx-strong font-mono text-sm font-semibold">{fmt(d.total_value)}</p>
                          )}
                          <ChevronDown className={`h-4 w-4 text-tx-muted ml-auto mt-0.5 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                        </div>
                      </button>

                      {/* Detalhes expandidos */}
                      {isOpen && (
                        <div className="border-t border-line px-4 py-4 space-y-4">
                          {/* Identificação */}
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            {d.issuer_name && (
                              <div>
                                <p className="text-tx-muted mb-0.5">Emitente</p>
                                <p className="text-tx-strong font-medium">{d.issuer_name}</p>
                                {d.issuer_cnpj && <p className="text-tx-muted font-mono">{d.issuer_cnpj}</p>}
                                {d.issuer_address && <p className="text-tx-muted mt-0.5">{d.issuer_address}</p>}
                              </div>
                            )}
                            {d.recipient_name && (
                              <div>
                                <p className="text-tx-muted mb-0.5">Destinatário</p>
                                <p className="text-tx-strong font-medium">{d.recipient_name}</p>
                                {d.recipient_cnpj && <p className="text-tx-muted font-mono">{d.recipient_cnpj}</p>}
                              </div>
                            )}
                          </div>

                          {/* Valores */}
                          <div className="grid grid-cols-3 gap-2 text-xs">
                            {d.total_value != null && (
                              <div className="bg-card border border-line rounded-lg px-3 py-2">
                                <p className="text-tx-muted">Total</p>
                                <p className="num text-tx-strong font-mono font-semibold">{fmt(d.total_value)}</p>
                              </div>
                            )}
                            {d.net_value != null && (
                              <div className="bg-card border border-line rounded-lg px-3 py-2">
                                <p className="text-tx-muted">Líquido</p>
                                <p className="text-tx-strong font-mono">{fmt(d.net_value)}</p>
                              </div>
                            )}
                            {d.discount != null && d.discount > 0 && (
                              <div className="bg-card border border-line rounded-lg px-3 py-2">
                                <p className="text-tx-muted">Desconto</p>
                                <p className="num text-warn font-mono">{fmt(d.discount)}</p>
                              </div>
                            )}
                            {d.freight != null && d.freight > 0 && (
                              <div className="bg-card border border-line rounded-lg px-3 py-2">
                                <p className="text-tx-muted">Frete</p>
                                <p className="text-tx-strong font-mono">{fmt(d.freight)}</p>
                              </div>
                            )}
                          </div>

                          {/* Datas e pagamento */}
                          <div className="flex flex-wrap gap-3 text-xs">
                            {d.issue_date && <span className="text-tx-muted">Emissão: <strong className="text-tx-strong">{d.issue_date}</strong></span>}
                            {d.due_date && <span className="text-tx-muted">Vencimento: <strong className="text-warn">{d.due_date}</strong></span>}
                            {d.payment_method && <span className="text-tx-muted">Pagamento: <strong className="text-tx-strong capitalize">{d.payment_method}</strong></span>}
                            {d.series && <span className="text-tx-muted">Série: <strong className="text-tx-strong">{d.series}</strong></span>}
                          </div>

                          {/* Impostos */}
                          {taxes.length > 0 && (
                            <div>
                              <p className="text-xs text-tx-muted flex items-center gap-1 mb-2">
                                <Percent className="h-3 w-3" /> Impostos
                              </p>
                              <div className="grid grid-cols-2 gap-1.5">
                                {taxes.map((t, ti) => (
                                  <div key={ti} className="bg-card border border-line rounded-lg px-3 py-2 text-xs">
                                    <div className="flex justify-between">
                                      <span className="text-tx-strong font-semibold">{t.name}</span>
                                      {t.rate != null && <span className="text-tx-muted">{t.rate}%</span>}
                                    </div>
                                    {t.value != null && <p className="text-tx-strong font-mono mt-0.5">{fmt(t.value)}</p>}
                                    {t.base != null && <p className="text-tx-muted">Base: {fmt(t.base)}</p>}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Itens/Serviços */}
                          {items.length > 0 && (
                            <div>
                              <p className="text-xs text-tx-muted flex items-center gap-1 mb-2">
                                <Package className="h-3 w-3" /> Itens / Serviços ({items.length})
                              </p>
                              <div className="space-y-1.5">
                                {items.map((it, ii) => (
                                  <div key={ii} className="bg-card border border-line rounded-lg px-3 py-2 text-xs">
                                    <div className="flex justify-between gap-2">
                                      <span className="text-tx flex-1">{it.description}</span>
                                      {it.total != null && <span className="num text-tx-strong font-mono flex-shrink-0">{fmt(it.total)}</span>}
                                    </div>
                                    <div className="flex gap-3 mt-1 text-tx-muted">
                                      {it.quantity != null && <span>Qtd: {it.quantity}</span>}
                                      {it.unit_price != null && <span>Unit: {fmt(it.unit_price)}</span>}
                                      {it.ncm && <span>NCM: {it.ncm}</span>}
                                      {it.cfop && <span>CFOP: {it.cfop}</span>}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Alertas */}
                          {alerts.length > 0 && (
                            <div className="rounded-lg px-3 py-2" style={{ border: '1px solid color-mix(in srgb, var(--atencao) 25%, transparent)', background: 'color-mix(in srgb, var(--atencao) 6%, transparent)' }}>
                              <p className="text-warn text-xs font-medium flex items-center gap-1 mb-1">
                                <AlertTriangle className="h-3 w-3" /> Alertas
                              </p>
                              {alerts.map((a, ai) => <p key={ai} className="text-warn text-xs">• {a}</p>)}
                            </div>
                          )}

                          {/* Sugestões */}
                          {suggestions.length > 0 && (
                            <div className="bg-inset border border-line-soft rounded-lg px-3 py-2">
                              <p className="text-tx-strong text-xs font-medium flex items-center gap-1 mb-1">
                                <Lightbulb className="h-3 w-3 text-tx-muted" /> Sugestões contábeis
                              </p>
                              {suggestions.map((s, si) => <p key={si} className="text-tx text-xs">• {s}</p>)}
                            </div>
                          )}

                          {d.description && (
                            <p className="text-xs text-tx-muted">Histórico: <span className="text-tx-muted">{d.description}</span></p>
                          )}
                          {d.bar_code && (
                            <p className="text-xs text-tx-muted font-mono break-all">Cód. barras: {d.bar_code}</p>
                          )}
                          <p className="text-xs text-tx-faint">Recebido: {doc.processed_at ? new Date(doc.processed_at).toLocaleString('pt-BR') : '—'}</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Chat */}
            <div className="card-aura space-y-3">
              <p className="text-xs text-tx-muted font-medium">Histórico da conversa</p>
              <div className="space-y-3 max-h-80 overflow-y-auto">
                {selectedConv.messages.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
                    <div className={`h-7 w-7 rounded-full flex-shrink-0 flex items-center justify-center ${
                      msg.role === 'user' ? 'bg-acao' : 'bg-card border border-line'
                    }`}>
                      {msg.role === 'user'
                        ? <User className="h-3.5 w-3.5 text-white" />
                        : <Bot className="h-3.5 w-3.5 text-tx-muted" />}
                    </div>
                    <div className={`max-w-xs rounded-xl px-3 py-2 text-xs leading-relaxed whitespace-pre-wrap ${
                      msg.role === 'user'
                        ? 'bg-acao text-white rounded-tr-sm'
                        : 'bg-card border border-line text-tx rounded-tl-sm'
                    }`}>
                      {msg.type === 'audio' && <Mic className="h-3 w-3 inline mr-1 opacity-70" />}
                      {(msg.type === 'image' || msg.type === 'document') && <FileText className="h-3 w-3 inline mr-1 opacity-70" />}
                      {msg.content}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Info Banner */}
      <div className="card-aura">
        <h3 className="text-tx-strong text-sm font-semibold mb-2 flex items-center gap-2 m-0">
          <Bot className="h-4 w-4 text-tx-muted" />
          Como funciona o Atendente IA
        </h3>
        <ul className="text-tx-muted text-sm space-y-1">
          <li>• O atendente responde como especialista contábil humanizado via Claude Sonnet</li>
          <li>• Aceita fotos de notas fiscais, boletos, PDFs — extrai dados automaticamente</li>
          <li>• Use o toggle para ativar/desativar a IA por instância a qualquer momento</li>
          <li>• Identifica o cliente, CNPJ e associa documentos à empresa correta</li>
          <li>• As conversas são espelhadas em tempo real nesta tela</li>
        </ul>
      </div>
    </div>
  );
}

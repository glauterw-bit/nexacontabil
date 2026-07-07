'use client';
import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, Bot, User, Loader2, Sparkles, Building2 } from 'lucide-react';
import { useCompany } from '@/contexts/CompanyContext';
import { PageHeader, StatusChip, EmptyState, COLORS } from '@/components/ui/kit';
import Link from 'next/link';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  suggested_actions?: string[];
}

const STARTERS = [
  'Qual foi o maior gasto da empresa no último mês?',
  'Existem notas fiscais com risco fiscal alto?',
  'Quais despesas não são dedutíveis para o IRPJ?',
  'Mostre um resumo do fluxo de caixa',
];

export default function CopilotPage() {
  const { selectedCompany } = useCompany();
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Olá! Sou o Copilot do DomoSYS. Posso responder perguntas sobre finanças, impostos, lançamentos contábeis e muito mais. Como posso ajudar?',
      suggested_actions: STARTERS,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Reset messages when company changes
  useEffect(() => {
    setMessages([{
      role: 'assistant',
      content: selectedCompany
        ? `Olá! Estou analisando os dados de **${selectedCompany.name}**. Como posso ajudar?`
        : 'Olá! Sou o Copilot do DomoSYS. Selecione uma empresa para começar.',
      suggested_actions: selectedCompany ? STARTERS : [],
    }]);
  }, [selectedCompany?.id]);

  const send = async (text: string) => {
    if (!text.trim() || loading || !selectedCompany) return;
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const token = localStorage.getItem('aura_token') ?? '';
      const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
      const res = await axios.post(
        `${API}/api/v1/copilot/chat`,
        {
          companyId: selectedCompany.id,
          question: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        },
        { headers: token ? { Authorization: `Bearer ${token}` } : {} }
      );
      const sources: string[] = res.data.sources ?? [];
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.data.answer,
          suggested_actions: sources.length
            ? [`Fontes consultadas: ${sources.join(' · ')}`]
            : undefined,
        },
      ]);
    } catch (err: any) {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: `Erro ao processar: ${err?.response?.data?.message ?? err?.message ?? 'desconhecido'}` },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!selectedCompany) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 p-8">
        <EmptyState icon={<Building2 size={34} />} title="Selecione uma empresa para usar o Copilot." />
        <Link href="/carteira" className="btn-primary">Gerenciar Empresas</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 border-b border-line">
        <PageHeader
          icon={<Bot size={22} color={COLORS.acao} />}
          title="Copilot Financeiro"
          subtitle={`${selectedCompany.name} · GPT-4o + RAG`}
          action={<StatusChip tone="ok" label="Online" size="sm" />}
        />
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center ${
              msg.role === 'user' ? 'bg-acao' : 'bg-card border border-line'
            }`}>
              {msg.role === 'user'
                ? <User className="h-4 w-4 text-white" />
                : <Bot className="h-4 w-4 text-tx-muted" />}
            </div>
            <div className={`max-w-2xl flex flex-col gap-2 ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-acao text-white rounded-tr-sm'
                  : 'bg-card border border-line text-tx rounded-tl-sm'
              }`}>
                {msg.content}
              </div>
              {msg.suggested_actions && msg.suggested_actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {msg.suggested_actions.map((action, j) => (
                    <button
                      key={j}
                      onClick={() => send(action)}
                      className="btn-secondary"
                      style={{ borderRadius: 999, padding: '6px 12px', fontSize: 12 }}
                    >
                      <Sparkles className="h-3 w-3" />
                      {action}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-4">
            <div className="h-8 w-8 rounded-full bg-card border border-line flex items-center justify-center">
              <Bot className="h-4 w-4 text-tx-muted" />
            </div>
            <div className="bg-card border border-line rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader2 className="h-4 w-4 text-acao animate-spin" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-6 border-t border-line">
        <div className="flex gap-3 bg-card border border-line rounded-xl p-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder={`Pergunte algo sobre ${selectedCompany.name}...`}
            className="flex-1 bg-transparent text-tx-strong placeholder-tx-muted text-sm outline-none"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="btn-primary h-9 w-9 p-0 justify-center"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

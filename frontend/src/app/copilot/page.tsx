'use client';
import { useState, useRef, useEffect } from 'react';
import axios from 'axios';
import { Send, Bot, User, Loader2, Sparkles } from 'lucide-react';

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
  const [messages, setMessages] = useState<Message[]>([
    {
      role: 'assistant',
      content: 'Olá! Sou o Copilot do Aura Accounting. Posso responder perguntas sobre finanças, impostos, lançamentos contábeis e muito mais. Como posso ajudar?',
      suggested_actions: STARTERS,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || loading) return;
    const userMsg: Message = { role: 'user', content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await axios.post(`${process.env.NEXT_PUBLIC_AI_URL}/api/v1/agents/copilot`, {
        company_id: 'company-demo-001',
        messages: [...messages, userMsg].map(m => ({ role: m.role, content: m.content })),
      });
      setMessages(prev => [
        ...prev,
        {
          role: 'assistant',
          content: res.data.message,
          suggested_actions: res.data.suggested_actions,
        },
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'assistant', content: 'Erro ao processar sua pergunta. Verifique a conexão com o servidor.' },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-6 border-b border-surface-border">
        <div className="h-10 w-10 rounded-xl bg-brand-500/20 flex items-center justify-center">
          <Bot className="h-5 w-5 text-brand-500" />
        </div>
        <div>
          <h1 className="text-white font-semibold">Copilot Financeiro</h1>
          <p className="text-xs text-gray-400">Powered by GPT-4o + RAG + Multi-Agent System</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-xs text-green-400">Online</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-4 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`h-8 w-8 rounded-full flex-shrink-0 flex items-center justify-center ${
              msg.role === 'user' ? 'bg-brand-500' : 'bg-surface-card border border-surface-border'
            }`}>
              {msg.role === 'user'
                ? <User className="h-4 w-4 text-white" />
                : <Bot className="h-4 w-4 text-brand-500" />}
            </div>
            <div className={`max-w-2xl ${msg.role === 'user' ? 'items-end' : 'items-start'} flex flex-col gap-2`}>
              <div className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-brand-500 text-white rounded-tr-sm'
                  : 'bg-surface-card border border-surface-border text-gray-100 rounded-tl-sm'
              }`}>
                {msg.content}
              </div>
              {msg.suggested_actions && msg.suggested_actions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {msg.suggested_actions.map((action, j) => (
                    <button
                      key={j}
                      onClick={() => send(action)}
                      className="flex items-center gap-1.5 text-xs bg-brand-500/10 border border-brand-500/30 text-brand-500 hover:bg-brand-500/20 px-3 py-1.5 rounded-full transition-colors"
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
            <div className="h-8 w-8 rounded-full bg-surface-card border border-surface-border flex items-center justify-center">
              <Bot className="h-4 w-4 text-brand-500" />
            </div>
            <div className="bg-surface-card border border-surface-border rounded-2xl rounded-tl-sm px-4 py-3">
              <Loader2 className="h-4 w-4 text-brand-500 animate-spin" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-6 border-t border-surface-border">
        <div className="flex gap-3 bg-surface-card border border-surface-border rounded-xl p-3">
          <input
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && send(input)}
            placeholder="Pergunte algo sobre suas finanças..."
            className="flex-1 bg-transparent text-white placeholder-gray-500 text-sm outline-none"
          />
          <button
            onClick={() => send(input)}
            disabled={loading || !input.trim()}
            className="h-9 w-9 rounded-lg bg-brand-500 hover:bg-brand-600 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center transition-colors"
          >
            <Send className="h-4 w-4 text-white" />
          </button>
        </div>
        <p className="text-xs text-gray-600 text-center mt-2">
          As respostas são baseadas no histórico financeiro da empresa via RAG
        </p>
      </div>
    </div>
  );
}

'use client';
import { useState } from 'react';
import { Plus, Trash2, ArrowLeft, Send, Calculator } from 'lucide-react';
import Link from 'next/link';
import { useCompany } from '@/contexts/CompanyContext';

type NFTipo = 'NF-e' | 'NFS-e' | 'NF-CE';

interface Item {
  id: string;
  descricao: string;
  quantidade: number;
  valorUnitario: number;
  ncmCfop: string;
  unidade: string;
}

const emptyItem = (): Item => ({
  id: crypto.randomUUID(),
  descricao: '',
  quantidade: 1,
  valorUnitario: 0,
  ncmCfop: '',
  unidade: 'UN',
});

export default function NovaNotaPage() {
  const { selectedCompany } = useCompany();
  const [tipo, setTipo] = useState<NFTipo>('NF-e');
  const [destinatario, setDestinatario] = useState({ nome: '', cnpjCpf: '', email: '', logradouro: '', bairro: '', municipio: '', uf: 'SP', cep: '' });
  const [itens, setItens] = useState<Item[]>([emptyItem()]);
  const [naturezaOp, setNaturezaOp] = useState('Prestação de Serviços');
  const [emitindo, setEmitindo] = useState(false);
  const [emitida, setEmitida] = useState(false);

  const updateItem = (id: string, field: keyof Item, value: any) => {
    setItens(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
  };

  const addItem = () => setItens(prev => [...prev, emptyItem()]);
  const removeItem = (id: string) => setItens(prev => prev.filter(i => i.id !== id));

  const subtotal = itens.reduce((s, i) => s + (i.quantidade * i.valorUnitario), 0);
  const aliqIss = tipo === 'NFS-e' ? 0.05 : 0;
  const aliqPis = 0.0065;
  const aliqCofins = 0.03;
  const aliqIcms = tipo === 'NF-e' ? 0.12 : 0;
  const iss = subtotal * aliqIss;
  const pis = subtotal * aliqPis;
  const cofins = subtotal * aliqCofins;
  const icms = subtotal * aliqIcms;
  const totalImpostos = iss + pis + cofins + icms;
  const total = subtotal;

  const emitir = async () => {
    if (!destinatario.nome || !destinatario.cnpjCpf) { alert('Preencha os dados do destinatário'); return; }
    setEmitindo(true);
    await new Promise(r => setTimeout(r, 1500));
    setEmitindo(false);
    setEmitida(true);
  };

  if (emitida) {
    return (
      <div className="p-8 flex flex-col items-center justify-center min-h-[60vh] gap-6">
        <div className="h-16 w-16 rounded-2xl bg-green-600/20 flex items-center justify-center">
          <Send className="h-8 w-8 text-ok" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-bold text-tx-strong mb-2">Nota Fiscal Emitida!</h2>
          <p className="text-tx-muted">A nota foi transmitida à SEFAZ e autorizada com sucesso.</p>
        </div>
        <div className="flex gap-3">
          <Link href="/fiscal" className="btn-ghost border border-line">← Voltar para Notas</Link>
          <button onClick={() => { setEmitida(false); setItens([emptyItem()]); setDestinatario({ nome: '', cnpjCpf: '', email: '', logradouro: '', bairro: '', municipio: '', uf: 'SP', cep: '' }); }} className="btn-primary">Nova Nota</button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <Link href="/fiscal" className="btn-ghost p-2"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <h1 className="text-2xl font-bold text-tx-strong">Emitir Nova Nota Fiscal</h1>
            {selectedCompany && <p className="text-tx-muted text-sm mt-1">{selectedCompany.name}</p>}
          </div>
        </div>
      </div>

      {/* Seção 1: Tipo */}
      <div className="card-aura space-y-4">
        <h2 className="text-base font-semibold text-tx-strong">1. Tipo de Nota</h2>
        <div className="flex gap-3">
          {(['NF-e', 'NFS-e', 'NF-CE'] as NFTipo[]).map(t => (
            <button key={t} onClick={() => setTipo(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${tipo === t ? 'bg-indigo-600 text-white border-indigo-600' : 'text-tx-muted border-line hover:border-indigo-500/50 hover:text-tx-strong'}`}>
              {t}
            </button>
          ))}
        </div>
        <div>
          <label className="block text-sm text-tx-muted mb-1.5">Natureza da Operação</label>
          <input value={naturezaOp} onChange={e => setNaturezaOp(e.target.value)}
            className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" />
        </div>
      </div>

      {/* Seção 2: Destinatário */}
      <div className="card-aura space-y-4">
        <h2 className="text-base font-semibold text-tx-strong">2. Destinatário</h2>
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label className="block text-sm text-tx-muted mb-1.5">Nome / Razão Social *</label>
            <input value={destinatario.nome} onChange={e => setDestinatario(d => ({ ...d, nome: e.target.value }))}
              className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="Empresa ABC Ltda" />
          </div>
          <div>
            <label className="block text-sm text-tx-muted mb-1.5">CNPJ / CPF *</label>
            <input value={destinatario.cnpjCpf} onChange={e => setDestinatario(d => ({ ...d, cnpjCpf: e.target.value }))}
              className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="00.000.000/0001-00" />
          </div>
          <div>
            <label className="block text-sm text-tx-muted mb-1.5">E-mail</label>
            <input type="email" value={destinatario.email} onChange={e => setDestinatario(d => ({ ...d, email: e.target.value }))}
              className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="contato@empresa.com.br" />
          </div>
          <div className="col-span-2">
            <label className="block text-sm text-tx-muted mb-1.5">Logradouro</label>
            <input value={destinatario.logradouro} onChange={e => setDestinatario(d => ({ ...d, logradouro: e.target.value }))}
              className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="Rua das Flores, 123" />
          </div>
          <div>
            <label className="block text-sm text-tx-muted mb-1.5">Município</label>
            <input value={destinatario.municipio} onChange={e => setDestinatario(d => ({ ...d, municipio: e.target.value }))}
              className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="São Paulo" />
          </div>
          <div>
            <label className="block text-sm text-tx-muted mb-1.5">UF</label>
            <select value={destinatario.uf} onChange={e => setDestinatario(d => ({ ...d, uf: e.target.value }))}
              className="w-full bg-inset border border-line rounded-lg px-3 py-2 text-tx-strong text-sm outline-none focus:border-indigo-500">
              {['SP','RJ','MG','RS','PR','SC','BA','GO','DF','PE','CE','ES','AM','PA','MA','RN','PB','AL','SE','PI','MT','MS','RO','TO','AC','AP','RR'].map(uf => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Seção 3: Itens */}
      <div className="card-aura space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-tx-strong">3. Itens / Serviços</h2>
          <button onClick={addItem} className="btn-ghost text-sm text-acao">
            <Plus className="h-4 w-4" /> Adicionar Item
          </button>
        </div>
        <div className="space-y-3">
          {itens.map((item, idx) => (
            <div key={item.id} className="grid grid-cols-12 gap-2 items-end p-3 bg-inset rounded-lg border border-line">
              <div className="col-span-5">
                {idx === 0 && <label className="block text-xs text-tx-muted mb-1">Descrição</label>}
                <input value={item.descricao} onChange={e => updateItem(item.id, 'descricao', e.target.value)}
                  className="w-full bg-card border border-line rounded px-2 py-1.5 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="Serviço de consultoria" />
              </div>
              <div className="col-span-1">
                {idx === 0 && <label className="block text-xs text-tx-muted mb-1">Qtd</label>}
                <input type="number" min="1" value={item.quantidade} onChange={e => updateItem(item.id, 'quantidade', parseFloat(e.target.value) || 1)}
                  className="w-full bg-card border border-line rounded px-2 py-1.5 text-tx-strong text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="col-span-1">
                {idx === 0 && <label className="block text-xs text-tx-muted mb-1">Un.</label>}
                <input value={item.unidade} onChange={e => updateItem(item.id, 'unidade', e.target.value)}
                  className="w-full bg-card border border-line rounded px-2 py-1.5 text-tx-strong text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="col-span-2">
                {idx === 0 && <label className="block text-xs text-tx-muted mb-1">Vl. Unitário</label>}
                <input type="number" min="0" step="0.01" value={item.valorUnitario} onChange={e => updateItem(item.id, 'valorUnitario', parseFloat(e.target.value) || 0)}
                  className="w-full bg-card border border-line rounded px-2 py-1.5 text-tx-strong text-sm outline-none focus:border-indigo-500" />
              </div>
              <div className="col-span-2">
                {idx === 0 && <label className="block text-xs text-tx-muted mb-1">NCM/CFOP</label>}
                <input value={item.ncmCfop} onChange={e => updateItem(item.id, 'ncmCfop', e.target.value)}
                  className="w-full bg-card border border-line rounded px-2 py-1.5 text-tx-strong text-sm outline-none focus:border-indigo-500" placeholder="5101" />
              </div>
              <div className="col-span-1 flex justify-center">
                <button onClick={() => removeItem(item.id)} disabled={itens.length === 1} className="btn-ghost p-1.5 text-err hover:text-err disabled:opacity-30">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Seção 4+5: Impostos + Total */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card-aura space-y-3">
          <h2 className="text-base font-semibold text-tx-strong flex items-center gap-2">
            <Calculator className="h-4 w-4 text-acao" />
            4. Impostos (calculados automaticamente)
          </h2>
          {[
            { label: 'ISS (5%)', valor: iss, show: tipo === 'NFS-e' },
            { label: 'ICMS (12%)', valor: icms, show: tipo === 'NF-e' },
            { label: 'PIS (0,65%)', valor: pis, show: true },
            { label: 'COFINS (3%)', valor: cofins, show: true },
          ].filter(t => t.show).map(t => (
            <div key={t.label} className="flex justify-between text-sm">
              <span className="text-tx-muted">{t.label}</span>
              <span className="text-tx-strong font-mono">{t.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
            </div>
          ))}
          <div className="flex justify-between text-sm pt-2 border-t border-line">
            <span className="text-tx-muted">Total Impostos</span>
            <span className="text-warn font-mono font-semibold">{totalImpostos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>
        </div>

        <div className="card-aura space-y-3">
          <h2 className="text-base font-semibold text-tx-strong">5. Resumo da Nota</h2>
          <div className="flex justify-between text-sm"><span className="text-tx-muted">Subtotal</span><span className="text-tx-strong font-mono">{subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
          <div className="flex justify-between text-sm"><span className="text-tx-muted">Impostos</span><span className="text-warn font-mono">+{totalImpostos.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span></div>
          <div className="flex justify-between text-lg font-bold pt-2 border-t border-line">
            <span className="text-tx-strong">TOTAL</span>
            <span className="text-acao font-mono">{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
          </div>
          <button onClick={emitir} disabled={emitindo} className="btn-primary w-full justify-center mt-4 text-base py-3">
            {emitindo ? (
              <span className="flex items-center gap-2"><svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>Emitindo...</span>
            ) : (
              <span className="flex items-center gap-2"><Send className="h-4 w-4" />Emitir Nota Fiscal</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

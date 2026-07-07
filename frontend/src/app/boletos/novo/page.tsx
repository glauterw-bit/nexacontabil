'use client';
import { useState } from 'react';
import { ArrowLeft, CreditCard, Loader2 } from 'lucide-react';
import Link from 'next/link';
import { useCompany } from '@/contexts/CompanyContext';
import { PageHeader, SectionTitle, COLORS, tint } from '@/components/ui/kit';

export default function NovoBoletoPage() {
  const { selectedCompany } = useCompany();
  const [form, setForm] = useState({
    pagador: '',
    cnpjCpf: '',
    email: '',
    valor: '',
    vencimento: '',
    instrucoes: '',
    descricao: '',
    multa: '2',
    juros: '1',
    desconto: '0',
  });
  const [gerado, setGerado] = useState(false);
  const [gerando, setGerando] = useState(false);

  const valorNum = parseFloat(form.valor) || 0;
  const fakeBarcode = form.pagador && form.valor ? '34191.09008 12345.678901 23456.789012 1 00000' + String(Math.round(valorNum * 100)).padStart(10, '0') : '';
  const fakeLinhaDigitavel = form.pagador && form.valor ? '34191090081234567890123456789012100000' + String(Math.round(valorNum * 100)).padStart(10, '0') : '';

  const gerar = async () => {
    if (!form.pagador || !form.valor || !form.vencimento) { alert('Preencha os campos obrigatórios'); return; }
    setGerando(true);
    await new Promise(r => setTimeout(r, 1200));
    setGerando(false);
    setGerado(true);
  };

  return (
    <div className="page-narrow">
      <PageHeader
        icon={<CreditCard size={22} color={COLORS.acao} />}
        title="Novo Boleto"
        subtitle={selectedCompany?.name}
        action={<Link href="/boletos" className="btn-secondary"><ArrowLeft className="h-4 w-4" /> Voltar</Link>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Form */}
        <div>
        <SectionTitle>Dados do Boleto</SectionTitle>
        <div className="card-aura space-y-4">
          <div>
            <label className="block text-sm text-tx-muted mb-1.5">Nome do Pagador *</label>
            <input value={form.pagador} onChange={e => setForm(f => ({ ...f, pagador: e.target.value }))}
              className="input-aura w-full" placeholder="Empresa ABC Ltda" />
          </div>
          <div>
            <label className="block text-sm text-tx-muted mb-1.5">CNPJ / CPF *</label>
            <input value={form.cnpjCpf} onChange={e => setForm(f => ({ ...f, cnpjCpf: e.target.value }))}
              className="input-aura w-full" placeholder="00.000.000/0001-00" />
          </div>
          <div>
            <label className="block text-sm text-tx-muted mb-1.5">E-mail</label>
            <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              className="input-aura w-full" placeholder="pagador@email.com" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-tx-muted mb-1.5">Valor (R$) *</label>
              <input type="number" min="0" step="0.01" value={form.valor} onChange={e => setForm(f => ({ ...f, valor: e.target.value }))}
                className="input-aura w-full" placeholder="1000.00" />
            </div>
            <div>
              <label className="block text-sm text-tx-muted mb-1.5">Vencimento *</label>
              <input type="date" value={form.vencimento} onChange={e => setForm(f => ({ ...f, vencimento: e.target.value }))}
                className="input-aura w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-tx-muted mb-1.5">Descrição</label>
            <input value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              className="input-aura w-full" placeholder="Honorários Contábeis — Mar/2026" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-sm text-tx-muted mb-1.5">Multa (%)</label>
              <input type="number" min="0" step="0.1" value={form.multa} onChange={e => setForm(f => ({ ...f, multa: e.target.value }))}
                className="input-aura w-full" />
            </div>
            <div>
              <label className="block text-sm text-tx-muted mb-1.5">Juros (%/mês)</label>
              <input type="number" min="0" step="0.1" value={form.juros} onChange={e => setForm(f => ({ ...f, juros: e.target.value }))}
                className="input-aura w-full" />
            </div>
            <div>
              <label className="block text-sm text-tx-muted mb-1.5">Desconto (%)</label>
              <input type="number" min="0" step="0.1" value={form.desconto} onChange={e => setForm(f => ({ ...f, desconto: e.target.value }))}
                className="input-aura w-full" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-tx-muted mb-1.5">Instruções ao Banco</label>
            <textarea value={form.instrucoes} onChange={e => setForm(f => ({ ...f, instrucoes: e.target.value }))} rows={3}
              className="input-aura w-full resize-none" placeholder="Ex: Após vencimento cobrar multa de 2% e juros de 1% ao mês." />
          </div>
          <button onClick={gerar} disabled={gerando} className="btn-primary w-full justify-center">
            {gerando ? (
              <span className="flex items-center gap-2"><Loader2 className="animate-spin h-4 w-4" />Gerando...</span>
            ) : (
              <span className="flex items-center gap-2"><CreditCard className="h-4 w-4" />Gerar Boleto</span>
            )}
          </button>
        </div>
        </div>

        {/* Preview */}
        <div>
        <SectionTitle>Preview do Boleto</SectionTitle>
        <div className="card-aura space-y-4">
          <div className="bg-white rounded-xl p-4 text-gray-900">
            <div className="flex items-center justify-between border-b-2 border-black pb-3 mb-3">
              <div>
                <p className="font-bold text-sm">{selectedCompany?.name || 'Aura Accounting'}</p>
                <p className="text-xs text-gray-500">{selectedCompany?.cnpj || '00.000.000/0001-00'}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-gray-500">Banco</p>
                <p className="font-bold">341-7</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs mb-3">
              <div><span className="text-gray-500">Pagador: </span><strong>{form.pagador || '—'}</strong></div>
              <div><span className="text-gray-500">CNPJ/CPF: </span><strong>{form.cnpjCpf || '—'}</strong></div>
              <div><span className="text-gray-500">Vencimento: </span><strong>{form.vencimento ? new Date(form.vencimento + 'T12:00:00').toLocaleDateString('pt-BR') : '—'}</strong></div>
              <div><span className="text-gray-500">Valor: </span><strong className="text-green-700">{valorNum > 0 ? valorNum.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '—'}</strong></div>
              {form.descricao && <div className="col-span-2"><span className="text-gray-500">Desc: </span>{form.descricao}</div>}
              {form.instrucoes && <div className="col-span-2 text-gray-500 text-[10px]">{form.instrucoes}</div>}
            </div>
            {fakeBarcode && (
              <div className="border-t border-gray-200 pt-3">
                <div className="flex gap-0.5 items-end h-12 mb-2">
                  {Array.from({ length: 80 }).map((_, i) => (
                    <div key={i} className="bg-black" style={{ width: Math.random() > 0.5 ? 2 : 1, height: Math.random() > 0.3 ? 48 : 36 }} />
                  ))}
                </div>
                <p className="text-[9px] font-mono text-center text-gray-600 break-all">{fakeLinhaDigitavel}</p>
              </div>
            )}
            {!fakeBarcode && (
              <div className="border-t border-gray-200 pt-3 text-center">
                <p className="text-xs text-gray-400">Preencha os dados para ver a pré-visualização</p>
                <div className="flex gap-0.5 items-end h-10 justify-center opacity-20 mt-2">
                  {Array.from({ length: 40 }).map((_, i) => (<div key={i} className="bg-gray-400" style={{ width: 2, height: Math.random() > 0.3 ? 40 : 28 }} />))}
                </div>
              </div>
            )}
          </div>
          {gerado && (
            <div className="flex items-center gap-2 text-sm text-ok rounded-lg px-3 py-2"
              style={{ background: tint(COLORS.ok, 10), border: `1px solid ${tint(COLORS.ok, 30)}` }}>
              <CreditCard className="h-4 w-4" />
              Boleto gerado com sucesso! Código de barras disponível.
            </div>
          )}
        </div>
        </div>
      </div>
    </div>
  );
}

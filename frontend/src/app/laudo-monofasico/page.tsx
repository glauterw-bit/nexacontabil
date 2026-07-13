'use client';
import { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { Printer, Loader2 } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return t ? { Authorization: `Bearer ${t}` } : {};
}
const BRL = (n: any) => (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataBR = (d: any) => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
const REG: Record<string, string> = { SIMPLES_NACIONAL: 'Simples Nacional', LUCRO_PRESUMIDO: 'Lucro Presumido', LUCRO_REAL: 'Lucro Real', MEI: 'MEI' };

function Laudo() {
  const params = useSearchParams();
  const companyId = params.get('companyId') ?? '';
  const [d, setD] = useState<any>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    if (!companyId) return;
    fetch(`${API}/api/v1/paineis/monofasico-cliente?companyId=${companyId}`, { headers: authHeaders() })
      .then((r) => r.ok ? r.json() : Promise.reject()).then(setD).catch(() => setErro('Não foi possível carregar o laudo.'));
  }, [companyId]);

  if (erro) return <div style={{ padding: 40 }}>{erro}</div>;
  if (!d) return <div style={{ display: 'flex', height: '60vh', alignItems: 'center', justifyContent: 'center' }}><Loader2 className="animate-spin" /></div>;

  const potencial = (d.recuperavelReais ?? 0) + (d.economiaSimplesAnoEstimada ?? 0);
  const hoje = new Date().toLocaleDateString('pt-BR');

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #laudo, #laudo * { visibility: visible !important; }
          #laudo { position: absolute; left: 0; top: 0; width: 100%; padding: 0 !important; }
          .no-print { display: none !important; }
          @page { margin: 18mm 16mm; }
        }
      `}</style>

      <div className="no-print" style={{ maxWidth: 820, margin: '12px auto', padding: '0 16px', display: 'flex', justifyContent: 'flex-end' }}>
        <button onClick={() => window.print()} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 10, background: 'var(--acao)', color: '#fff', border: 'none', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}>
          <Printer size={16} /> Imprimir / Salvar PDF
        </button>
      </div>

      <div id="laudo" style={{ maxWidth: 820, margin: '0 auto 40px', background: '#fff', color: '#1a1a1a', padding: 40, borderRadius: 8, fontFamily: 'Georgia, serif', lineHeight: 1.5 }}>
        {/* Cabeçalho */}
        <div style={{ borderBottom: '2px solid #1a1a1a', paddingBottom: 12, marginBottom: 20 }}>
          <div style={{ fontSize: 12, letterSpacing: 1, color: '#666', textTransform: 'uppercase' }}>Parecer técnico-tributário</div>
          <h1 style={{ fontSize: 22, margin: '4px 0 0', fontWeight: 700 }}>Oportunidade de Recuperação — PIS/COFINS Monofásico</h1>
          <div style={{ fontSize: 13, color: '#444', marginTop: 6 }}>Emitido em {hoje}</div>
        </div>

        {/* Identificação */}
        <table style={{ width: '100%', fontSize: 13.5, marginBottom: 20, borderCollapse: 'collapse' }}>
          <tbody>
            <tr><td style={{ padding: '3px 0', color: '#666', width: 140 }}>Empresa</td><td style={{ fontWeight: 700 }}>{d.empresa.nome}</td></tr>
            <tr><td style={{ padding: '3px 0', color: '#666' }}>CNPJ</td><td>{d.empresa.cnpj}</td></tr>
            <tr><td style={{ padding: '3px 0', color: '#666' }}>Regime</td><td>{REG[d.empresa.regime] ?? d.empresa.regime}{d.empresa.uf ? ` · ${d.empresa.uf}` : ''}</td></tr>
            <tr><td style={{ padding: '3px 0', color: '#666' }}>Produtos</td><td>{(d.grupos ?? []).join(', ') || '—'}</td></tr>
          </tbody>
        </table>

        {/* Resumo do potencial */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 6, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Potencial total</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#0a7d3f' }}>{BRL(potencial)}</div>
          </div>
          <div style={{ flex: 1, border: '1px solid #ddd', borderRadius: 6, padding: '12px 14px' }}>
            <div style={{ fontSize: 11, color: '#666', textTransform: 'uppercase' }}>Receita monofásica</div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>{BRL(d.valorMono)}</div>
            <div style={{ fontSize: 11, color: '#888' }}>{d.notasMono} notas</div>
          </div>
        </div>

        {/* Fundamentação */}
        <h2 style={{ fontSize: 15, borderBottom: '1px solid #ccc', paddingBottom: 4 }}>1. Fundamentação legal</h2>
        <p style={{ fontSize: 13.5 }}>
          Os produtos comercializados pela empresa estão sujeitos ao <b>regime monofásico</b> de PIS/COFINS
          ({(d.leis ?? []).join('; ') || 'legislação específica'}). Nesse regime, a contribuição é concentrada na
          indústria/importador e a <b>revenda é tributada à alíquota zero</b>. Portanto, o PIS/COFINS
          {d.simples ? ' embutido no DAS sobre essa receita' : ' recolhido sobre essas vendas'} pode ser
          {d.simples ? ' segregado' : ' recuperado'}, respeitado o prazo decadencial de 5 anos.
        </p>

        {/* Apuração */}
        <h2 style={{ fontSize: 15, borderBottom: '1px solid #ccc', paddingBottom: 4, marginTop: 18 }}>2. Apuração</h2>
        {d.simples ? (
          <p style={{ fontSize: 13.5 }}>
            Empresa do <b>Simples Nacional</b>: a economia se dá pela <b>segregação da receita monofásica no PGDAS-D</b>,
            reduzindo o percentual efetivo do DAS. Economia recorrente estimada em <b>{BRL(d.economiaSimplesAnoEstimada)}/ano</b>
            {' '}(estimativa pela faixa média do Anexo I — a confirmar pela faixa efetiva), além da restituição/compensação retroativa.
          </p>
        ) : (
          <p style={{ fontSize: 13.5 }}>
            Identificamos <b>{BRL(d.recuperavelReais)}</b> de PIS/COFINS destacado indevidamente na revenda de produtos
            monofásicos, passível de recuperação. Abaixo, as notas com recolhimento indevido:
          </p>
        )}

        {/* Notas */}
        {d.notas?.some((n: any) => n.recuperavel > 0) && (
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', marginTop: 8 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #999', textAlign: 'left' }}>
                <th style={{ padding: '4px 6px' }}>NF</th><th>Data</th>
                <th style={{ textAlign: 'right' }}>Valor monofásico</th>
                <th style={{ textAlign: 'right' }}>PIS+COFINS</th>
                <th style={{ textAlign: 'right' }}>Recuperável</th>
              </tr>
            </thead>
            <tbody>
              {d.notas.filter((n: any) => n.recuperavel > 0).slice(0, 40).map((n: any, i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '3px 6px' }}>{n.numero ?? '—'}</td>
                  <td>{dataBR(n.data)}</td>
                  <td style={{ textAlign: 'right' }}>{BRL(n.valorMono)}</td>
                  <td style={{ textAlign: 'right' }}>{n.pisCofinsPct ? `${n.pisCofinsPct}%` : '—'}</td>
                  <td style={{ textAlign: 'right', fontWeight: 700 }}>{BRL(n.recuperavel)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Conclusão */}
        <h2 style={{ fontSize: 15, borderBottom: '1px solid #ccc', paddingBottom: 4, marginTop: 18 }}>3. Recomendação</h2>
        <p style={{ fontSize: 13.5 }}>{d.acao}</p>

        <div style={{ marginTop: 30, paddingTop: 12, borderTop: '1px solid #ccc', fontSize: 11, color: '#888' }}>
          Documento gerado automaticamente a partir dos XMLs capturados. Os valores de "recuperável" derivam das notas fiscais
          reais; estimativas do Simples dependem da faixa efetiva do PGDAS. Recomenda-se validação do contador responsável
          antes do protocolo administrativo/judicial.
        </div>
      </div>
    </>
  );
}

export default function LaudoPage() {
  return <Suspense fallback={<div style={{ padding: 40 }}>Carregando…</div>}><Laudo /></Suspense>;
}

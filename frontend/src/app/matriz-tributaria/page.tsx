'use client';
import { useEffect, useState } from 'react';
import { Grid3x3, Search, Loader2, ShieldCheck } from 'lucide-react';
import { PageHeader, Card, COLORS, tint, Kpi } from '@/components/ui/kit';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}
const UFS = ['AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MG','MS','MT','PA','PB','PE','PI','PR','RJ','RN','RO','RR','RS','SC','SE','SP','TO'];
const pct = (n: any) => n == null ? '—' : `${n}%`;

export default function MatrizPage() {
  const [ncm, setNcm] = useState('');
  const [origem, setOrigem] = useState('SP');
  const [destino, setDestino] = useState('SP');
  const [importado, setImportado] = useState(false);
  const [d, setD] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [audit, setAudit] = useState<any>(null);
  const [ufs, setUfs] = useState<any[]>([]);
  const [editUf, setEditUf] = useState<string>('');
  const [editVal, setEditVal] = useState<string>('');

  function carregarUfs() {
    fetch(`${API}/api/v1/ncm-inteligente/aliquotas-uf`, { headers: authHeaders() }).then((r) => r.ok ? r.json() : []).then((x) => setUfs(Array.isArray(x) ? x : [])).catch(() => {});
  }
  useEffect(() => {
    fetch(`${API}/api/v1/ncm-inteligente/auditoria`, { headers: authHeaders() }).then((r) => r.ok ? r.json() : null).then(setAudit).catch(() => {});
    carregarUfs();
  }, []);

  async function salvarUf(uf: string) {
    const val = parseFloat(editVal.replace(',', '.'));
    if (isNaN(val)) { setEditUf(''); return; }
    await fetch(`${API}/api/v1/ncm-inteligente/aliquotas-uf`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ uf, aliquota: val }) });
    setEditUf(''); setEditVal(''); carregarUfs();
  }

  async function consultar() {
    const n = ncm.replace(/\D/g, '');
    if (n.length < 4) return;
    setLoading(true); setD(null);
    try {
      const r = await fetch(`${API}/api/v1/ncm-inteligente/matriz?ncm=${n}&origem=${origem}&destino=${destino}&importado=${importado ? 1 : 0}`, { headers: authHeaders() });
      if (r.ok) setD(await r.json());
    } catch {} finally { setLoading(false); }
  }

  return (
    <div className="page-narrow">
      <PageHeader icon={<Grid3x3 size={22} color={COLORS.acao} />} title="Matriz Tributária"
        subtitle="ICMS interno/interestadual, DIFAL, ST/CEST, IPI e PIS/COFINS (CST de entrada e saída) por NCM e rota. Interestadual e DIFAL são exatos por lei; internas por UF são atualizáveis." />

      {audit && (
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <Kpi label="Completude do Banco de NCM" value={`${audit.completude}%`} cor={audit.completude >= 80 ? COLORS.ok : COLORS.atencao} sub={`${audit.total} NCMs`} />
          <Kpi label="Com ST sem CEST" value={audit.semCest ?? 0} cor={COLORS.atencao} sub="revisar" />
          <Kpi label="Baixa confiança" value={audit.baixaConf ?? 0} cor={COLORS.atencao} sub="auditoria semanal" />
        </div>
      )}

      <Card style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr auto', gap: 10, alignItems: 'end' }}>
          <div>
            <label style={{ fontSize: 11, color: COLORS.faint, textTransform: 'uppercase' }}>NCM</label>
            <input value={ncm} onChange={(e) => setNcm(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && consultar()} placeholder="8708.99.90" className="input-aura" style={{ width: '100%', padding: '8px 10px', fontSize: 13 }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: COLORS.faint, textTransform: 'uppercase' }}>Origem</label>
            <select value={origem} onChange={(e) => setOrigem(e.target.value)} className="input-aura" style={{ width: '100%', padding: '8px', fontSize: 13 }}>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: COLORS.faint, textTransform: 'uppercase' }}>Destino</label>
            <select value={destino} onChange={(e) => setDestino(e.target.value)} className="input-aura" style={{ width: '100%', padding: '8px', fontSize: 13 }}>{UFS.map((u) => <option key={u}>{u}</option>)}</select>
          </div>
          <button onClick={consultar} disabled={loading} className="btn-primary">{loading ? <Loader2 size={16} className="animate-spin" /> : <Search size={15} />}</button>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 10, fontSize: 12.5, color: COLORS.muted, cursor: 'pointer' }}>
          <input type="checkbox" checked={importado} onChange={(e) => setImportado(e.target.checked)} /> Produto importado (conteúdo &gt; 40% → interestadual 4%)
        </label>
      </Card>

      {d && (
        <div style={{ display: 'grid', gap: 12 }}>
          {d.monofasico && (
            <div style={{ padding: '10px 14px', borderRadius: 9, background: tint(COLORS.ok, 8), border: `1px solid ${tint(COLORS.ok, 25)}`, fontSize: 13, color: COLORS.ok, display: 'flex', gap: 8, alignItems: 'center' }}>
              <ShieldCheck size={15} /> Monofásico ({d.monofasico}) — PIS/COFINS 0% na revenda.
            </div>
          )}
          <Bloco titulo="ICMS">
            <Linha k="Interna origem" v={pct(d.icms.internaOrigem)} />
            <Linha k="Interna destino" v={pct(d.icms.internaDestino)} />
            <Linha k="Operação" v={d.icms.operacao} />
            {d.icms.operacao === 'interestadual' && <Linha k="Interestadual" v={pct(d.icms.interestadual)} destaque />}
            {d.icms.difal != null && <Linha k="DIFAL (destino − interestadual)" v={pct(d.icms.difal)} destaque />}
            {d.icms.cst && <Linha k="CST ICMS" v={d.icms.cst} />}
          </Bloco>
          <Bloco titulo="Substituição Tributária (ST)">
            <Linha k="Tem ST" v={d.st.tem ? 'Sim' : 'Não'} />
            {d.st.tem && <Linha k="MVA" v={pct(d.st.mva)} />}
            {d.st.tem && <Linha k="CEST" v={d.st.cest ?? '— (informar)'} />}
          </Bloco>
          <Bloco titulo="IPI">
            <Linha k="Alíquota" v={pct(d.ipi.aliquota)} />
            {d.ipi.cst && <Linha k="CST IPI" v={d.ipi.cst} />}
          </Bloco>
          <Bloco titulo={`PIS/COFINS — ${d.pisCofins.regime}`}>
            <Linha k="Saída (revenda)" v={`CST ${d.pisCofins.saida.cst} · ${pct(d.pisCofins.saida.aliq)}`} />
            <Linha k="Entrada" v={`CST ${d.pisCofins.entrada.cst} · ${pct(d.pisCofins.entrada.aliq)}`} />
            {d.pisCofins.lei && <Linha k="Base legal" v={d.pisCofins.lei} />}
            {d.pisCofins.obs && <div style={{ fontSize: 12, color: COLORS.faint, marginTop: 4 }}>{d.pisCofins.obs}</div>}
          </Bloco>
          {!d.regraEncontrada && <p style={{ fontSize: 12, color: COLORS.atencao }}>NCM sem regra específica no Banco — ICMS/IPI/ST usam padrão. Rode "Aprender dos XMLs" ou cadastre.</p>}
          <p style={{ fontSize: 11, color: COLORS.faint }}>{d.fonteAliquotasInternas}</p>
        </div>
      )}

      {/* Banco de atualizações: alíquotas internas por UF, editáveis */}
      <details style={{ marginTop: 22 }}>
        <summary style={{ cursor: 'pointer', fontSize: 13, fontWeight: 600, color: COLORS.strong, marginBottom: 10 }}>
          Alíquotas internas por UF <span style={{ color: COLORS.faint, fontWeight: 400 }}>— banco atualizável (clique num valor p/ editar)</span>
        </summary>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {ufs.map((u) => (
            <div key={u.uf} onClick={() => { setEditUf(u.uf); setEditVal(String(u.aliquota)); }}
              style={{ padding: '8px 10px', borderRadius: 8, border: `1px solid ${u.editado ? tint(COLORS.acao, 35) : COLORS.border}`, background: u.editado ? tint(COLORS.acao, 6) : COLORS.surface, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}>
              <b style={{ color: COLORS.strong, width: 26 }}>{u.uf}</b>
              {editUf === u.uf ? (
                <input autoFocus value={editVal} onChange={(e) => setEditVal(e.target.value)} onBlur={() => salvarUf(u.uf)} onKeyDown={(e) => e.key === 'Enter' && salvarUf(u.uf)}
                  className="input-aura" style={{ width: 60, padding: '3px 6px', fontSize: 13 }} />
              ) : (
                <span className="num" style={{ color: u.editado ? COLORS.acao : COLORS.muted }}>{u.aliquota}%{u.editado && u.aliquota !== u.padrao ? ` (era ${u.padrao})` : ''}</span>
              )}
            </div>
          ))}
        </div>
        <p style={{ fontSize: 11, color: COLORS.faint, marginTop: 8 }}>A interestadual (4/7/12%) e o DIFAL são calculados por lei; estes valores internos alimentam o DIFAL e a operação interna.</p>
      </details>
    </div>
  );
}

function Bloco({ titulo, children }: any) {
  return (
    <Card>
      <div style={{ fontSize: 12, fontWeight: 700, color: COLORS.acao, textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: 8 }}>{titulo}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
    </Card>
  );
}
function Linha({ k, v, destaque }: { k: string; v: any; destaque?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '3px 0' }}>
      <span style={{ color: COLORS.muted }}>{k}</span>
      <span className="num" style={{ fontWeight: destaque ? 800 : 600, color: destaque ? COLORS.acao : COLORS.strong }}>{v}</span>
    </div>
  );
}

'use client';
import { useEffect, useState, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://backend-production-9eeec.up.railway.app';
function authHeaders(): Record<string, string> {
  const t = typeof window !== 'undefined' ? localStorage.getItem('aura_token') : null;
  return { 'Content-Type': 'application/json', ...(t ? { Authorization: `Bearer ${t}` } : {}) };
}

export default function WhatsappConectar() {
  const [st, setSt] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const carregar = useCallback(() => {
    fetch(`${API}/api/v1/whatsapp/evolution-status`, { headers: authHeaders() })
      .then((r) => r.json()).then(setSt).catch(() => setSt({ erro: 'sem resposta' })).finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    carregar();
    const t = setInterval(carregar, 12000); // QR expira — renova sozinho
    return () => clearInterval(t);
  }, [carregar]);

  const conectado = st?.estado === 'conectado';
  const qr = st?.qr && String(st.qr).startsWith('data:') ? st.qr : st?.qr ? `data:image/png;base64,${st.qr}` : null;

  return (
    <div className="wc-wrap">
      <h1>Conectar o WhatsApp do escritório</h1>
      <p className="wc-sub">Pareie o número do escritório uma única vez — depois, a cobrança sai do sistema com 1 clique ("Enviar agora" no Meu Dia e na Central).</p>

      {loading ? <div className="wc-box">Carregando…</div> : st?.erro ? (
        <div className="wc-box err"><b>Não conectado.</b><br />{st.erro}</div>
      ) : conectado ? (
        <div className="wc-box ok">
          <div className="wc-okicon">✓</div>
          <b>WhatsApp conectado!</b>
          <p>A instância <code>{st.instancia}</code> está pareada. O botão "📤 Enviar agora" já aparece nas telas de cobrança.</p>
        </div>
      ) : (
        <div className="wc-box">
          <ol className="wc-passos">
            <li>Abra o <b>WhatsApp</b> no celular do escritório</li>
            <li><b>Configurações → Aparelhos conectados → Conectar aparelho</b></li>
            <li>Aponte a câmera para o QR abaixo</li>
          </ol>
          {qr ? <img className="wc-qr" src={qr} alt="QR Code de pareamento" /> : <div className="wc-load">Gerando QR… (estado: {st?.estado ?? '…'})</div>}
          {st?.pairingCode ? <p className="wc-pair">Ou use o código: <b>{st.pairingCode}</b></p> : null}
          <p className="wc-hint">O QR renova sozinho a cada 12s. Assim que parear, esta tela confirma.</p>
        </div>
      )}

      <style jsx global>{`
.wc-wrap{max-width:560px;margin:0 auto;padding:32px 22px 80px;color:#1C1917;font-size:14px;text-align:center}
.wc-wrap h1{font-size:22px;font-weight:700}
.wc-sub{color:#57534E;margin:10px auto 24px;max-width:460px;line-height:1.55}
.wc-box{background:#fff;border:1px solid #E7E5E4;border-radius:18px;padding:28px;box-shadow:0 1px 3px rgba(28,25,23,.05)}
.wc-box.err{border-color:#E11D48;color:#9F1239;background:#FFF1F2}
.wc-box.ok{border-color:#059669;background:#ECFDF5;color:#065F46}
.wc-okicon{width:54px;height:54px;border-radius:50%;background:#059669;color:#fff;font-size:28px;display:flex;align-items:center;justify-content:center;margin:0 auto 12px}
.wc-passos{text-align:left;max-width:340px;margin:0 auto 18px;color:#57534E;line-height:1.7;padding-left:20px}
.wc-qr{width:260px;height:260px;border:1px solid #E7E5E4;border-radius:14px;padding:10px;background:#fff}
.wc-load{padding:40px;color:#9C9791}
.wc-pair{margin-top:12px;color:#57534E}
.wc-hint{margin-top:14px;color:#9C9791;font-size:12px}
      `}</style>
    </div>
  );
}

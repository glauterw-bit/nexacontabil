#!/usr/bin/env bash
# Análise do conteúdo do drive da carteira — roda 100% via API pública do sistema.
# Cria uma conta técnica temporária (admin), lê os painéis/drive e imprime um resumo.
# Uso:  bash scripts/analise-drive.sh
set -euo pipefail

API="${API:-https://backend-production-9eeec.up.railway.app}"
EMAIL="analise.temp.$(date +%s)@nexacontabil.local"
PASS="Tmp-$(openssl rand -hex 6)"

echo "→ criando conta técnica temporária ($EMAIL)…"
REG=$(curl -s -X POST "$API/api/v1/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Analise Temp\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(printf '%s' "$REG" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('access_token') or d.get('token',''))" 2>/dev/null || true)
if [ -z "${TOKEN:-}" ]; then
  LOG=$(curl -s -X POST "$API/api/v1/auth/login" -H "Content-Type: application/json" \
    -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
  TOKEN=$(printf '%s' "$LOG" | python3 -c "import json,sys;d=json.load(sys.stdin);print(d.get('access_token') or d.get('token',''))" 2>/dev/null || true)
fi
[ -z "${TOKEN:-}" ] && { echo "!! não consegui autenticar. Resposta: $REG"; exit 1; }
H=(-H "Authorization: Bearer $TOKEN")

echo "==================== RESUMO PARA COLAR NO CHAT ===================="
echo "### conexões de drive"
curl -s "${H[@]}" "$API/api/v1/cloud/connections" | python3 -c "
import json,sys
try: d=json.load(sys.stdin)
except: print('(sem dados)'); sys.exit()
for c in (d if isinstance(d,list) else d.get('items',[])):
    print(f\"- {c.get('provider')} · {c.get('label')} · ativo={c.get('active')} · criada={str(c.get('createdAt'))[:10]}\")
"
echo "### progresso da varredura da carteira (analise-cliente)"
curl -s "${H[@]}" "$API/api/v1/analise-cliente/progresso"
echo ""
echo "### operação (competência atual) — semáforo, docs, declarações, inconsistências"
curl -s "${H[@]}" "$API/api/v1/paineis/operacao" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('competencia:', d.get('competencia'), '| mesProcessado:', d.get('mesProcessado'))
print('semaforo:', d.get('semaforo'))
print('documentos:', d.get('documentos'))
print('declaracoes:', d.get('declaracoes'))
print('inconsistencias:', d.get('inconsistencias'))
print('totalClientes:', d.get('totalClientes'))
cs=d.get('clientes',[])
print('--- por cliente (docs / declaração / inconsist.) ---')
for c in cs[:60]:
    print(f\"  {c.get('status','?')[:3]} | docs={c.get('docs',0):>5} | decl={'S' if c.get('declaracaoEntregue') else '-'} | inc={c.get('inconsistencias',0):>3} | {c.get('cliente','')[:40]}\")
print(f'(mostrando {min(60,len(cs))} de {len(cs)})')
"
echo "### faróis (risco & oportunidade)"
curl -s "${H[@]}" "$API/api/v1/paineis/farois" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('sublimiteSimples.emRisco:', (d.get('sublimiteSimples') or {}).get('emRisco'))
print('quedaFaturamento.emQueda:', (d.get('quedaFaturamento') or {}).get('emQueda'))
mo=d.get('monofasico') or {}; print('monofasico:', {k:mo.get(k) for k in ('valorTotal','notas','clientesAfetados')})
co=d.get('concentracao') or {}; print('concentracao top5/top10:', co.get('top5Pct'), co.get('top10Pct'))
"
echo "==================================================================="
echo "(conta técnica criada: $EMAIL — peça ao Claude o comando de remoção depois)"

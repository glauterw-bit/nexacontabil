#!/usr/bin/env bash
# NexaContábil — Investiga a fundo se existe QUALQUER dado de 2026 no drive.
# 1) varredura exaustiva do drive (por data de modificação) dos maiores clientes
# 2) diagnóstico do acervo já capturado (por tipo e por ano de emissão)
# Uso:  bash scripts/diagnostico-2026.sh
set -euo pipefail

API="${API:-https://backend-production-9eeec.up.railway.app}"
OUT="$(cd "$(dirname "$0")" && pwd)/dados"; mkdir -p "$OUT"
EMAIL="analise.temp.$(date +%s)@nexacontabil.local"; PASS="Tmp-$(openssl rand -hex 8)"
j(){ python3 -c "import json,sys;d=json.load(sys.stdin);$1" 2>/dev/null || true; }

echo "→ autenticando (conta temporária)…"
REG=$(curl -s -X POST "$API/api/v1/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Analise Temp\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(printf '%s' "$REG" | j "print(d.get('access_token') or d.get('token') or (d.get('data') or {}).get('access_token',''))")
[ -z "${TOKEN:-}" ] && TOKEN=$(curl -s -X POST "$API/api/v1/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | j "print(d.get('access_token') or d.get('token',''))")
[ -z "${TOKEN:-}" ] && { echo "!! falha auth: $REG"; exit 1; }
H="Authorization: Bearer $TOKEN"; echo "✓ ok"

echo ""
echo "════════ 1. VARREDURA EXAUSTIVA DO DRIVE (30 maiores clientes) ════════"
echo "   (procura QUALQUER .xml de 2026 por data de modificação, sem teto)"
curl -s -H "$H" "$API/api/v1/cloud/recencia?limit=30" > "$OUT/recencia.json"
printf '%s' "$(cat "$OUT/recencia.json")" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('   clientes varridos:', d.get('clientesVarridos'))
print('   >>> ARQUIVOS DE 2026 NO DRIVE:', d.get('arquivos2026Total'))
print('   distribuição por ano (modificação):')
for ano,n in sorted((d.get('geralPorAno') or {}).items()): print(f'      {ano}: {n}')
print('   por cliente (mais recente no drive):')
for c in (d.get('porCliente') or [])[:15]:
    if c.get('erro'): print(f\"      {c['cliente'][:38]:<40} ERRO: {c['erro'][:40]}\")
    else: print(f\"      {c['cliente'][:38]:<40} {c.get('totalArquivos',0):>5} xml | 2026={c.get('arquivos2026',0)} | recente={str(c.get('maisRecente'))[:10]}\")
" 2>/dev/null || head -c 400 "$OUT/recencia.json"

echo ""
echo "════════ 2. DIAGNÓSTICO DO ACERVO CAPTURADO ════════"
curl -s -H "$H" "$API/api/v1/analise-cliente/diagnostico" > "$OUT/diagnostico.json"
printf '%s' "$(cat "$OUT/diagnostico.json")" | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('   total capturado:', d.get('totalDocs'), '| sem data de emissão:', d.get('semData'))
print('   >>> DOCS COM EMISSÃO EM 2026:', d.get('docsDe2026'), '| emissão mais recente:', d.get('maxEmissao'))
print('   por tipo:', d.get('porTipo'))
print('   por ano de emissão:')
for ano,n in sorted((d.get('porAno') or {}).items()): print(f'      {ano}: {n}')
print('   15 mais recentes por ingestão (arquivo | tipo | emissão):')
for r in (d.get('recentesIngest') or []): print(f\"      {str(r.get('emissao')):<12} {r.get('tipo'):<6} {str(r.get('arquivo'))[:50]}\")
" 2>/dev/null || head -c 400 "$OUT/diagnostico.json"

echo ""
echo "════════════════════════════════════════════════════════════"
echo "PRONTO. Volte ao chat e diga: 'diagnóstico pronto'"
echo "════════════════════════════════════════════════════════════"

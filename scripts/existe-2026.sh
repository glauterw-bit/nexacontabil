#!/usr/bin/env bash
# NexaContábil — Resposta DEFINITIVA: existe QUALQUER coisa de 2026 na estrutura
# do drive? Varre TODOS os clientes, pasta por pasta, procurando pasta "2026" ou
# arquivo modificado em 2026. Em lotes pequenos (cabe no timeout). Via API pública.
# Uso:  bash scripts/existe-2026.sh
set -euo pipefail

API="${API:-https://backend-production-9eeec.up.railway.app}"
OUT="$(cd "$(dirname "$0")" && pwd)/dados"; mkdir -p "$OUT"
EMAIL="analise.temp.$(date +%s)@nexacontabil.local"; PASS="Tmp-$(openssl rand -hex 8)"
j(){ python3 -c "import json,sys;d=json.load(sys.stdin);$1" 2>/dev/null || true; }

echo "→ autenticando…"
REG=$(curl -s -X POST "$API/api/v1/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Analise Temp\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(printf '%s' "$REG" | j "print(d.get('access_token') or d.get('token') or (d.get('data') or {}).get('access_token',''))")
[ -z "${TOKEN:-}" ] && TOKEN=$(curl -s -X POST "$API/api/v1/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}" | j "print(d.get('access_token') or d.get('token',''))")
[ -z "${TOKEN:-}" ] && { echo "!! falha auth: $REG"; exit 1; }
H="Authorization: Bearer $TOKEN"; echo "✓ ok"

echo "→ varrendo a estrutura de TODOS os clientes (lotes de 10)…"
SKIP=0; TOTAL_COM=0; TOTAL_CLI=0
: > "$OUT/existe2026.log"
for i in $(seq 1 40); do
  R=$(curl -s -H "$H" "$API/api/v1/cloud/tem2026?skip=$SKIP&limit=10")
  # imprime os que TÊM 2026 e acumula
  printf '%s' "$R" | python3 -c "
import json,sys
d=json.load(sys.stdin)
for c in d.get('resultados',[]):
    if c.get('erro'):
        print(f\"   ! {c['cliente'][:34]:<36} ERRO: {c['erro'][:30]}\")
    elif c.get('tem2026'):
        p=','.join(c.get('pastas2026') or []) or (c.get('arquivo2026') or {}).get('name','')
        print(f\"   ✓ {c['cliente'][:34]:<36} TEM 2026 -> {str(p)[:40]}\")
" 2>/dev/null | tee -a "$OUT/existe2026.log"
  REST=$(printf '%s' "$R" | j "print(d.get('restantes','?'))")
  COM=$(printf '%s' "$R" | j "print(d.get('com2026NesteLote',0))")
  PROC=$(printf '%s' "$R" | j "print(d.get('processados',0))")
  TOTAL_COM=$(( TOTAL_COM + ${COM:-0} )); TOTAL_CLI=$(( TOTAL_CLI + ${PROC:-0} ))
  echo "   lote $i: +${PROC:-0} clientes · ${COM:-0} com 2026 · faltam ${REST:-?}"
  SKIP=$(( SKIP + ${PROC:-0} ))
  [ "${REST:-1}" = "0" ] && break
  [ "${PROC:-0}" = "0" ] && break
done

echo ""
echo "================================================================"
echo "RESULTADO: $TOTAL_CLI clientes varridos · $TOTAL_COM com QUALQUER coisa de 2026"
echo "================================================================"
echo "Volte ao chat e diga: 'existe 2026 pronto'"

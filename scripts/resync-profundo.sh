#!/usr/bin/env bash
# NexaContábil — RE-VARREDURA PROFUNDA: puxa os arquivos RECENTES (2025/2026) de
# TODA a carteira, agora que a coleta prioriza recência. Roda via API pública.
# Uso:  bash scripts/resync-profundo.sh
set -euo pipefail

API="${API:-https://backend-production-9eeec.up.railway.app}"
OUT="$(cd "$(dirname "$0")" && pwd)/dados"
mkdir -p "$OUT"
EMAIL="analise.temp.$(date +%s)@nexacontabil.local"
PASS="Tmp-$(openssl rand -hex 8)"
j() { python3 -c "import json,sys;d=json.load(sys.stdin);$1" 2>/dev/null || true; }

echo "→ conta técnica temporária"
REG=$(curl -s -X POST "$API/api/v1/auth/register" -H "Content-Type: application/json" \
  -d "{\"name\":\"Analise Temp (apagar)\",\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
TOKEN=$(printf '%s' "$REG" | j "print(d.get('access_token') or d.get('token') or (d.get('data') or {}).get('access_token',''))")
if [ -z "${TOKEN:-}" ]; then
  LOGN=$(curl -s -X POST "$API/api/v1/auth/login" -H "Content-Type: application/json" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}")
  TOKEN=$(printf '%s' "$LOGN" | j "print(d.get('access_token') or d.get('token',''))")
fi
[ -z "${TOKEN:-}" ] && { echo "!! falha auth: $REG"; exit 1; }
H="Authorization: Bearer $TOKEN"; echo "✓ autenticado"

# marca temporal do início: só re-varre quem ainda não foi tocado nesta rodada
DESDE=$(python3 -c "import datetime; print(datetime.datetime.utcnow().isoformat()+'Z')")
echo "→ re-varredura profunda de toda a carteira (pode levar alguns minutos)…"
TOTAL_NOVOS=0
for i in $(seq 1 60); do
  R=$(curl -s -X POST -H "$H" -H "Content-Type: application/json" \
      -d "{\"desde\":\"$DESDE\",\"limit\":8,\"maxFiles\":300}" "$API/api/v1/analise-cliente/resync")
  REST=$(printf '%s' "$R" | j "print(d.get('restantes','?'))")
  NOV=$(printf '%s' "$R" | j "print(d.get('novosDocs',0))")
  TOTAL_NOVOS=$(( TOTAL_NOVOS + ${NOV:-0} ))
  echo "   rodada $i: +${NOV:-0} docs novos · faltam ${REST:-?} clientes"
  [ "${REST:-1}" = "0" ] && break
done
echo "✓ re-varredura concluída — $TOTAL_NOVOS documentos novos capturados"

echo "→ recoletando dados atualizados…"
for EP in "paineis/operacao:operacao" "paineis/farois:farois" "paineis/gerencial:gerencial" \
          "analise-cliente/progresso:progresso" "fluxo/competencias:competencias" \
          "apuracao/overview:apuracao" "insights/overview:insights"; do
  curl -s -H "$H" "$API/api/v1/${EP%%:*}" > "$OUT/${EP##*:}.json" && echo "   ${EP##*:}.json ✓"
done
echo ""
echo "================================================================"
echo "PRONTO. $TOTAL_NOVOS docs novos. Volte ao chat e diga: 'resync feito'"
echo "================================================================"
